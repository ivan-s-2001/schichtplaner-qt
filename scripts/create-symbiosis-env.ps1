$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $root ".env.symbiosis.example"
$targetPath = Join-Path $root ".env.symbiosis"

if (Test-Path $targetPath) {
    Write-Host ".env.symbiosis already exists."
    exit 0
}

function New-HexSecret([int]$bytes = 32) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

$content = Get-Content $templatePath -Raw
$content = $content -replace '(?m)^SCHEDULE_SSO_SECRET=.*$', "SCHEDULE_SSO_SECRET=$(New-HexSecret 32)"
$content = $content -replace '(?m)^NEXTAUTH_SECRET=.*$', "NEXTAUTH_SECRET=$(New-HexSecret 32)"

[System.IO.File]::WriteAllText(
    $targetPath,
    $content,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Created $targetPath with random scheduling secrets."
