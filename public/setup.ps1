param([string]$Token, [string]$Url)
$ErrorActionPreference = "Stop"
$dir = "wispr-agent"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   WISPR Agent - Windows Setup Initializing" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

if(!(Test-Path $dir)) { 
    Write-Host "Creating directory: $dir"
    New-Item -ItemType Directory -Path $dir 
}
Set-Location $dir

$files = @(
  "agent.js", "package.json", "config.js", 
  "controllers/appium-controller.js", "controllers/device-controller.js", "controllers/emulator-controller.js",
  "services/recording-service.js", "services/replay-engine.js", "services/screenshot-service.js",
  "utils/adb-utils.js", "utils/process-manager.js", "README.md", "Dockerfile"
)

foreach($f in $files) {
  $target = $f -replace "/", "\"
  $parent = Split-Path $target -Parent
  if($parent -and !(Test-Path $parent)) { 
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Write-Host "Downloading: $f"
  Invoke-WebRequest -Uri "$Url/agent-package/$f" -OutFile $target
}

Write-Host "`nInstalling dependencies... (this may take a minute)" -ForegroundColor Yellow
npm install

Write-Host "`nStarting WISPR Agent..." -ForegroundColor Green
$env:WISPR_API_TOKEN = $Token
npm start
