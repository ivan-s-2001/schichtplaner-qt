$ErrorActionPreference = "Stop"

$scheduleRoot = Split-Path -Parent $PSScriptRoot
$homeRoot = Split-Path -Parent $scheduleRoot
$outlineRoot = Join-Path $homeRoot "outline.qt.local"
$targetPath = Join-Path $outlineRoot ".env"

if (-not (Test-Path (Join-Path $outlineRoot "package.json"))) {
    throw "Outline repository not found at $outlineRoot"
}

if (Test-Path $targetPath) {
    Write-Host "Outline .env already exists: $targetPath"
    exit 0
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

$content = @"
NODE_ENV=production
SECRET_KEY=$(New-HexSecret 32)
UTILS_SECRET=$(New-HexSecret 32)
DEFAULT_LANGUAGE=en_US

SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=Outline <outline@local.test>
SMTP_REPLY_EMAIL=Outline <outline@local.test>
"@

[System.IO.File]::WriteAllText(
    $targetPath,
    $content.TrimStart(),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Created $targetPath for the Docker-only installation."
