param(
    [string]$Time = "02:15",
    [string]$TaskName = "WalletTrails Analytics"
)

$ErrorActionPreference = "Stop"
$cmd = (Resolve-Path (Join-Path $PSScriptRoot "run-analytics.cmd")).Path
& schtasks.exe /Create /F /TN $TaskName /SC DAILY /ST $Time /RL LIMITED /TR "`"$cmd`""
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
Write-Host "Registered '$TaskName' every day at $Time."
Write-Host "The task runs only while this user is logged on."
Write-Host "Run it once now: schtasks /Run /TN `"$TaskName`""
Write-Host "Remove it: schtasks /Delete /TN `"$TaskName`" /F"
