$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $Root 'dist'
$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ('autosimtrade-package-' + [guid]::NewGuid().ToString('N'))
$TempProject = Join-Path $Temp 'autosimtrade'
$Zip = Join-Path $Dist 'autosimtrade-portable.zip'

if (Test-Path $Temp) { Remove-Item -Path $Temp -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TempProject | Out-Null
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

$excludeDirs = @('\node_modules\', '\data\runs\', '\dist\')
$excludeFiles = @('\data\server.pid.json', '\data\server.out.log', '\data\server.err.log')

Get-ChildItem -Path $Root -Recurse -File | ForEach-Object {
  $full = $_.FullName
  $relative = $full.Substring($Root.Length)
  foreach ($dir in $excludeDirs) {
    if ($relative.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase)) { return }
  }
  foreach ($file in $excludeFiles) {
    if ($relative.Equals($file, [StringComparison]::OrdinalIgnoreCase)) { return }
  }
  $dest = Join-Path $TempProject $relative.TrimStart('\')
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  [System.IO.File]::Copy($full, $dest, $true)
}

$profileDir = Join-Path $TempProject 'data\profiles'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
'{"accounts":{}}' | Set-Content -Path (Join-Path $profileDir 'account-state.json') -Encoding UTF8

if (Test-Path $Zip) { Remove-Item -Path $Zip -Force }
Compress-Archive -Path $TempProject -DestinationPath $Zip -Force
Remove-Item -Path $Temp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Package created: $Zip"
