$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $root ".env.symbiosis.example"
$targetPath = Join-Path $root ".env.symbiosis"
$outlineRoot = Join-Path (Split-Path -Parent $root) "outline.qt.local"
$outlineEnvPath = Join-Path $outlineRoot ".env"

if (-not (Test-Path $templatePath)) {
    throw "Template not found: $templatePath"
}

function New-HexSecret([int]$bytes = 32) {
    $buffer = New-Object byte[] $bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $generator.GetBytes($buffer)
    }
    finally {
        $generator.Dispose()
    }

    return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-EnvValue([string]$path, [string]$key) {
    if (-not (Test-Path $path)) {
        return $null
    }

    foreach ($line in [System.IO.File]::ReadAllLines($path)) {
        if ($line -match "^\s*$([Regex]::Escape($key))\s*=(.*)$") {
            return $Matches[1].Trim()
        }
    }

    return $null
}

function Set-EnvValue([string]$path, [string]$key, [string]$value) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $content = [System.IO.File]::ReadAllText($path)
    $pattern = "(?m)^\s*#?\s*$([Regex]::Escape($key))\s*=.*$"
    $replacement = "$key=$value"

    if ([Regex]::IsMatch($content, $pattern)) {
        $content = [Regex]::Replace($content, $pattern, $replacement, 1)
    }
    else {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
            $content += [Environment]::NewLine
        }

        $content += $replacement + [Environment]::NewLine
    }

    [System.IO.File]::WriteAllText($path, $content, $encoding)
}

function Ensure-Value(
    [string]$key,
    [string]$defaultValue,
    [string[]]$replaceValues = @()
) {
    $current = Get-EnvValue $targetPath $key

    if (
        [string]::IsNullOrWhiteSpace($current) -or
        $replaceValues -contains $current
    ) {
        Set-EnvValue $targetPath $key $defaultValue
    }
}

function Ensure-Secret(
    [string]$key,
    [int]$bytes,
    [string]$fallback = ""
) {
    $current = Get-EnvValue $targetPath $key
    $isPlaceholder = (
        [string]::IsNullOrWhiteSpace($current) -or
        $current -match "^(change-me|replace-with-)"
    )

    if (-not $isPlaceholder) {
        return
    }

    if (-not [string]::IsNullOrWhiteSpace($fallback)) {
        Set-EnvValue $targetPath $key $fallback
        return
    }

    Set-EnvValue $targetPath $key (New-HexSecret $bytes)
}

if (-not (Test-Path $targetPath)) {
    Copy-Item $templatePath $targetPath
}

$existingOutlineSecret = Get-EnvValue $outlineEnvPath "SECRET_KEY"
if ($existingOutlineSecret -notmatch "^[0-9a-fA-F]{64}$") {
    $existingOutlineSecret = ""
}

$existingOutlineUtilsSecret = Get-EnvValue $outlineEnvPath "UTILS_SECRET"

Ensure-Value "OUTLINE_DOMAIN" "outline.qt.local"
Ensure-Value "OUTLINE_URL" "https://outline.qt.local" @("http://localhost:3000")
Ensure-Value "OUTLINE_PORT" "3000"
Ensure-Value "OUTLINE_DEFAULT_LANGUAGE" "en_US"
Ensure-Value "SCHEDULE_DOMAIN" "schedule.qt.local"
Ensure-Value "SCHEDULE_URL" "https://schedule.qt.local" @("http://localhost:41873")
Ensure-Value "SCHEDULE_PORT" "41873"
Ensure-Value "MAILPIT_PORT" "8025"

Ensure-Secret "POSTGRES_PASSWORD" 24
Ensure-Secret "OUTLINE_SECRET_KEY" 32 $existingOutlineSecret
Ensure-Secret "OUTLINE_UTILS_SECRET" 32 $existingOutlineUtilsSecret
Ensure-Secret "NEXTAUTH_SECRET" 32
Ensure-Secret "SCHEDULE_SSO_SECRET" 32

Write-Host "Prepared $targetPath with stable Docker secrets."
