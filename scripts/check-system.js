#!/usr/bin/env node
/**
 * System Check Script for Web4APK Bot
 * For VPS/Windows - Run BEFORE npm install to check system compatibility
 * 
 * Usage: node scripts/check-system.js
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Colors for terminal
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
};

function log(color, text) {
    console.log(`${color}${text}${colors.reset}`);
}

function checkCommand(cmd) {
    try {
        const isWindows = process.platform === 'win32';
        const checkCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
        execSync(checkCmd, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function getCommandVersion(cmd, args = '--version') {
    try {
        const output = execSync(`${cmd} ${args} 2>&1`, { stdio: 'pipe', encoding: 'utf8' });
        const lines = output.split('\n');
        return lines[0].trim();
    } catch {
        return null;
    }
}

function getGradleVersion() {
    try {
        const output = execSync('gradle --version 2>&1', { stdio: 'pipe', encoding: 'utf8' });
        const match = output.match(/Gradle (\d+\.\d+(?:\.\d+)?)/);
        return match ? `Gradle ${match[1]}` : output.split('\n')[0].trim();
    } catch {
        return null;
    }
}

function getJavaVersion() {
    try {
        const output = execSync('java -version 2>&1', { stdio: 'pipe', encoding: 'utf8' });
        const match = output.match(/version "([^"]+)"/);
        return match ? `JDK ${match[1]}` : output.split('\n')[0].trim();
    } catch {
        return null;
    }
}

function getNodeVersion() {
    try {
        const output = execSync('node --version', { stdio: 'pipe', encoding: 'utf8' });
        return output.trim();
    } catch {
        return null;
    }
}

function getNpmVersion() {
    try {
        const output = execSync('npm --version', { stdio: 'pipe', encoding: 'utf8' });
        return `v${output.trim()}`;
    } catch {
        return null;
    }
}

function getGitVersion() {
    try {
        const output = execSync('git --version', { stdio: 'pipe', encoding: 'utf8' });
        return output.trim().replace('git version', '');
    } catch {
        return null;
    }
}

console.log('\n');
log(colors.cyan, '╔════════════════════════════════════════════════════════════════════╗');
log(colors.cyan, '║                    🔍 WEB4APK SYSTEM CHECK                         ║');
log(colors.cyan, '║                     VPS / Windows Compatibility                    ║');
log(colors.cyan, '╚════════════════════════════════════════════════════════════════════╝');
console.log('');

// ============ SYSTEM INFO ============
log(colors.bright + colors.blue, '📱 SYSTEM INFORMATION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const arch = os.arch();
const platform = os.platform();
const cpus = os.cpus();
const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
const hostname = os.hostname();
const uptime = Math.floor(os.uptime() / 3600);

const isWindows = platform === 'win32';
const isLinux = platform === 'linux';
const isMac = platform === 'darwin';

// Architecture mapping
const archMap = {
    'arm': 'ARM 32-bit (armv7l)',
    'arm64': 'ARM 64-bit (aarch64)',
    'x64': 'x86 64-bit (amd64)',
    'x86': 'x86 32-bit',
    'ia32': 'x86 32-bit'
};

// Platform mapping
const platformMap = {
    'win32': 'Windows',
    'linux': 'Linux',
    'darwin': 'macOS'
};

console.log(`  🖥️  Hostname     : ${colors.yellow}${hostname}${colors.reset}`);
console.log(`  💿 Platform    : ${platformMap[platform] || platform}`);
console.log(`  🏗️  Architecture: ${colors.yellow}${archMap[arch] || arch}${colors.reset}`);
console.log(`  🧠 CPU         : ${cpus[0]?.model || 'Unknown'}`);
console.log(`  🔢 CPU Cores   : ${cpus.length}`);
console.log(`  🧮 Total RAM   : ${totalMem} GB`);
console.log(`  📊 Free RAM    : ${freeMem} GB`);
console.log(`  ⏱️  Uptime      : ${uptime} hours`);

// RAM check
const ramGB = parseFloat(totalMem);
if (ramGB < 2) {
    log(colors.yellow, `  ⚠️  Warning: Low RAM (${totalMem} GB). Builds may be slow or fail.`);
    console.log(`     💡 Consider adding swap: sudo fallocate -l 4G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`);
} else if (ramGB >= 4) {
    log(colors.green, `  ✓ RAM is sufficient for builds`);
}

console.log('');

// ============ ARCHITECTURE CHECK ============
log(colors.bright + colors.blue, '🏗️  ARCHITECTURE COMPATIBILITY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (arch === 'x64' || arch === 'x86' || arch === 'ia32') {
    log(colors.green, `  ✓ ${archMap[arch] || arch}`);
    console.log('     ✅ Full compatibility with all libraries');
    console.log('     ✅ Optimized for VPS/Desktop builds');
} else if (arch === 'arm64') {
    log(colors.yellow, `  ⚠️  ARM64 Architecture Detected`);
    console.log('     ⚠️  Some libraries may have limited support');
    console.log('     ⚠️  Gradle builds may be slower');
} else {
    log(colors.yellow, `  ⚠️  Architecture: ${arch}`);
    console.log('     ⚠️  This project is optimized for x86/x64 (VPS/Windows)');
}

console.log('');

// ============ REQUIRED TOOLS ============
log(colors.bright + colors.blue, '🛠️  REQUIRED TOOLS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const tools = [
    { name: 'Node.js', getVersion: getNodeVersion, minVersion: '18.0.0', installCmd: 'https://nodejs.org/' },
    { name: 'npm', getVersion: getNpmVersion, minVersion: '9.0.0', installCmd: 'comes with Node.js' },
    { name: 'Java (JDK 11+)', getVersion: getJavaVersion, minVersion: '11.0.0', installCmd: 'sudo apt install openjdk-17-jdk' },
    { name: 'Gradle', getVersion: getGradleVersion, minVersion: '7.0.0', installCmd: 'sudo apt install gradle' },
    { name: 'Git', getVersion: getGitVersion, minVersion: '2.0.0', installCmd: 'sudo apt install git' }
];

let allToolsOk = true;
let missingTools = [];
let versionWarnings = [];

for (const tool of tools) {
    const version = tool.getVersion();
    const installed = version !== null;

    if (installed) {
        console.log(`  ${colors.green}✓${colors.reset} ${tool.name.padEnd(18)} : ${version}`);
        
        // Check version requirement
        if (tool.minVersion) {
            const versionNum = parseFloat(version.match(/\d+\.\d+/)?.[0] || '0');
            const minNum = parseFloat(tool.minVersion);
            if (versionNum < minNum) {
                versionWarnings.push(`${tool.name} version ${version} < ${tool.minVersion}`);
                console.log(`     ${colors.yellow}⚠️  Version ${version} is below recommended ${tool.minVersion}${colors.reset}`);
            }
        }
    } else {
        console.log(`  ${colors.red}✗${colors.reset} ${tool.name.padEnd(18)} : ${colors.red}Not installed${colors.reset}`);
        allToolsOk = false;
        missingTools.push(tool.name);
    }
}

console.log('');

// ============ FLUTTER CHECK (Optional) ============
log(colors.bright + colors.blue, '💙 FLUTTER SDK (Optional for ZIP builds)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

let flutterFound = false;
try {
    const flutterVersion = execSync('flutter --version 2>&1', { stdio: 'pipe', encoding: 'utf8' });
    const versionMatch = flutterVersion.match(/Flutter (\d+\.\d+\.\d+)/);
    if (versionMatch) {
        console.log(`  ${colors.green}✓${colors.reset} Flutter       : ${versionMatch[0]}`);
        flutterFound = true;
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} Flutter       : Not found (optional)`);
    }
} catch {
    console.log(`  ${colors.yellow}○${colors.reset} Flutter       : Not found (optional)`);
}

if (!flutterFound) {
    console.log(`     💡 Install Flutter: https://flutter.dev/docs/get-started/install`);
}

console.log('');

// ============ ANDROID SDK ============
log(colors.bright + colors.blue, '📱 ANDROID SDK');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const possibleSdkPaths = [
    '/opt/android-sdk',
    '/usr/lib/android-sdk',
    process.env.HOME + '/Android/Sdk',
    process.env.HOME + '/android-sdk',
    process.env.LOCALAPPDATA + '\\Android\\Sdk',
    'C:\\Users\\' + (process.env.USERNAME || 'User') + '\\AppData\\Local\\Android\\Sdk',
    'C:\\Android\\Sdk'
];

let sdkPath = androidHome;
let sdkFound = false;

if (sdkPath && fs.existsSync(sdkPath)) {
    sdkFound = true;
} else {
    for (const p of possibleSdkPaths) {
        if (p && fs.existsSync(p)) {
            sdkPath = p;
            sdkFound = true;
            break;
        }
    }
}

if (sdkFound) {
    console.log(`  ${colors.green}✓${colors.reset} SDK Path     : ${sdkPath}`);

    // Check for build-tools
    const buildToolsPath = `${sdkPath}/build-tools`;
    if (fs.existsSync(buildToolsPath)) {
        const versions = fs.readdirSync(buildToolsPath);
        console.log(`  ${colors.green}✓${colors.reset} Build Tools  : ${colors.yellow}${versions.join(', ')}${colors.reset}`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} Build Tools  : Not found`);
        console.log(`     💡 Run: sdkmanager "build-tools;34.0.0"`);
    }

    // Check for platforms
    const platformsPath = `${sdkPath}/platforms`;
    if (fs.existsSync(platformsPath)) {
        const platforms = fs.readdirSync(platformsPath);
        console.log(`  ${colors.green}✓${colors.reset} Platforms    : ${colors.yellow}${platforms.join(', ')}${colors.reset}`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} Platforms    : Not found`);
        console.log(`     💡 Run: sdkmanager "platforms;android-34"`);
    }

    // Check for cmdline-tools
    const cmdlineToolsPath = `${sdkPath}/cmdline-tools`;
    if (fs.existsSync(cmdlineToolsPath)) {
        console.log(`  ${colors.green}✓${colors.reset} Cmdline Tools: Installed`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} Cmdline Tools: Not found`);
    }

    // Check for NDK
    const ndkPath = `${sdkPath}/ndk`;
    if (fs.existsSync(ndkPath)) {
        const ndkVersions = fs.readdirSync(ndkPath);
        console.log(`  ${colors.green}✓${colors.reset} NDK          : ${colors.yellow}${ndkVersions.join(', ')}${colors.reset}`);
    }
} else {
    console.log(`  ${colors.red}✗${colors.reset} Android SDK not found!`);
    console.log('');
    console.log(`  ${colors.cyan}📋 Install Android SDK:${colors.reset}`);
    if (isWindows) {
        console.log('     📥 Download Android Studio from: https://developer.android.com/studio');
        console.log('     🚀 Or run: .\\scripts\\setup.ps1 (PowerShell as Admin)');
    } else if (isLinux) {
        console.log('     🚀 Run: ./scripts/setup-vps.sh');
        console.log('     📥 Or download from: https://developer.android.com/studio');
    } else if (isMac) {
        console.log('     🚀 brew install android-sdk');
    }
    allToolsOk = false;
}

console.log('');

// ============ ENVIRONMENT VARIABLES ============
log(colors.bright + colors.blue, '🔧 ENVIRONMENT VARIABLES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const envVars = ['JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT'];
envVars.forEach(env => {
    const value = process.env[env];
    if (value && fs.existsSync(value)) {
        console.log(`  ${colors.green}✓${colors.reset} ${env.padEnd(18)} = ${value}`);
    } else if (value) {
        console.log(`  ${colors.yellow}○${colors.reset} ${env.padEnd(18)} = ${value} ${colors.gray}(path not found)${colors.reset}`);
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} ${env.padEnd(18)} = ${colors.gray}(not set)${colors.reset}`);
    }
});

console.log('');

// ============ NETWORK CHECK ============
log(colors.bright + colors.blue, '🌐 NETWORK CHECK');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

try {
    execSync('ping -c 1 google.com', { stdio: 'pipe', timeout: 5000 });
    console.log(`  ${colors.green}✓${colors.reset} Internet      : Connected`);
} catch {
    console.log(`  ${colors.yellow}○${colors.reset} Internet      : ${colors.gray}Unable to reach Google${colors.reset}`);
}

try {
    execSync('ping -c 1 repo.maven.apache.org', { stdio: 'pipe', timeout: 5000 });
    console.log(`  ${colors.green}✓${colors.reset} Maven Repo    : Accessible`);
} catch {
    console.log(`  ${colors.yellow}○${colors.reset} Maven Repo    : ${colors.gray}May be blocked${colors.reset}`);
}

try {
    execSync('ping -c 1 storage.googleapis.com', { stdio: 'pipe', timeout: 5000 });
    console.log(`  ${colors.green}✓${colors.reset} Google Storage: Accessible`);
} catch {
    console.log(`  ${colors.yellow}○${colors.reset} Google Storage: ${colors.gray}May be blocked${colors.reset}`);
}

console.log('');

// ============ DISK SPACE CHECK ============
log(colors.bright + colors.blue, '💾 DISK SPACE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

try {
    if (isLinux || isMac) {
        const df = execSync('df -h .', { stdio: 'pipe', encoding: 'utf8' });
        const lines = df.split('\n');
        const lastLine = lines[lines.length - 2];
        if (lastLine) {
            const parts = lastLine.split(/\s+/);
            const available = parts[3];
            console.log(`  ${colors.green}✓${colors.reset} Available    : ${available}`);
            
            // Check if available space is less than 5GB
            const availNum = parseFloat(available);
            if (availNum < 5) {
                console.log(`     ${colors.yellow}⚠️  Low disk space! Builds may fail.${colors.reset}`);
            }
        }
    } else {
        console.log(`  ${colors.yellow}○${colors.reset} Disk check   : ${colors.gray}Not available on Windows${colors.reset}`);
    }
} catch (e) {
    console.log(`  ${colors.yellow}○${colors.reset} Disk check   : ${colors.gray}Failed${colors.reset}`);
}

console.log('');

// ============ RECOMMENDATIONS ============
log(colors.bright + colors.blue, '💡 RECOMMENDATIONS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (isWindows) {
    console.log(`  ${colors.cyan}🖥️  Windows Setup:${colors.reset}`);
    console.log('');
    console.log(`  ${colors.gray}# Run setup script (PowerShell as Admin)${colors.reset}`);
    console.log(`  ${colors.yellow}.\\scripts\\setup.ps1${colors.reset}`);
    console.log('');
    console.log(`  ${colors.gray}# Or install manually:${colors.reset}`);
    console.log(`  ${colors.gray}1. Install Node.js from https://nodejs.org/${colors.reset}`);
    console.log(`  ${colors.gray}2. Install Android Studio from https://developer.android.com/studio${colors.reset}`);
    console.log(`  ${colors.gray}3. Set ANDROID_HOME environment variable${colors.reset}`);
    console.log(`  ${colors.gray}4. Install Flutter from https://flutter.dev${colors.reset}`);
} else if (isLinux) {
    console.log(`  ${colors.cyan}🐧 VPS/Linux Setup:${colors.reset}`);
    console.log('');
    console.log(`  ${colors.gray}# Run VPS setup script${colors.reset}`);
    console.log(`  ${colors.yellow}chmod +x scripts/setup-vps.sh${colors.reset}`);
    console.log(`  ${colors.yellow}./scripts/setup-vps.sh${colors.reset}`);
    console.log('');
    console.log(`  ${colors.gray}# Or install with apt:${colors.reset}`);
    console.log(`  ${colors.yellow}sudo apt update && sudo apt install -y openjdk-17-jdk gradle git${colors.reset}`);
    console.log(`  ${colors.yellow}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${colors.reset}`);
    console.log(`  ${colors.yellow}sudo apt install -y nodejs${colors.reset}`);
} else if (isMac) {
    console.log(`  ${colors.cyan}🍎 macOS Setup:${colors.reset}`);
    console.log('');
    console.log(`  ${colors.gray}# Install with Homebrew${colors.reset}`);
    console.log(`  ${colors.yellow}brew install node gradle git${colors.reset}`);
    console.log(`  ${colors.yellow}brew install --cask android-sdk${colors.reset}`);
    console.log(`  ${colors.yellow}brew install --cask flutter${colors.reset}`);
}

console.log('');

// ============ SUMMARY ============
log(colors.bright + colors.blue, '📊 SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (allToolsOk && sdkFound) {
    log(colors.green, '  ✅ System is ready for Web4APK Bot!');
    console.log('');
    console.log(`  ${colors.cyan}📋 Next steps:${colors.reset}`);
    console.log(`     ${colors.yellow}1. npm install${colors.reset}`);
    console.log(`     ${colors.yellow}2. cp .env.example .env${colors.reset}`);
    console.log(`     ${colors.yellow}3. Edit .env with your bot token${colors.reset}`);
    console.log(`     ${colors.yellow}4. npm start${colors.reset}`);
    
    if (!flutterFound) {
        console.log('');
        console.log(`  ${colors.yellow}💡 Note: Flutter not installed. ZIP builds for Flutter projects will not work.${colors.reset}`);
    }
    
    if (versionWarnings.length > 0) {
        console.log('');
        console.log(`  ${colors.yellow}⚠️  Version warnings:${colors.reset}`);
        versionWarnings.forEach(w => console.log(`     - ${w}`));
    }
} else {
    log(colors.red, '  ❌ Some requirements are missing!');
    console.log('');
    if (missingTools.length > 0) {
        console.log(`  Missing tools: ${missingTools.join(', ')}`);
    }
    console.log('');
    console.log(`  ${colors.yellow}⚠️  Please install missing tools before continuing.${colors.reset}`);
    console.log('');
    console.log(`  ${colors.cyan}💡 Run setup script:${colors.reset}`);
    if (isWindows) {
        console.log(`     .\\scripts\\setup.ps1`);
    } else {
        console.log(`     ./scripts/setup-vps.sh`);
    }
}

console.log('');
log(colors.cyan, '════════════════════════════════════════════════════════════════════');
console.log('');