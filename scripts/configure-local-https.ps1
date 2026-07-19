[CmdletBinding()]
param(
    [string]$ProjectDir = (Get-Location).Path,
    [ValidateSet("Hosts", "Trust", "All")]
    [string]$Phase = "All"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Is-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

function Restart-AsAdministrator {
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", ('"{0}"' -f $PSCommandPath),
        "-ProjectDir", ('"{0}"' -f $ProjectDir),
        "-Phase", $Phase
    )

    $process = Start-Process powershell.exe `
        -Verb RunAs `
        -ArgumentList $arguments `
        -Wait `
        -PassThru

    exit $process.ExitCode
}

function Get-EnvValue([string]$path, [string]$key, [string]$fallback) {
    if (Test-Path $path) {
        foreach ($line in [System.IO.File]::ReadAllLines($path)) {
            if ($line -match "^\s*$([Regex]::Escape($key))\s*=(.*)$") {
                $value = $Matches[1].Trim()
                if (-not [string]::IsNullOrWhiteSpace($value)) {
                    return $value
                }
            }
        }
    }

    return $fallback
}

function Ensure-HostsEntry([string]$hostName) {
    $hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
    $content = [System.IO.File]::ReadAllText($hostsPath)
    $escaped = [Regex]::Escape($hostName)
    $pattern = "(?im)^\s*(127\.0\.0\.1|::1)\s+.*\b$escaped\b.*$"

    if ([Regex]::IsMatch($content, $pattern)) {
        return
    }

    Add-Content `
        -Path $hostsPath `
        -Value ("127.0.0.1`t" + $hostName) `
        -Encoding ASCII
}

function Enable-FirefoxSystemCertificates {
    $profilesRoot = Join-Path $env:APPDATA "Mozilla\Firefox\Profiles"

    if (-not (Test-Path $profilesRoot)) {
        return
    }

    $setting = 'user_pref("security.enterprise_roots.enabled", true);'
    $pattern = (
        '(?m)^\s*user_pref\(' +
        '"security\.enterprise_roots\.enabled",' +
        '\s*(true|false)\s*\);\s*$'
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)

    foreach (
        $profile in Get-ChildItem `
            -Path $profilesRoot `
            -Directory `
            -ErrorAction SilentlyContinue
    ) {
        $userJs = Join-Path $profile.FullName "user.js"
        $content = ""

        if (Test-Path $userJs) {
            $content = [System.IO.File]::ReadAllText($userJs)
        }

        if ([Regex]::IsMatch($content, $pattern)) {
            $content = [Regex]::Replace($content, $pattern, $setting)
        }
        else {
            if (
                $content.Length -gt 0 -and
                -not $content.EndsWith("`n")
            ) {
                $content += [Environment]::NewLine
            }

            $content += $setting + [Environment]::NewLine
        }

        [System.IO.File]::WriteAllText($userJs, $content, $encoding)
    }
}

if (-not (Is-Administrator)) {
    Restart-AsAdministrator
}

$ProjectDir = [System.IO.Path]::GetFullPath($ProjectDir)
$envPath = Join-Path $ProjectDir ".env.symbiosis"

if (-not (Test-Path $envPath)) {
    throw ".env.symbiosis was not found in $ProjectDir"
}

$outlineDomain = Get-EnvValue $envPath "OUTLINE_DOMAIN" "outline.qt.local"
$scheduleDomain = Get-EnvValue $envPath "SCHEDULE_DOMAIN" "schedule.qt.local"

if ($Phase -eq "Hosts" -or $Phase -eq "All") {
    Ensure-HostsEntry $outlineDomain
    Ensure-HostsEntry $scheduleDomain
    & ipconfig.exe /flushdns *> $null
    Write-Host "Local domains were added to the Windows hosts file."
}

if ($Phase -eq "Trust" -or $Phase -eq "All") {
    $certificateDir = Join-Path $ProjectDir ".symbiosis-https"
    $certificatePath = Join-Path $certificateDir "caddy-local-root.crt"

    New-Item `
        -ItemType Directory `
        -Path $certificateDir `
        -Force |
        Out-Null

    $copied = $false

    for ($attempt = 1; $attempt -le 60; $attempt++) {
        & docker cp `
            "outline-schedule-proxy:/data/caddy/pki/authorities/local/root.crt" `
            $certificatePath `
            *> $null

        if (
            $LASTEXITCODE -eq 0 -and
            (Test-Path $certificatePath)
        ) {
            $copied = $true
            break
        }

        Start-Sleep -Seconds 1
    }

    if (-not $copied) {
        throw "The Caddy root certificate could not be copied."
    }

    & certutil.exe -addstore -f Root $certificatePath | Out-Host

    if ($LASTEXITCODE -ne 0) {
        throw "The Caddy root certificate could not be trusted."
    }

    Enable-FirefoxSystemCertificates
    Write-Host "The local HTTPS certificate is trusted by Windows."
}
