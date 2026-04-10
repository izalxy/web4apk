# ============================================
# Web4APK Gen 4 - Complete Setup Script
# For Windows PowerShell (Run as Administrator)
# ============================================

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           Web4APK Gen 4 - Complete Setup Script                ║" -ForegroundColor Cyan
Write-Host "║                    Windows PowerShell                         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$script:HasErrors = $false
$script:StartTime = Get-Date

# Navigate to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

# Helper function to log errors
function Write-ErrorLog {
    param($Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
    $script:HasErrors = $true
}

function Write-Success {
    param($Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "  ⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param($Message)
    Write-Host "  ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Step {
    param($Message)
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  $Message" -ForegroundColor Magenta
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Check if running as Administrator
if (-not (Test-Administrator)) {
    Write-Warning "This script requires Administrator privileges!"
    Write-Info "Please run PowerShell as Administrator and try again."
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# ============================================
# PART 1: Install Node.js Dependencies
# ============================================

Write-Step "PART 1: Installing Node.js Dependencies"

# Check if Node.js is installed
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-ErrorLog "Node.js not found!"
    Write-Host ""
    Write-Info "Please install Node.js 18+ from: https://nodejs.org/"
    Write-Host "  Run the installer and restart this script." -ForegroundColor Cyan
    exit 1
}
Write-Success "Node.js $nodeVersion"

# Check npm version
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-ErrorLog "npm not found!"
    exit 1
}
Write-Success "npm v$npmVersion"

# Check if package.json exists
Write-Host "[3/5] Checking package.json..." -ForegroundColor Yellow
if (-not (Test-Path "package.json")) {
    Write-ErrorLog "package.json not found!"
    Write-Info "Make sure you're in the correct directory"
    exit 1
}
Write-Success "package.json found"

# Install npm dependencies
Write-Host "[4/5] Installing npm dependencies..." -ForegroundColor Yellow
Write-Host "  This may take a few minutes..." -ForegroundColor Gray
npm install --silent 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Warning "npm install had issues, trying with --force..."
    npm install --force --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorLog "Failed to install npm dependencies!"
        Write-Info "Try running: npm install manually"
    } else {
        Write-Success "Dependencies installed (with force)"
    }
} else {
    Write-Success "Dependencies installed"
}

# Install sharp for image processing
Write-Host "[5/5] Installing sharp for image processing..." -ForegroundColor Yellow
npm install sharp --silent 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Success "Sharp installed"
} else {
    Write-Warning "Sharp installation failed, custom icons will be disabled"
}

# ============================================
# PART 2: Setup Android SDK
# ============================================

Write-Step "PART 2: Setting up Android SDK"

# Define paths
$AndroidHome = "$env:LOCALAPPDATA\Android\Sdk"
$CmdlineToolsDir = "$AndroidHome\cmdline-tools"
$LatestToolsDir = "$CmdlineToolsDir\latest"
$toolsZip = "$env:TEMP\cmdline-tools.zip"
$downloadUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

# Check for Java
Write-Host "[1/7] Checking for Java (JDK 11+)..." -ForegroundColor Yellow
try {
    $javaVersion = (java -version 2>&1) | Select-String -Pattern "version"
    if ($javaVersion) {
        Write-Success "Java found: $javaVersion"
    } else {
        throw "Java not found"
    }
}
catch {
    Write-ErrorLog "Java not found!"
    Write-Host ""
    Write-Info "Please install OpenJDK 17 or later from:"
    Write-Host "  https://adoptium.net/" -ForegroundColor Cyan
    Write-Host "  https://www.oracle.com/java/technologies/downloads/" -ForegroundColor Cyan
    Write-Host ""
    Write-Warning "After installing Java, restart this script"
    exit 1
}

# Create directories
Write-Host "[2/7] Creating Android SDK directories..." -ForegroundColor Yellow
try {
    if (-not (Test-Path $LatestToolsDir)) {
        New-Item -ItemType Directory -Force -Path $LatestToolsDir | Out-Null
        Write-Success "Directories created"
    } else {
        Write-Success "Directories already exist"
    }
}
catch {
    Write-ErrorLog "Failed to create directories: $_"
}

# Check if SDK is already installed
Write-Host "[3/7] Checking existing SDK installation..." -ForegroundColor Yellow
if (Test-Path "$AndroidHome\platform-tools") {
    Write-Success "Android SDK already installed"
    $sdkExists = $true
} else {
    $sdkExists = $false
    Write-Info "Android SDK not found, will download..."
}

# Download command-line tools if needed
if (-not $sdkExists) {
    Write-Host "[4/7] Downloading Android SDK command-line tools..." -ForegroundColor Yellow
    Write-Host "  This may take a few minutes..." -ForegroundColor Gray

    if (Test-Path $toolsZip) {
        Remove-Item $toolsZip -Force -ErrorAction SilentlyContinue
    }

    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($downloadUrl, $toolsZip)
        
        if (Test-Path $toolsZip) {
            $fileSize = (Get-Item $toolsZip).Length / 1MB
            Write-Success "Downloaded ($([math]::Round($fileSize, 2)) MB)"
        } else {
            throw "Download failed"
        }
    }
    catch {
        Write-ErrorLog "Download failed: $_"
        Write-Host ""
        Write-Info "Please download manually from:"
        Write-Host "  $downloadUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Info "Extract to: $LatestToolsDir" -ForegroundColor Cyan
        Write-Warning "Continuing with manual setup required"
    }

    # Extract
    Write-Host "[5/7] Extracting tools..." -ForegroundColor Yellow
    if (Test-Path $toolsZip) {
        try {
            if (Test-Path $LatestToolsDir) {
                Remove-Item $LatestToolsDir -Recurse -Force -ErrorAction SilentlyContinue
            }
            
            $tempExtract = "$env:TEMP\android-sdk-extract"
            if (Test-Path $tempExtract) {
                Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
            }
            
            Expand-Archive -Path $toolsZip -DestinationPath $tempExtract -Force
            
            $sourcePath = "$tempExtract\cmdline-tools"
            if (Test-Path $sourcePath) {
                Move-Item -Path "$sourcePath\*" -Destination $LatestToolsDir -Force
            } else {
                Move-Item -Path "$tempExtract\*" -Destination $LatestToolsDir -Force
            }
            
            Remove-Item $toolsZip -Force -ErrorAction SilentlyContinue
            Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
            
            Write-Success "Extracted successfully"
        }
        catch {
            Write-ErrorLog "Extraction failed: $_"
        }
    }
}

# Install SDK components
Write-Host "[6/7] Installing SDK components..." -ForegroundColor Yellow
if (Test-Path "$LatestToolsDir\bin\sdkmanager.bat") {
    try {
        Write-Host "  Accepting Android licenses..." -ForegroundColor Gray
        $tempLicenseResponse = "$env:TEMP\license-response.txt"
        "Y" * 100 | Out-File -FilePath $tempLicenseResponse -Encoding ascii
        
        & "$LatestToolsDir\bin\sdkmanager.bat" --licenses < $tempLicenseResponse 2>&1 | Out-Null
        Remove-Item $tempLicenseResponse -Force -ErrorAction SilentlyContinue
        
        Write-Host "  Installing build-tools and platforms..." -ForegroundColor Gray
        & "$LatestToolsDir\bin\sdkmanager.bat" `
            "build-tools;34.0.0" `
            "platforms;android-34" `
            "platform-tools" `
            "emulator" 2>&1 | Out-Null
        
        Write-Success "SDK components installed"
    }
    catch {
        Write-Warning "Failed to install SDK components automatically: $_"
        Write-Info "Run manually: $LatestToolsDir\bin\sdkmanager.bat --licenses"
    }
} else {
    Write-Warning "sdkmanager not found, skipping automatic SDK setup"
}

# Set environment variables
Write-Host "[7/7] Setting environment variables..." -ForegroundColor Yellow
try {
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $AndroidHome, "User")
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $AndroidHome, "User")
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $sdkPaths = "$AndroidHome\cmdline-tools\latest\bin;$AndroidHome\platform-tools"
    
    if ($currentPath -notlike "*cmdline-tools*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$sdkPaths", "User")
    }
    
    $env:ANDROID_HOME = $AndroidHome
    $env:ANDROID_SDK_ROOT = $AndroidHome
    $env:Path = "$env:Path;$sdkPaths"
    
    Write-Success "Environment variables set"
    Write-Info "ANDROID_HOME = $AndroidHome"
}
catch {
    Write-Warning "Could not set environment variables: $_"
    Write-Info "Please set ANDROID_HOME manually: $AndroidHome"
}

# ============================================
# PART 3: Setup Flutter SDK (Optional)
# ============================================

Write-Step "PART 3: Setting up Flutter SDK (Optional)"

$FlutterHome = "$env:LOCALAPPDATA\flutter"
$FlutterZip = "$env:TEMP\flutter.zip"
$FlutterUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.24.0-stable.zip"

Write-Host "[1/5] Checking for existing Flutter installation..." -ForegroundColor Yellow

if (Get-Command flutter -ErrorAction SilentlyContinue) {
    $flutterVersion = flutter --version 2>&1 | Select-String -Pattern "Flutter"
    Write-Success "Flutter already installed: $flutterVersion"
}
else {
    Write-Host "[2/5] Downloading Flutter SDK..." -ForegroundColor Yellow
    Write-Host "  This may take several minutes..." -ForegroundColor Gray
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($FlutterUrl, $FlutterZip)
        
        if (Test-Path $FlutterZip) {
            $fileSize = (Get-Item $FlutterZip).Length / 1MB
            Write-Success "Downloaded ($([math]::Round($fileSize, 2)) MB)"
        } else {
            throw "Download failed"
        }
        
        Write-Host "[3/5] Extracting Flutter SDK..." -ForegroundColor Yellow
        
        $extractPath = Split-Path $FlutterHome -Parent
        if (Test-Path $FlutterHome) {
            Remove-Item $FlutterHome -Recurse -Force -ErrorAction SilentlyContinue
        }
        
        Expand-Archive -Path $FlutterZip -DestinationPath $extractPath -Force
        Remove-Item $FlutterZip -Force -ErrorAction SilentlyContinue
        
        Write-Success "Flutter extracted to $FlutterHome"
        
        Write-Host "[4/5] Adding Flutter to PATH..." -ForegroundColor Yellow
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $flutterBin = "$FlutterHome\bin"
        
        if ($currentPath -notlike "*flutter*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$flutterBin", "User")
            $env:Path = "$env:Path;$flutterBin"
        }
        
        Write-Success "Flutter added to PATH"
        
        Write-Host "[5/5] Running flutter doctor..." -ForegroundColor Yellow
        & "$flutterBin\flutter.bat" doctor 2>&1 | Out-Null
        Write-Success "Flutter configured"
    }
    catch {
        Write-Warning "Could not install Flutter automatically: $_"
        Write-Info "Please install Flutter manually from: https://flutter.dev/docs/get-started/install"
    }
}

# ============================================
# PART 4: Create .env file
# ============================================

Write-Step "PART 4: Creating Configuration File"

$envExample = ".env.example"
$envFile = ".env"

Write-Host "[1/2] Checking for .env file..." -ForegroundColor Yellow

if (Test-Path $envFile) {
    Write-Success ".env file already exists"
} else {
    Write-Host "[2/2] Creating .env from example..." -ForegroundColor Yellow
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Success ".env file created"
        Write-Warning "Please edit .env and add your BOT_TOKEN"
    } else {
        Write-ErrorLog ".env.example not found!"
        Write-Info "Creating default .env file..."
        @"
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_IDS=123456789

# Web Server Configuration
WEB_PORT=3000
WEB_HOST=0.0.0.0

# Channel Membership (Optional)
REQUIRED_CHANNEL=

# Database Path
DB_PATH=./users.json
"@ | Out-File -FilePath $envFile -Encoding utf8
        Write-Success ".env file created with defaults"
        Write-Warning "Please edit .env and add your BOT_TOKEN"
    }
}

# ============================================
# PART 5: Create required directories
# ============================================

Write-Step "PART 5: Creating Required Directories"

$directories = @(
    "temp",
    "output",
    "logs",
    "sessions",
    "backups",
    "Q U A N T U M"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Success "Created directory: $dir"
    } else {
        Write-Info "Directory already exists: $dir"
    }
}

# ============================================
# COMPLETE
# ============================================

$script:EndTime = Get-Date
$duration = ($script:EndTime - $script:StartTime).TotalMinutes

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                     SETUP COMPLETE!                            ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "⏱️  Setup completed in $([math]::Round($duration, 1)) minutes" -ForegroundColor Cyan
Write-Host ""

Write-Host "📁 Environment Variables:" -ForegroundColor Cyan
Write-Host "  ANDROID_HOME = $AndroidHome" -ForegroundColor Yellow
Write-Host "  FLUTTER_HOME = $FlutterHome" -ForegroundColor Yellow
Write-Host ""

Write-Host "⚠️  IMPORTANT: Restart your terminal for changes to take effect!" -ForegroundColor Yellow
Write-Host ""

Write-Host "✅ Verify installations:" -ForegroundColor Cyan
Write-Host "  flutter doctor" -ForegroundColor White
Write-Host "  sdkmanager --list" -ForegroundColor White
Write-Host "  node --version" -ForegroundColor White
Write-Host ""

Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env and add your BOT_TOKEN" -ForegroundColor White
Write-Host "  2. Start bot: npm run dev" -ForegroundColor White
Write-Host "  3. Open dashboard: http://localhost:3000" -ForegroundColor White
Write-Host ""

if ($script:HasErrors) {
    Write-Host "⚠️  Some warnings occurred during setup." -ForegroundColor Yellow
    Write-Host "    Please review the messages above." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")