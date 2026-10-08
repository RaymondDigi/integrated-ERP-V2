[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
    $releaseRoot = Join-Path $projectRoot 'releases'
    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    $version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $archivePath = Join-Path $releaseRoot "Integrated-ERP-$version-windows-iis-$timestamp.zip"
    Compress-Archive -Path (Join-Path $projectRoot 'dist/*') -DestinationPath $archivePath
    $checksum = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    "$($checksum.Hash)  $(Split-Path -Leaf $archivePath)" | Set-Content -LiteralPath "$archivePath.sha256" -Encoding ASCII
    Write-Output "Deployment package: $archivePath"
    Write-Output "SHA256: $($checksum.Hash)"
} finally {
    Pop-Location
}
