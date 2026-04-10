#!/bin/bash

# ============================================
# Web4APK Gen 4 - VPS Setup Script
# For Ubuntu/Debian VPS
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

# Variables
START_TIME=$(date +%s)
HAS_ERRORS=false

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                       $1${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}  ✅ $1${NC}"
}

print_error() {
    echo -e "${RED}  ❌ $1${NC}"
    HAS_ERRORS=true
}

print_warning() {
    echo -e "${YELLOW}  ⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}  ℹ️  $1${NC}"
}

print_value() {
    echo -e "  ${CYAN}$1${NC}: ${YELLOW}$2${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root is not recommended. Continuing anyway..."
fi

print_header "Web4APK Gen 4 - VPS Setup Script"

# ============================================
# PART 1: System Update & Dependencies
# ============================================

print_step "PART 1: Updating System & Installing Dependencies"

echo -e "${BLUE}[1/4] Updating package list...${NC}"
sudo apt update -qq

echo -e "${BLUE}[2/4] Upgrading packages...${NC}"
sudo apt upgrade -y -qq

echo -e "${BLUE}[3/4] Installing essential dependencies...${NC}"
sudo apt install -y -qq \
    curl \
    wget \
    git \
    unzip \
    zip \
    build-essential \
    lib32z1 \
    lib32stdc++6 \
    xz-utils \
    libglu1-mesa \
    clang \
    cmake \
    ninja-build \
    pkg-config \
    libgtk-3-dev \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

echo -e "${BLUE}[4/4] Installing additional tools...${NC}"
sudo apt install -y -qq htop nginx ufw fail2ban

print_success "System updated and dependencies installed"

# ============================================
# PART 2: Node.js Installation
# ============================================

print_step "PART 2: Installing Node.js 20.x LTS"

if command_exists node; then
    NODE_VERSION=$(node -v | tr -d 'v')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    if [ $NODE_MAJOR -ge 18 ]; then
        print_success "Node.js already installed (v$NODE_VERSION)"
    else
        print_warning "Node.js version $NODE_VERSION detected, upgrading..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
        print_success "Node.js upgraded to $(node -v)"
    fi
else
    echo -e "${BLUE}Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    print_success "Node.js $(node -v) installed"
fi

print_value "npm" "v$(npm -v)"

# ============================================
# PART 3: Java & Gradle
# ============================================

print_step "PART 3: Installing Java 17 & Gradle"

if command_exists java; then
    JAVA_VERSION=$(java -version 2>&1 | head -n1 | grep -oP '(?<=version ")[^"]+' | cut -d. -f1)
    if [ $JAVA_VERSION -ge 11 ]; then
        print_success "Java already installed ($(java -version 2>&1 | head -n1))"
    else
        print_warning "Old Java version detected, installing Java 17..."
        sudo apt install -y openjdk-17-jdk
        print_success "Java 17 installed"
    fi
else
    echo -e "${BLUE}Installing Java 17...${NC}"
    sudo apt install -y openjdk-17-jdk
    print_success "Java 17 installed ($(java -version 2>&1 | head -n1))"
fi

# Set JAVA_HOME
if [ -z "$JAVA_HOME" ]; then
    JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
    if ! grep -q "export JAVA_HOME" ~/.bashrc; then
        echo "export JAVA_HOME=$JAVA_HOME" >> ~/.bashrc
    fi
    print_success "JAVA_HOME set to $JAVA_HOME"
fi

# Install Gradle
GRADLE_VERSION="8.7"
if command_exists gradle; then
    CURRENT_GRADLE=$(gradle -v 2>/dev/null | grep Gradle | awk '{print $2}')
    if [[ "$CURRENT_GRADLE" == "$GRADLE_VERSION" ]]; then
        print_success "Gradle $CURRENT_GRADLE already installed"
    else
        print_warning "Gradle $CURRENT_GRADLE detected, upgrading to $GRADLE_VERSION..."
        cd /tmp
        wget -q "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -O gradle.zip
        sudo unzip -q -d /opt gradle.zip
        sudo ln -sf /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/bin/gradle
        rm gradle.zip
        print_success "Gradle $GRADLE_VERSION installed"
    fi
else
    echo -e "${BLUE}Installing Gradle $GRADLE_VERSION...${NC}"
    cd /tmp
    wget -q "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -O gradle.zip
    sudo unzip -q -d /opt gradle.zip
    sudo ln -sf /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/bin/gradle
    rm gradle.zip
    print_success "Gradle $GRADLE_VERSION installed"
fi

print_value "Gradle" "$(gradle -v 2>/dev/null | grep Gradle | awk '{print $2}')"

# ============================================
# PART 4: Android SDK
# ============================================

print_step "PART 4: Setting up Android SDK"

ANDROID_HOME=/opt/android-sdk
sudo mkdir -p $ANDROID_HOME/cmdline-tools
cd $ANDROID_HOME/cmdline-tools

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
    SDK_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
elif [ "$ARCH" = "x86_64" ]; then
    SDK_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
else
    SDK_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
fi

if [ ! -d "latest" ]; then
    echo -e "${BLUE}Downloading Android SDK command-line tools...${NC}"
    sudo wget -q --show-progress "$SDK_URL" -O tools.zip
    sudo unzip -q tools.zip
    
    if [ -d "cmdline-tools" ]; then
        sudo mv cmdline-tools latest
    else
        sudo mkdir -p latest
        sudo mv * latest/ 2>/dev/null || true
    fi
    sudo rm -f tools.zip
    print_success "Android SDK command-line tools installed"
else
    print_success "Android SDK already installed"
fi

sudo chmod -R 755 $ANDROID_HOME

# Set ANDROID_HOME
export ANDROID_HOME=$ANDROID_HOME
if ! grep -q "export ANDROID_HOME" ~/.bashrc; then
    echo "export ANDROID_HOME=$ANDROID_HOME" >> ~/.bashrc
fi

# Add to PATH
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
if ! grep -q "ANDROID_HOME/cmdline-tools" ~/.bashrc; then
    echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
fi

# Install SDK components
echo -e "${BLUE}Installing SDK components (this may take a few minutes)...${NC}"

# Accept licenses
echo -e "${BLUE}  Accepting Android licenses...${NC}"
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null 2>&1 || true

# Install required components
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
    "platforms;android-34" \
    "platforms;android-33" \
    "build-tools;34.0.0" \
    "build-tools;33.0.0" \
    "platform-tools" \
    "emulator" > /dev/null 2>&1

print_success "Android SDK components installed"

# Install NDK for Flutter
echo -e "${BLUE}  Installing NDK (for Flutter native plugins)...${NC}"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "ndk;27.0.12077973" > /dev/null 2>&1
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973
if ! grep -q "export ANDROID_NDK_HOME" ~/.bashrc; then
    echo "export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973" >> ~/.bashrc
fi
print_success "NDK 27.0.12077973 installed"

# ============================================
# PART 5: Flutter SDK
# ============================================

print_step "PART 5: Installing Flutter SDK"

FLUTTER_HOME=/opt/flutter

# Install Flutter dependencies
sudo apt install -y curl git xz-utils libglu1-mesa clang cmake ninja-build pkg-config libgtk-3-dev

if [ ! -d "$FLUTTER_HOME" ]; then
    echo -e "${BLUE}Cloning Flutter SDK (this may take a few minutes)...${NC}"
    sudo git clone https://github.com/flutter/flutter.git -b stable --depth 1 $FLUTTER_HOME
    sudo chmod -R 755 $FLUTTER_HOME
    print_success "Flutter SDK installed"
else
    print_success "Flutter SDK already installed"
fi

# Add Flutter to PATH
export PATH=$PATH:$FLUTTER_HOME/bin
if ! grep -q "export FLUTTER_HOME" ~/.bashrc; then
    echo "export FLUTTER_HOME=$FLUTTER_HOME" >> ~/.bashrc
    echo 'export PATH=$PATH:$FLUTTER_HOME/bin' >> ~/.bashrc
fi

# Pre-download Dart SDK
echo -e "${BLUE}Pre-downloading Dart SDK...${NC}"
flutter precache --android > /dev/null 2>&1 || true

print_value "Flutter" "$(flutter --version 2>/dev/null | head -n1 | awk '{print $2}')"

# ============================================
# PART 6: Install Project Dependencies
# ============================================

print_step "PART 6: Installing Project Dependencies"

if [ -f "package.json" ]; then
    echo -e "${BLUE}Installing npm packages...${NC}"
    npm install --silent 2>&1 || {
        print_warning "npm install failed, trying with --force..."
        npm install --force --silent 2>&1
    }
    print_success "npm packages installed"
    
    # Install sharp for image processing
    echo -e "${BLUE}Installing sharp for image processing...${NC}"
    npm install sharp --silent 2>&1
    print_success "Sharp installed"
else
    print_warning "package.json not found in current directory"
    print_info "Make sure to run this script from your project root"
fi

# ============================================
# PART 7: PM2 & Firewall Setup
# ============================================

print_step "PART 7: PM2 & Firewall Setup"

if command_exists pm2; then
    print_success "PM2 already installed"
else
    echo -e "${BLUE}Installing PM2 globally...${NC}"
    sudo npm install -g pm2
    print_success "PM2 installed"
fi

print_value "PM2" "v$(pm2 -v 2>/dev/null || echo 'installed')"

# Setup firewall
echo -e "${BLUE}Configuring UFW firewall...${NC}"
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 3000/tcp comment 'Web4APK Dashboard'
sudo ufw --force enable
print_success "Firewall configured"

# Create systemd service for PM2
echo -e "${BLUE}Setting up PM2 startup...${NC}"
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
print_success "PM2 startup configured"

# ============================================
# PART 8: Final Configuration
# ============================================

print_step "PART 8: Final Configuration"

# Create required directories
mkdir -p temp output logs sessions backups "Q U A N T U M"
print_success "Required directories created"

# Create .env file if not exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success ".env file created from example"
        print_warning "Please edit .env and add your BOT_TOKEN"
    else
        echo -e "${BLUE}Creating default .env file...${NC}"
        cat > .env << EOF
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_IDS=123456789

# Web Server Configuration
WEB_PORT=3000
WEB_HOST=0.0.0.0
WEB_URL=http://localhost:3000

# Channel Membership (Optional)
REQUIRED_CHANNEL=

# Database Path
DB_PATH=./users.json
EOF
        print_success ".env file created with defaults"
        print_warning "Please edit .env and add your BOT_TOKEN"
    fi
else
    print_success ".env file already exists"
fi

# Source bashrc to apply changes
source ~/.bashrc 2>/dev/null || true

# Calculate total time
END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))
MINUTES=$((TOTAL_TIME / 60))
SECONDS=$((TOTAL_TIME % 60))

# ============================================
# COMPLETE
# ============================================

print_header "VPS Setup Complete!"

echo -e "${CYAN}📦 Installed Components:${NC}"
echo ""
print_value "Node.js" "$(node -v)"
print_value "npm" "v$(npm -v)"
print_value "Java" "$(java -version 2>&1 | head -n1 | cut -d'"' -f2)"
print_value "Gradle" "$(gradle -v 2>/dev/null | grep Gradle | awk '{print $2}')"
print_value "Flutter" "$(flutter --version 2>/dev/null | head -n1 | awk '{print $2}')"
print_value "PM2" "$(pm2 -v 2>/dev/null)"
print_value "Android SDK" "$ANDROID_HOME"
print_value "NDK" "$ANDROID_NDK_HOME"
echo ""

echo -e "${CYAN}⏱️  Setup completed in ${MINUTES}m ${SECONDS}s${NC}"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANT: Run this command to apply PATH changes:${NC}"
echo -e "${GREEN}  source ~/.bashrc${NC}"
echo ""

echo -e "${CYAN}✅ Verify installations:${NC}"
echo "  flutter doctor"
echo "  gradle -v"
echo "  java -version"
echo "  node --version"
echo ""

echo -e "${CYAN}📋 Next steps:${NC}"
echo "  1. cd $(pwd)"
echo "  2. nano .env  # Add your BOT_TOKEN"
echo "  3. npm start  # Run bot"
echo "  4. pm2 start src/bot.js --name web4apk  # Run with PM2"
echo ""

echo -e "${CYAN}🔧 Useful PM2 commands:${NC}"
echo "  pm2 list                 # List all processes"
echo "  pm2 logs web4apk         # View logs"
echo "  pm2 restart web4apk      # Restart bot"
echo "  pm2 stop web4apk         # Stop bot"
echo "  pm2 monit                # Monitor resources"
echo ""

echo -e "${CYAN}🌐 Dashboard Access:${NC}"
echo "  Local:   http://localhost:3000"
echo "  Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""

if [ "$HAS_ERRORS" = true ]; then
    echo -e "${YELLOW}⚠️  Some warnings occurred during setup.${NC}"
    echo -e "${YELLOW}    Please review the messages above.${NC}"
    echo ""
fi

print_success "Setup completed successfully by @Izalmodz! 🚀"