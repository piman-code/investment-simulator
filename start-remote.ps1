param(
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Get-CommandSafe($name) {
  try { return (Get-Command $name -ErrorAction Stop).Source } catch { return $null }
}

if (-not (Get-CommandSafe cloudflared)) {
  Write-Host "cloudflared가 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "설치: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}

$pythonCmd = if (Get-CommandSafe python) { 'python' } elseif (Get-CommandSafe py) { 'py -3' } else { $null }
if (-not $pythonCmd) {
  Write-Host "Python이 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "설치: winget install Python.Python.3.12" -ForegroundColor Yellow
  exit 1
}

Write-Host "[1/2] 로컬 서버 시작: http://localhost:$Port" -ForegroundColor Cyan
$serverCmd = "Set-Location '$PSScriptRoot'; $pythonCmd -m http.server $Port"
$serverProc = Start-Process powershell -ArgumentList '-NoProfile','-NoExit','-Command',$serverCmd -PassThru

Start-Sleep -Seconds 2

Write-Host "[2/2] Cloudflare Tunnel 시작 중..." -ForegroundColor Cyan
Write-Host "아래에 표시되는 https://*.trycloudflare.com 링크를 모바일에서 열면 됩니다." -ForegroundColor Green
Write-Host "종료: 이 창에서 Ctrl+C, 그리고 http.server 창도 닫기" -ForegroundColor Yellow

cloudflared tunnel --url "http://localhost:$Port"
