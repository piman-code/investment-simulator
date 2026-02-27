param(
  [Parameter(Mandatory=$true)]
  [string]$Task,
  [switch]$SafeMode
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$modeArgs = @()
if ($SafeMode) {
  $modeArgs = @('-a','on-request','--sandbox','workspace-write')
} else {
  $modeArgs = @('--full-auto')
}

Write-Host "[Codex] Working dir: $PSScriptRoot" -ForegroundColor Cyan
Write-Host "[Codex] Task: $Task" -ForegroundColor Yellow

codex exec @modeArgs --cd "$PSScriptRoot" "$Task"

Write-Host "`n[Git] Current status" -ForegroundColor Green
git -C "$PSScriptRoot" status --short
