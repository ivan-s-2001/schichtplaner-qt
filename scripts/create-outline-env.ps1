$ErrorActionPreference = "Stop"

$scheduleRoot = Split-Path -Parent $PSScriptRoot
$homeRoot = Split-Path -Parent $scheduleRoot
$outlineRoot = Join-Path $homeRoot "outline.qt.local"
$targetPath = Join-Path $outlineRoot ".env"
$symbiosisPath = Join-Path $scheduleRoot ".env.symbiosis"

if (-not (Test-Path (Join-Path $outlineRoot "package.json"))) {
    throw "Outline repository not found at $outlineRoot"
}

if (-not (Test-Path $symbiosisPath)) {
    throw ".env.symbiosis is missing. Run create-symbiosis-env.ps1 first."
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

function Ensure-Value([string]$key, [string]$value) {
    $current = Get-EnvValue $targetPath $key

    if ([string]::IsNullOrWhiteSpace($current)) {
        Set-EnvValue $targetPath $key $value
    }
}

$secretKey = Get-EnvValue $symbiosisPath "OUTLINE_SECRET_KEY"
$utilsSecret = Get-EnvValue $symbiosisPath "OUTLINE_UTILS_SECRET"

if ($secretKey -notmatch "^[0-9a-fA-F]{64}$") {
    throw "OUTLINE_SECRET_KEY must contain exactly 64 hexadecimal characters."
}

if ([string]::IsNullOrWhiteSpace($utilsSecret)) {
    throw "OUTLINE_UTILS_SECRET is missing."
}

if (-not (Test-Path $targetPath)) {
    [System.IO.File]::WriteAllText(
        $targetPath,
        "",
        (New-Object System.Text.UTF8Encoding($false))
    )
}

$currentSecret = Get-EnvValue $targetPath "SECRET_KEY"
if (
    -not [string]::IsNullOrWhiteSpace($currentSecret) -and
    $currentSecret -ne $secretKey
) {
    throw (
        "Outline SECRET_KEY differs from OUTLINE_SECRET_KEY. " +
        "Refusing to rotate the encryption key automatically."
    )
}

$currentUtilsSecret = Get-EnvValue $targetPath "UTILS_SECRET"
if (
    -not [string]::IsNullOrWhiteSpace($currentUtilsSecret) -and
    $currentUtilsSecret -ne $utilsSecret
) {
    throw (
        "Outline UTILS_SECRET differs from OUTLINE_UTILS_SECRET. " +
        "Refusing to replace it automatically."
    )
}

Set-EnvValue $targetPath "SECRET_KEY" $secretKey
Set-EnvValue $targetPath "UTILS_SECRET" $utilsSecret

Ensure-Value "NODE_ENV" "production"
Ensure-Value "DEFAULT_LANGUAGE" "en_US"
Ensure-Value "SMTP_HOST" "mailpit"
Ensure-Value "SMTP_PORT" "1025"
Ensure-Value "SMTP_SECURE" "false"
Ensure-Value "SMTP_USERNAME" ""
Ensure-Value "SMTP_PASSWORD" ""
Ensure-Value "SMTP_FROM_EMAIL" "Outline <outline@local.test>"
Ensure-Value "SMTP_REPLY_EMAIL" "Outline <outline@local.test>"

Write-Host "Prepared $targetPath without rotating existing Outline secrets."
