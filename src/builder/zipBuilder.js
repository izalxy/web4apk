const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');

/**
 * Build APK from ZIP project (Flutter or Android Studio)
 */
async function buildFromZip(zipPath, projectType, buildType, onProgress) {
    const jobId = uuidv4();
    const tempDir = path.join(__dirname, '..', '..', 'temp', jobId);

    try {
        // Extract ZIP
        onProgress('📂 Extracting project files...');
        await fs.ensureDir(tempDir);

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);
        onProgress('✅ Project extracted');

        // Find project root
        onProgress('🔍 Locating project root...');
        const projectRoot = await findProjectRoot(tempDir, projectType);
        if (!projectRoot) {
            throw new Error(`Invalid ${projectType} project. Required files not found.`);
        }
        onProgress(`✅ Project detected: ${projectType === 'flutter' ? 'Flutter' : 'Android Studio'}`);

        // Build based on project type
        let apkPath;
        if (projectType === 'flutter') {
            apkPath = await buildFlutter(projectRoot, buildType, onProgress);
        } else {
            apkPath = await buildAndroid(projectRoot, buildType, onProgress);
        }

        // Get APK size
        const stats = await fs.stat(apkPath);
        const apkSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        onProgress(`✅ Build completed! (${apkSizeMB} MB)`);

        // Clean up ZIP file
        await fs.remove(zipPath).catch(() => { });

        return {
            success: true,
            apkPath: apkPath,
            buildDir: tempDir,
            size: apkSizeMB
        };

    } catch (error) {
        console.error('ZIP Build error:', error);
        
        // Cleanup on error
        await fs.remove(tempDir).catch(() => { });
        await fs.remove(zipPath).catch(() => { });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Find project root directory
 */
async function findProjectRoot(dir, projectType) {
    const targetFile = projectType === 'flutter' ? 'pubspec.yaml' : 'build.gradle';

    // Check current directory
    if (await fs.pathExists(path.join(dir, targetFile))) {
        return dir;
    }

    // Check subdirectories (in case ZIP has a root folder)
    const items = await fs.readdir(dir);
    for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
            if (await fs.pathExists(path.join(itemPath, targetFile))) {
                return itemPath;
            }
        }
    }

    return null;
}

/**
 * Build Flutter project
 */
async function buildFlutter(projectDir, buildType, onProgress) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';

    // ============================================
    // STEP 1: Aggressive Gradle cache cleanup
    // ============================================
    onProgress('🗑️ Cleaning Gradle caches...');

    const cacheDirs = [
        `${homeDir}/.gradle/caches/transforms-3`,
        `${homeDir}/.gradle/caches/modules-2/files-2.1/io.flutter`,
        `${homeDir}/.gradle/caches/jars-9`,
        `${projectDir}/.gradle`,
        `${projectDir}/android/.gradle`,
        `${projectDir}/build`,
        `${projectDir}/android/app/build`,
        `${projectDir}/android/build`
    ];

    for (const cacheDir of cacheDirs) {
        try {
            await fs.remove(cacheDir);
        } catch (e) { /* ignore */ }
    }
    onProgress('✅ Cache cleanup complete');

    // ============================================
    // STEP 2: Configure gradle.properties
    // ============================================
    onProgress('⚙️ Configuring Gradle properties...');
    const gradlePropsPath = path.join(projectDir, 'android', 'gradle.properties');
    try {
        let gradleProps = '';
        if (await fs.pathExists(gradlePropsPath)) {
            gradleProps = await fs.readFile(gradlePropsPath, 'utf8');
        }

        const propsToSet = {
            'org.gradle.jvmargs': '-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8',
            'android.useAndroidX': 'true',
            'android.enableJetifier': 'false',
            'org.gradle.daemon': 'false',
            'org.gradle.parallel': 'true',
            'org.gradle.caching': 'false'
        };

        for (const [key, value] of Object.entries(propsToSet)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(gradleProps)) {
                gradleProps = gradleProps.replace(regex, `${key}=${value}`);
            } else {
                gradleProps += `\n${key}=${value}`;
            }
        }

        await fs.writeFile(gradlePropsPath, gradleProps.trim() + '\n');
        onProgress('✅ Gradle properties configured');
    } catch (e) {
        console.log('[CONFIG] Could not update gradle.properties:', e.message);
    }

    // ============================================
    // STEP 3: Check Flutter installation
    // ============================================
    onProgress('🔍 Checking Flutter installation...');
    try {
        await runCommand('flutter', ['--version'], projectDir);
        onProgress('✅ Flutter found');
    } catch (e) {
        throw new Error('Flutter tidak ditemukan. Pastikan Flutter sudah terinstall.');
    }

    // ============================================
    // STEP 4: Flutter clean and pub get
    // ============================================
    onProgress('🧹 Running flutter clean...');
    await runCommand('flutter', ['clean'], projectDir).catch(() => { });
    onProgress('✅ Flutter clean complete');

    onProgress('📦 Getting Flutter dependencies...');
    await runCommand('flutter', ['pub', 'get'], projectDir, onProgress);
    onProgress('✅ Dependencies installed');

    // ============================================
    // STEP 5: Build APK
    // ============================================
    onProgress('🔨 Building Flutter APK (this may take a while)...');
    const buildArgs = buildType === 'release'
        ? ['build', 'apk', '--release', '--no-tree-shake-icons']
        : ['build', 'apk', '--debug'];

    // Start keep-alive progress updates during build
    let keepAliveStep = 0;
    const buildingMessages = [
        '🔨 Compiling Dart code...',
        '⚙️ Processing resources...',
        '📦 Packaging APK...',
        '🔧 Optimizing assets...',
        '🚀 Building native code...',
        '📱 Generating APK bundle...'
    ];

    const keepAliveInterval = setInterval(() => {
        keepAliveStep++;
        const message = buildingMessages[keepAliveStep % buildingMessages.length];
        onProgress(message);
    }, 15000);

    try {
        await runCommand('flutter', buildArgs, projectDir, (output) => {
            if (output && output.trim()) {
                if (output.includes('Running Gradle') || 
                    output.includes('Compiling') || 
                    output.includes('Generating') ||
                    output.includes('Signing')) {
                    onProgress(output.substring(0, 100));
                }
            }
        });
    } finally {
        clearInterval(keepAliveInterval);
    }

    onProgress('📦 Locating APK file...');

    // Find APK
    const possibleApkPaths = [
        path.join(projectDir, 'build', 'app', 'outputs', 'flutter-apk', buildType === 'release' ? 'app-release.apk' : 'app-debug.apk'),
        path.join(projectDir, 'build', 'app', 'outputs', 'apk', buildType, `app-${buildType}.apk`),
        path.join(projectDir, 'build', 'app', 'outputs', 'apk', buildType, 'app-debug.apk')
    ];

    let apkPath = null;
    for (const p of possibleApkPaths) {
        if (await fs.pathExists(p)) {
            apkPath = p;
            break;
        }
    }

    if (!apkPath) {
        // Recursive search
        apkPath = await findFileRecursive(path.join(projectDir, 'build'), '.apk');
    }

    if (!apkPath) {
        throw new Error('APK file not found after build');
    }

    // Get file size
    const stats = await fs.stat(apkPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    onProgress(`📦 APK size: ${fileSizeMB} MB`);

    // Check file size limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`APK terlalu besar (${fileSizeMB} MB). Maksimal 50MB untuk Telegram.`);
    }

    // Copy to output
    const outputDir = path.join(__dirname, '..', '..', 'output');
    await fs.ensureDir(outputDir);
    const finalPath = path.join(outputDir, `flutter_${buildType}_${Date.now()}.apk`);
    await fs.copy(apkPath, finalPath);

    onProgress(`✅ APK saved: ${path.basename(finalPath)}`);
    return finalPath;
}

/**
 * Build Android (Gradle) project
 */
async function buildAndroid(projectDir, buildType, onProgress) {
    const isWindows = process.platform === 'win32';
    const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
    const gradlePath = path.join(projectDir, gradleCmd);

    // Check if gradlew exists
    let useGlobalGradle = false;
    if (!await fs.pathExists(gradlePath)) {
        useGlobalGradle = true;
        onProgress('⚠️ gradlew not found, using global Gradle');
    } else if (!isWindows) {
        await fs.chmod(gradlePath, '755');
    }

    // Check Java installation
    onProgress('🔍 Checking Java...');
    try {
        await runCommand('java', ['-version'], projectDir);
        onProgress('✅ Java found');
    } catch (e) {
        throw new Error('Java tidak ditemukan. Pastikan JAVA_HOME sudah diset.');
    }

    onProgress('🔨 Running Gradle build...');
    const buildTask = buildType === 'release' ? 'assembleRelease' : 'assembleDebug';

    const gradleFlags = [
        buildTask,
        '--no-daemon',
        '--no-watch-fs',
        '--no-build-cache',
        '-Dorg.gradle.native=false',
        '--stacktrace'
    ];

    if (useGlobalGradle) {
        await runCommand('gradle', gradleFlags, projectDir, onProgress);
    } else {
        await runCommand(gradlePath, gradleFlags, projectDir, onProgress);
    }

    onProgress('📦 Locating APK file...');
    const apkPath = await findApk(projectDir, buildType);

    if (!apkPath) {
        throw new Error('APK file not found after build');
    }

    // Get file size
    const stats = await fs.stat(apkPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    onProgress(`📦 APK size: ${fileSizeMB} MB`);

    // Check file size limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`APK terlalu besar (${fileSizeMB} MB). Maksimal 50MB untuk Telegram.`);
    }

    // Copy to output
    const outputDir = path.join(__dirname, '..', '..', 'output');
    await fs.ensureDir(outputDir);
    const finalPath = path.join(outputDir, `android_${buildType}_${Date.now()}.apk`);
    await fs.copy(apkPath, finalPath);

    onProgress(`✅ APK saved: ${path.basename(finalPath)}`);
    return finalPath;
}

/**
 * Find APK file in build outputs
 */
async function findApk(projectDir, buildType) {
    const possiblePaths = [
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`),
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', buildType, 'app-debug.apk'),
        path.join(projectDir, 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`),
        path.join(projectDir, 'build', 'outputs', 'apk', buildType, 'app-debug.apk'),
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
    ];

    for (const p of possiblePaths) {
        if (await fs.pathExists(p)) {
            return p;
        }
    }

    // Recursive search as fallback
    return await findFileRecursive(projectDir, '.apk');
}

/**
 * Recursive file search
 */
async function findFileRecursive(dir, ext, maxDepth = 5, depth = 0) {
    if (depth > maxDepth) return null;

    try {
        const items = await fs.readdir(dir);
        for (const item of items) {
            if (item === '.gradle' || item === 'node_modules') continue;
            
            const itemPath = path.join(dir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isFile() && item.endsWith(ext)) {
                return itemPath;
            }

            if (stat.isDirectory()) {
                const found = await findFileRecursive(itemPath, ext, maxDepth, depth + 1);
                if (found) return found;
            }
        }
    } catch (e) { }
    return null;
}

/**
 * Run command with promise
 */
function runCommand(cmd, args, cwd, onOutput = null) {
    return new Promise((resolve, reject) => {
        const logDir = path.join(__dirname, '..', '..', 'logs');
        fs.ensureDirSync(logDir);
        const logFile = path.join(logDir, `build_${Date.now()}.log`);

        const proc = spawn(cmd, args, {
            cwd,
            shell: true,
            env: {
                ...process.env,
                GRADLE_OPTS: '-Dorg.gradle.native=false -Dfile.encoding=UTF-8 -Xmx2048m -XX:MaxMetaspaceSize=512m',
                _JAVA_OPTIONS: '-Xmx2048m -Dfile.encoding=UTF-8',
                ANDROID_NDK_HOME: process.env.ANDROID_NDK_HOME || '/opt/android-sdk/ndk/27.0.12077973'
            }
        });

        let stdout = '';
        let stderr = '';
        let lastActivity = Date.now();

        proc.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            fs.appendFileSync(logFile, text);
            lastActivity = Date.now();
            if (onOutput) {
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length > 0) {
                    const shortLine = lines[lines.length - 1].substring(0, 150);
                    onOutput(shortLine);
                }
            }
        });

        proc.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            fs.appendFileSync(logFile, '[STDERR] ' + text);
            lastActivity = Date.now();
            if (onOutput && (text.includes('error') || text.includes('Error') || text.includes('Exception'))) {
                onOutput('⚠️ ' + text.substring(0, 150));
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                const allOutput = stdout + '\n' + stderr;
                fs.writeFileSync(logFile + '.error', allOutput);
                console.log(`[DEBUG] Error log saved to: ${logFile}.error`);

                // Extract meaningful error message
                let errorMsg = extractErrorMessage(allOutput);
                reject(new Error(errorMsg));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to start process: ${err.message}`));
        });

        const TIMEOUT_MS = 30 * 60 * 1000;
        const timeoutCheck = setInterval(() => {
            if (Date.now() - lastActivity > TIMEOUT_MS) {
                clearInterval(timeoutCheck);
                proc.kill();
                reject(new Error('Build timeout (30 minutes of inactivity)'));
            }
        }, 60000);

        proc.on('close', () => clearInterval(timeoutCheck));
    });
}

/**
 * Extract meaningful error message from output
 */
function extractErrorMessage(output) {
    const errorPatterns = [
        { pattern: /FAILURE: (.*?)(?=\n)/i, priority: 1 },
        { pattern: /error: (.*?)(?=\n)/i, priority: 2 },
        { pattern: /Error: (.*?)(?=\n)/i, priority: 2 },
        { pattern: /Exception: (.*?)(?=\n)/i, priority: 2 },
        { pattern: /What went wrong:(.*?)(?=\n\* Try:)/is, priority: 1 },
        { pattern: /Could not (.*?)(?=\n)/i, priority: 3 },
        { pattern: /Cannot (.*?)(?=\n)/i, priority: 3 }
    ];

    let bestError = null;
    let bestPriority = 999;

    for (const { pattern, priority } of errorPatterns) {
        const match = output.match(pattern);
        if (match && priority < bestPriority) {
            bestError = match[1] || match[0];
            bestPriority = priority;
        }
    }

    if (bestError) {
        return bestError.trim().substring(0, 500);
    }

    // Get last 5 non-empty lines
    const lines = output.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-5);
    if (lastLines.length > 0) {
        return lastLines.join('\n').substring(0, 500);
    }

    return 'Build failed. Check logs for details.';
}

module.exports = { buildFromZip };