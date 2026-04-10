const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const { generateProject } = require('./projectGenerator');

/**
 * Build APK from user configuration
 * @param {Object} config - User configuration
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Build result
 */
async function buildApk(config, onProgress = () => { }) {
    const buildId = uuidv4();
    const buildDir = path.join(__dirname, '..', '..', 'temp', buildId);

    try {
        onProgress('📋 Menyiapkan project...');

        // Generate Android project from template
        await generateProject(buildDir, config);

        onProgress('🔨 Mengompilasi APK...');

        // Build APK with Gradle
        const gradleResult = await runGradle(buildDir, onProgress);

        if (!gradleResult.success) {
            throw new Error(gradleResult.error);
        }

        // Find the output APK
        const apkPath = await findApk(buildDir);

        if (!apkPath) {
            throw new Error('APK tidak ditemukan setelah build');
        }

        // Get APK size
        const apkStats = await fs.stat(apkPath);
        const apkSizeMB = (apkStats.size / (1024 * 1024)).toFixed(2);
        console.log(`[APK] Build successful: ${apkSizeMB} MB`);

        // Copy APK to output directory with proper name
        const outputDir = path.join(__dirname, '..', '..', 'output');
        await fs.ensureDir(outputDir);

        const sanitizedName = config.appName.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = Date.now();
        const finalApkPath = path.join(outputDir, `${sanitizedName}_${timestamp}.apk`);
        await fs.copy(apkPath, finalApkPath);

        onProgress(`✅ APK berhasil dibuat! (${apkSizeMB} MB)`);

        return {
            success: true,
            apkPath: finalApkPath,
            buildDir: buildDir,
            size: apkSizeMB,
            appName: config.appName
        };

    } catch (error) {
        console.error('Build error:', error);

        // Cleanup on error
        await fs.remove(buildDir).catch(() => { });

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Run Gradle build
 */
async function runGradle(projectDir, onProgress) {
    return new Promise(async (resolve) => {
        const isWindows = process.platform === 'win32';

        // Use gradlew wrapper to ensure correct Gradle version
        const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';

        // Ensure gradlew is executable on Unix systems
        if (!isWindows) {
            try {
                const gradlewPath = path.join(projectDir, 'gradlew');
                await fs.chmod(gradlewPath, 0o755);
            } catch (e) {
                console.warn('[Gradle] Warning: Could not set gradlew executable:', e.message);
            }
        }

        // Ensure gradle-wrapper.jar exists
        const wrapperJarPath = path.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
        if (!await fs.pathExists(wrapperJarPath)) {
            onProgress('📥 Mengunduh Gradle wrapper...');
            try {
                await downloadGradleWrapper(wrapperJarPath);
                console.log('[Gradle] Downloaded gradle-wrapper.jar successfully');
            } catch (e) {
                console.error('[Gradle] Failed to download wrapper:', e.message);
                resolve({
                    success: false,
                    error: 'Gagal download Gradle wrapper. Periksa koneksi internet.'
                });
                return;
            }
        }

        onProgress('🔨 Building dengan Gradle...');

        // Build flags optimized for VPS
        const args = [
            'assembleDebug',
            '--no-daemon',
            '--no-watch-fs',
            '--no-build-cache',
            '--stacktrace',
            '-Dorg.gradle.native=false',
            '-Dorg.gradle.parallel=true'
        ];

        const gradle = spawn(gradleCmd, args, {
            cwd: projectDir,
            shell: true,
            env: {
                ...process.env,
                JAVA_HOME: process.env.JAVA_HOME || '',
                ANDROID_HOME: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '',
                GRADLE_OPTS: '-Dorg.gradle.native=false -Dfile.encoding=UTF-8 -Xmx2048m -XX:MaxMetaspaceSize=512m',
                _JAVA_OPTIONS: '-Xmx2048m -Dfile.encoding=UTF-8'
            }
        });

        let stdout = '';
        let stderr = '';
        let lastProgressUpdate = Date.now();

        gradle.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            
            const now = Date.now();
            // Update progress every 2 seconds to avoid spam
            if (now - lastProgressUpdate > 2000) {
                lastProgressUpdate = now;
                
                if (output.includes('> Task')) {
                    const taskMatch = output.match(/> Task :([^\s]+)/);
                    if (taskMatch) {
                        onProgress(`🔨 ${taskMatch[1]}...`);
                    } else {
                        onProgress('🔨 Building...');
                    }
                } else if (output.includes('Download')) {
                    const downloadMatch = output.match(/Download ([^\n]+)/);
                    if (downloadMatch) {
                        onProgress(`📥 ${downloadMatch[1].substring(0, 40)}...`);
                    } else {
                        onProgress('📥 Downloading dependencies...');
                    }
                } else if (output.includes('BUILD')) {
                    onProgress('📦 Packaging APK...');
                }
            }
        });

        gradle.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            
            // Forward important warnings
            if (output.includes('warning') || output.includes('WARNING')) {
                console.log('[Gradle Warning]', output.trim());
            }
        });

        gradle.on('close', (code) => {
            if (code === 0) {
                onProgress('✅ Build selesai!');
                resolve({ success: true });
            } else {
                // Log full output for debugging
                console.error('=== GRADLE BUILD FAILED ===');
                console.error('Exit code:', code);
                console.error('STDOUT (last 50 lines):', stdout.split('\n').slice(-50).join('\n'));
                console.error('STDERR (last 50 lines):', stderr.split('\n').slice(-50).join('\n'));
                console.error('===========================');

                // Extract meaningful error message
                let errorMsg = extractErrorMessage(stdout + stderr);
                resolve({
                    success: false,
                    error: errorMsg
                });
            }
        });

        gradle.on('error', (error) => {
            resolve({
                success: false,
                error: `Gradle process error: ${error.message}`
            });
        });

        // Timeout: 30 minutes absolute maximum
        const TIMEOUT_MS = 30 * 60 * 1000;
        const buildStartTime = Date.now();

        const timeoutCheck = setInterval(() => {
            const elapsed = Date.now() - buildStartTime;
            if (elapsed > TIMEOUT_MS) {
                clearInterval(timeoutCheck);
                try {
                    gradle.kill('SIGKILL');
                } catch (e) {
                    console.error('[Gradle] Failed to kill process:', e.message);
                }
                resolve({
                    success: false,
                    error: 'Build timeout (exceeded 30 minutes). Server mungkin overloaded, coba lagi nanti.'
                });
            }
        }, 30000);

        gradle.on('close', () => clearInterval(timeoutCheck));
    });
}

/**
 * Extract meaningful error message from Gradle output
 */
function extractErrorMessage(output) {
    // Common error patterns
    const patterns = [
        { pattern: /SDK location not found/i, msg: 'Android SDK tidak ditemukan. Pastikan ANDROID_HOME sudah diset.' },
        { pattern: /JAVA_HOME[^a-z]/i, msg: 'Java tidak ditemukan. Pastikan JAVA_HOME sudah diset.' },
        { pattern: /Could not find com\.android\.tools/i, msg: 'Android Gradle Plugin tidak ditemukan. Periksa koneksi internet.' },
        { pattern: /Could not find.*version.*required/i, msg: 'Dependency tidak ditemukan. Periksa koneksi internet.' },
        { pattern: /Failed to resolve:/i, msg: 'Gagal resolve dependency. Periksa koneksi internet.' },
        { pattern: /Network is unreachable/i, msg: 'Tidak ada koneksi internet. Periksa network VPS.' },
        { pattern: /Connection refused/i, msg: 'Koneksi ditolak. Periksa firewall atau proxy.' },
        { pattern: /OutOfMemoryError/i, msg: 'Memory tidak cukup. Tambahkan swap atau upgrade RAM VPS.' },
        { pattern: /Could not get unknown property/i, msg: 'Error pada file build.gradle. Periksa syntax project.' },
        { pattern: /A problem occurred configuring root project/i, msg: 'Error konfigurasi Gradle. Periksa file build.gradle.' },
        { pattern: /error: (.*)/i, (match) => match[1] }
    ];

    for (const p of patterns) {
        if (typeof p.pattern === 'function') {
            const match = output.match(/error: (.*)/i);
            if (match) return match[1];
        } else if (p.pattern.test(output)) {
            return p.msg;
        }
    }

    // Get the BUILD FAILED line with context
    const lines = output.split('\n').filter(l => l.trim());
    const failedIndex = lines.findIndex(l => l.includes('BUILD FAILED'));
    if (failedIndex > 0) {
        const contextLines = lines.slice(Math.max(0, failedIndex - 3), failedIndex + 1);
        return contextLines.join('\n').substring(0, 300);
    }

    // Get last non-empty line as fallback
    const lastLines = lines.slice(-3);
    if (lastLines.length > 0) {
        return lastLines.join('\n').substring(0, 300);
    }

    return 'Build gagal. Periksa log untuk detail lebih lanjut.';
}

/**
 * Find the built APK file
 */
async function findApk(projectDir) {
    // Try multiple possible locations
    const possibleLocations = [
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(projectDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
        path.join(projectDir, 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(projectDir, 'build', 'outputs', 'apk', 'release', 'app-release.apk')
    ];

    for (const location of possibleLocations) {
        if (await fs.pathExists(location)) {
            console.log(`[APK] Found APK at: ${location}`);
            return location;
        }
    }

    // Recursive search as last resort
    console.log('[APK] Searching recursively for APK...');
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
            if (item === '.gradle' || item === 'build' || item === '.cxx') continue;
            
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
    } catch (e) {
        // Ignore permission errors
    }
    return null;
}

/**
 * Download gradle-wrapper.jar
 */
async function downloadGradleWrapper(targetPath) {
    const https = require('https');
    
    await fs.ensureDir(path.dirname(targetPath));

    const urls = [
        'https://raw.githubusercontent.com/spring-io/gradle-wrapper/main/gradle/wrapper/gradle-wrapper.jar',
        'https://raw.githubusercontent.com/gradle/gradle/v7.5.0/gradle/wrapper/gradle-wrapper.jar',
        'https://raw.githubusercontent.com/android/nowinandroid/main/gradle/wrapper/gradle-wrapper.jar',
        'https://raw.githubusercontent.com/nicbou/markdown-notes/master/gradle/wrapper/gradle-wrapper.jar'
    ];

    for (const url of urls) {
        try {
            console.log(`[Gradle] Trying to download from: ${url}`);
            await downloadFile(url, targetPath);
            const stats = await fs.stat(targetPath);
            if (stats.size > 50000) {
                console.log(`[Gradle] Successfully downloaded (${stats.size} bytes)`);
                return true;
            }
        } catch (err) {
            console.error(`[Gradle] Failed to download from ${url}:`, err.message);
        }
    }

    throw new Error('Failed to download gradle wrapper from all sources');
}

/**
 * Download a file from URL
 */
function downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const file = fs.createWriteStream(targetPath);
        let redirected = false;

        const request = https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                redirected = true;
                file.close();
                fs.unlink(targetPath, () => {});
                downloadFile(res.headers.location, targetPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            res.pipe(file);
            file.on('finish', () => {
                file.close();
                if (!redirected) resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            fs.unlink(targetPath, () => {});
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

module.exports = { buildApk };