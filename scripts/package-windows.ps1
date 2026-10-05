[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'build/bin'
$executable = Join-Path $outputDirectory 'ApiTester.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'Missing build/bin/ApiTester.exe. Run the Wails build first.'
}

# A new private staging directory and explicit allowlist keep user data out.
$stage = Join-Path $outputDirectory ('.package-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    Copy-Item -LiteralPath $executable -Destination $stage
    Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/USER_GUIDE.zh-CN.md') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $projectRoot 'CHANGELOG.md') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $stage
    $licenses = Join-Path $stage 'licenses'
    New-Item -ItemType Directory -Path $licenses | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'frontend/src/assets/fonts/OFL.txt') -Destination (Join-Path $licenses 'fonts-OFL.txt')
    $goRoot = (& go env GOROOT)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot locate Go license.' }
    Copy-Item -LiteralPath (Join-Path $goRoot 'LICENSE') -Destination (Join-Path $licenses 'Go-LICENSE.txt')
    $modules = @(& go list -m -f '{{.Path}}|{{.Dir}}' all)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate module licenses.' }
    foreach ($module in $modules) {
        $parts = $module -split '\|', 2
        if ($parts.Count -ne 2 -or -not $parts[1] -or $parts[0] -eq 'apitester') { continue }
        $moduleName = $parts[0] -replace '[^a-zA-Z0-9._-]', '_'
        foreach ($file in (Get-ChildItem -LiteralPath $parts[1] -File)) {
            if ($file.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$') {
                Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $licenses ($moduleName + '-' + $file.Name))
            }
        }
    }
    $archivePath = Join-Path $outputDirectory 'ApiTester-windows-amd64.zip'
    $packageFiles = @(Get-ChildItem -LiteralPath $stage | ForEach-Object { $_.FullName })
    Compress-Archive -LiteralPath $packageFiles -DestinationPath $archivePath -Force
    $digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksum = "$digest  ApiTester-windows-amd64.zip`n"
    [System.IO.File]::WriteAllText((Join-Path $outputDirectory 'SHA256SUMS.txt'), $checksum, [System.Text.UTF8Encoding]::new($false))
    Write-Output "Packaged: $archivePath"
    Write-Output "SHA256: $digest"
} finally {
    $resolvedStage = [System.IO.Path]::GetFullPath($stage)
    $allowedPrefix = [System.IO.Path]::GetFullPath($outputDirectory) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedStage.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to remove a staging directory outside build/bin.'
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
