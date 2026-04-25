$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root 'data\server.pid.json'
$stopped = $false

if (Test-Path $PidFile) {
  try {
    $meta = Get-Content -Path $PidFile -Encoding UTF8 | ConvertFrom-Json
    $process = Get-Process -Id $meta.pid -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $meta.pid -Force -ErrorAction SilentlyContinue
      $stopped = $true
    }
  } catch {}
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

$rootNeedle = $Root.Replace('\', '\\')
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -match '^node(\.exe)?$' -and
    $_.CommandLine -and
    $_.CommandLine.Contains('server.js') -and
    $_.CommandLine.Contains($Root)
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $script:stopped = $true
  }

if ($stopped) {
  Write-Host 'AutoSimTrade stopped.'
} else {
  Write-Host 'AutoSimTrade was not running.'
}
