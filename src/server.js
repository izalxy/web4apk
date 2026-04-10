/**
 * Web Server for Web4APK Dashboard
 * Auto-detects domain and displays server specs
 */

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const multer = require('multer');
const cors = require('cors');
const licenseKeyService = require('./utils/licenseKeyService');

const app = express();
const HOST = process.env.WEB_HOST || '0.0.0.0';

// Trust proxy for reverse proxy support (Nginx, Cloudflare, etc.)
app.set('trust proxy', 1);
const PORT = process.env.WEB_PORT || 3000;

// Configure multer for icon uploads
const uploadDir = path.join(__dirname, '..', 'temp', 'uploads');
fs.ensureDirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `icon-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request timeout for long build operations (30 minutes)
app.use((req, res, next) => {
    req.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== RATE LIMITING ==========
const loginAttempts = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 10 * 60 * 1000;

function rateLimitLogin(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let attempt = loginAttempts.get(ip);

    if (attempt && now > attempt.resetTime) {
        loginAttempts.delete(ip);
        attempt = null;
    }

    if (!attempt) {
        attempt = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
        loginAttempts.set(ip, attempt);
    }

    attempt.count++;

    if (attempt.count > RATE_LIMIT_MAX) {
        const remainingTime = Math.ceil((attempt.resetTime - now) / 60000);
        return res.status(429).json({
            success: false,
            error: `Terlalu banyak percobaan. Coba lagi dalam ${remainingTime} menit.`
        });
    }

    next();
}

// ========== AUTH MIDDLEWARE ==========
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    let username, deviceId;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const parts = token.split(':');
        if (parts.length >= 2) {
            username = parts[0];
            deviceId = parts.slice(1).join(':');
        }
    }

    if (!username && req.body) {
        username = req.body.authUsername;
        deviceId = req.body.authDeviceId;
    }

    if (!username || !deviceId) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized - silakan login terlebih dahulu'
        });
    }

    const result = licenseKeyService.verifySession(username, deviceId);

    if (!result.valid) {
        return res.status(401).json({
            success: false,
            error: result.reason || 'Session tidak valid'
        });
    }

    req.authUser = {
        username,
        deviceId,
        expiresAt: result.expiresAt
    };

    next();
}

app.use(express.static(path.join(__dirname, '..', 'web')));

// Store for web builds
const webBuilds = new Map();

// ========== TELEGRAM NOTIFICATION HELPER ==========
async function sendDownloadLinkToTelegram(username, downloadUrl, appName, buildType = 'url') {
    try {
        const telegramId = licenseKeyService.getTelegramIdByUsername(username);

        if (!telegramId) {
            console.log(`[Telegram] No Telegram ID for user: ${username}`);
            return { sent: false, reason: 'No Telegram ID' };
        }

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
            console.log('[Telegram] BOT_TOKEN not configured');
            return { sent: false, reason: 'Bot not configured' };
        }

        const message = `
╔═══════════════════════════════╗
     📦  <b>BUILD APK SELESAI!</b>  📦
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 <b>Nama Aplikasi:</b> ${appName}
🔧 <b>Tipe Build:</b> ${buildType === 'zip' ? 'ZIP Project' : 'URL to APK'}

🔗 <b>Link Download:</b>
<code>${downloadUrl}</code>

⏰ <i>Link berlaku 2 menit</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 <i>Web4APK Bot</i>
        `.trim();

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });

        const result = await response.json();

        if (result.ok) {
            console.log(`[Telegram] Download link sent to user: ${username} (${telegramId})`);
            return { sent: true };
        } else {
            console.log(`[Telegram] Failed to send: ${result.description}`);
            return { sent: false, reason: result.description };
        }
    } catch (error) {
        console.error('[Telegram] Error sending download link:', error.message);
        return { sent: false, reason: error.message };
    }
}

// Get local IP addresses
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }

    return ips;
}

// Get server specifications
function getServerSpecs() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
        os: {
            platform: os.platform(),
            release: os.release(),
            type: os.type(),
            arch: os.arch()
        },
        cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            speed: cpus[0]?.speed || 0
        },
        memory: {
            total: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
            free: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
            used: Math.round((totalMem - freeMem) / (1024 * 1024 * 1024) * 100) / 100
        },
        node: process.version,
        uptime: Math.floor(os.uptime())
    };
}

// API Routes
app.get('/api/specs', (req, res) => {
    res.json(getServerSpecs());
});

app.get('/api/stats', (req, res) => {
    const userService = require('./utils/userService');
    const { buildQueue } = require('./utils/buildQueue');

    const currentBuild = buildQueue.getCurrentBuild();
    
    res.json({
        totalUsers: userService.getCount(),
        activeSessions: global.sessions?.size || 0,
        queueStatus: buildQueue.isBusy() ? 'busy' : 'available',
        currentBuild: currentBuild ? {
            chatId: currentBuild.chatId,
            username: currentBuild.username,
            buildType: currentBuild.buildType,
            duration: currentBuild.duration
        } : null,
        uptime: Math.floor(process.uptime())
    });
});

// ========== AUTH API ENDPOINTS ==========

app.post('/api/auth/login', rateLimitLogin, (req, res) => {
    const { username, key, deviceId } = req.body;

    if (!username || !key || !deviceId) {
        return res.status(400).json({
            success: false,
            error: 'Username, key, dan deviceId diperlukan'
        });
    }

    const result = licenseKeyService.validateLogin(username, key, deviceId);

    if (result.success) {
        res.json({
            success: true,
            username: result.username,
            expiresAt: result.expiresAt
        });
    } else {
        res.status(401).json({
            success: false,
            error: result.error
        });
    }
});

app.get('/api/auth/verify', (req, res) => {
    const { username, deviceId } = req.query;

    if (!username || !deviceId) {
        return res.status(400).json({
            valid: false,
            reason: 'Username dan deviceId diperlukan'
        });
    }

    const result = licenseKeyService.verifySession(username, deviceId);
    res.json(result);
});

app.post('/api/auth/logout', (req, res) => {
    const { username, deviceId } = req.body;

    if (!username || !deviceId) {
        return res.status(400).json({
            success: false,
            error: 'Username dan deviceId diperlukan'
        });
    }

    const result = licenseKeyService.logout(username, deviceId);
    res.json(result);
});

// Build from web (URL to APK)
app.post('/api/build', upload.single('icon'), async (req, res) => {
    const { url, appName, themeColor } = req.body;
    const iconFile = req.file;
    const { buildQueue } = require('./utils/buildQueue');
    const { buildApk } = require('./builder/apkBuilder');

    let authUsername = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        authUsername = token.split(':')[0];
    }

    if (!url || !appName) {
        if (iconFile) await fs.remove(iconFile.path).catch(() => { });
        return res.status(400).json({ error: 'URL dan nama aplikasi diperlukan' });
    }

    if (!buildQueue.acquire('web-' + Date.now(), authUsername, 'url')) {
        if (iconFile) await fs.remove(iconFile.path).catch(() => { });
        const position = buildQueue.getQueuePosition('web-' + Date.now());
        return res.status(503).json({ 
            error: 'Server sedang sibuk. Coba lagi nanti.',
            queuePosition: position,
            waitingCount: buildQueue.getWaitingCount()
        });
    }

    try {
        const buildData = {
            url,
            appName,
            themeColor: themeColor || '#2196F3',
            iconPath: iconFile ? iconFile.path : null
        };

        const result = await buildApk(buildData, (status) => {
            console.log('[Web Build]', status);
            buildQueue.updateActivity();
        });

        if (iconFile) {
            await fs.remove(iconFile.path).catch(() => { });
        }

        if (result.success) {
            const buildId = 'web-' + Date.now();

            webBuilds.set(buildId, {
                path: result.apkPath,
                buildDir: result.buildDir,
                fileName: `${appName.replace(/[^a-zA-Z0-9]/g, '_')}.apk`,
                createdAt: Date.now(),
                username: authUsername
            });

            setTimeout(async () => {
                const build = webBuilds.get(buildId);
                if (build) {
                    await fs.remove(build.path).catch(() => { });
                    await fs.remove(build.buildDir).catch(() => { });
                    webBuilds.delete(buildId);
                    console.log(`[Web Build] Auto-deleted: ${buildId}`);
                }
            }, 2 * 60 * 1000);

            const downloadUrl = `/api/download/${buildId}`;

            if (authUsername) {
                const fullDownloadUrl = `${req.protocol}://${req.get('host')}${downloadUrl}`;
                sendDownloadLinkToTelegram(authUsername, fullDownloadUrl, appName, 'url').catch(err => {
                    console.error('[Telegram] Error:', err.message);
                });
            }

            res.json({
                success: true,
                buildId,
                downloadUrl,
                expiresIn: 120
            });
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        if (iconFile) {
            await fs.remove(iconFile.path).catch(() => { });
        }
        res.status(500).json({ error: error.message });
    } finally {
        buildQueue.release(null, !res.headersSent);
    }
});

// Download APK
app.get('/api/download/:buildId', async (req, res) => {
    const { buildId } = req.params;
    const build = webBuilds.get(buildId);

    if (!build) {
        return res.status(404).json({ error: 'File tidak ditemukan atau sudah kadaluarsa' });
    }

    if (!await fs.pathExists(build.path)) {
        webBuilds.delete(buildId);
        return res.status(404).json({ error: 'File sudah dihapus' });
    }

    res.download(build.path, build.fileName);
});

// Configure multer for ZIP uploads
const zipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `project-${Date.now()}.zip`);
    }
});

const zipUpload = multer({
    storage: zipStorage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files are allowed'));
        }
    }
});

// Build logs storage
const sessionLogs = new Map();
const MAX_LOGS = 100;
const SESSION_TIMEOUT = 10 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessionLogs.entries()) {
        if (now - session.createdAt > SESSION_TIMEOUT) {
            sessionLogs.delete(sessionId);
            console.log(`[Logs] Session ${sessionId} expired and removed`);
        }
    }
}, 60 * 1000);

function getSessionLogs(sessionId) {
    if (!sessionLogs.has(sessionId)) {
        sessionLogs.set(sessionId, { logs: [], createdAt: Date.now() });
    }
    const session = sessionLogs.get(sessionId);
    session.createdAt = Date.now();
    return session.logs;
}

function addBuildLog(level, message, details = null, sessionId = null) {
    const log = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        level,
        message,
        details
    };

    if (sessionId) {
        const logs = getSessionLogs(sessionId);
        logs.unshift(log);
        if (logs.length > MAX_LOGS) logs.pop();
    }

    console.log(`[${level.toUpperCase()}] ${message}`, details || '');
    return log;
}

function clearBuildLogs(sessionId = null) {
    if (sessionId && sessionLogs.has(sessionId)) {
        sessionLogs.get(sessionId).logs = [];
        console.log(`[INFO] Session ${sessionId} logs cleared`);
    }
}

// Get build logs
app.get('/api/logs', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        return res.json([]);
    }
    const logs = getSessionLogs(sessionId);
    res.json(logs.slice(0, 50));
});

// Clear build logs
app.delete('/api/logs', (req, res) => {
    const sessionId = req.query.sessionId;
    clearBuildLogs(sessionId);
    res.json({ success: true, message: 'Logs cleared' });
});

// ZIP build endpoint (fallback)
app.post('/api/build-zip', zipUpload.single('zipFile'), async (req, res) => {
    const { projectType, buildType, sessionId } = req.body;
    const zipFile = req.file;
    const { buildQueue } = require('./utils/buildQueue');
    const { buildFromZip } = require('./builder/zipBuilder');

    let authUsername = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        authUsername = token.split(':')[0];
    }

    if (!zipFile) {
        return res.status(400).json({ error: 'ZIP file diperlukan' });
    }

    if (!['flutter', 'android'].includes(projectType)) {
        await fs.remove(zipFile.path).catch(() => { });
        return res.status(400).json({ error: 'Project type tidak valid' });
    }

    if (!buildQueue.acquire('web-zip-' + Date.now(), authUsername, 'zip')) {
        await fs.remove(zipFile.path).catch(() => { });
        const position = buildQueue.getQueuePosition('web-zip-' + Date.now());
        return res.status(503).json({ 
            error: 'Server sedang sibuk. Coba lagi nanti.',
            queuePosition: position,
            waitingCount: buildQueue.getWaitingCount()
        });
    }

    try {
        addBuildLog('info', `Starting ${projectType} ${buildType} build`, { fileName: zipFile.originalname }, sessionId);

        const result = await buildFromZip(
            zipFile.path,
            projectType,
            buildType || 'release',
            (status) => {
                addBuildLog('info', status, null, sessionId);
                buildQueue.updateActivity();
            }
        );

        if (result.success) {
            if (!result.apkPath || !await fs.pathExists(result.apkPath)) {
                throw new Error('APK file was not created successfully');
            }

            const buildId = 'zip-' + Date.now();
            const downloadUrl = `/api/download/${buildId}`;

            webBuilds.set(buildId, {
                path: result.apkPath,
                buildDir: result.buildDir,
                fileName: `${projectType}_${buildType}.apk`,
                createdAt: Date.now(),
                username: authUsername
            });

            setTimeout(async () => {
                const build = webBuilds.get(buildId);
                if (build) {
                    await fs.remove(build.path).catch(() => { });
                    await fs.remove(build.buildDir).catch(() => { });
                    webBuilds.delete(buildId);
                    clearBuildLogs(sessionId);
                }
            }, 2 * 60 * 1000);

            addBuildLog('success', 'Build completed successfully', { buildId, downloadUrl }, sessionId);

            if (authUsername) {
                const fullDownloadUrl = `${req.protocol}://${req.get('host')}${downloadUrl}`;
                sendDownloadLinkToTelegram(authUsername, fullDownloadUrl, `${projectType}_${buildType}`, 'zip').catch(err => {
                    console.error('[Telegram] Error:', err.message);
                });
            }

            res.json({
                success: true,
                buildId,
                downloadUrl,
                expiresIn: 120
            });
        } else {
            throw new Error(result.error || 'Build failed with unknown error');
        }
    } catch (error) {
        addBuildLog('error', 'Build failed', { error: error.message }, sessionId);
        res.status(500).json({ error: error.message });
    } finally {
        await fs.remove(zipFile.path).catch(() => { });
        buildQueue.release(null, !res.headersSent);
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

// ========== GLOBAL ERROR HANDLER ==========
app.use((err, req, res, next) => {
    console.error('[ServerError]', err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Ukuran file terlalu besar. Maksimum upload adalah 200MB untuk ZIP dan 10MB untuk Icon.'
            });
        }
        return res.status(400).json({
            success: false,
            error: `Upload Error: ${err.message}`
        });
    }

    res.status(500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Start server
function startWebServer() {
    const server = app.listen(PORT, HOST, () => {
        const ips = getLocalIPs();

        console.log('');
        console.log('╔═══════════════════════════════╗');
        console.log('     🌐  WEB DASHBOARD  🌐');
        console.log('╚═══════════════════════════════╝');
        console.log(`   Local:   http://localhost:${PORT}`);
        console.log(`   Binding: http://${HOST}:${PORT}`);
        ips.forEach(ip => {
            console.log(`   Network: http://${ip}:${PORT}`);
        });
        console.log('   Custom domain akan bekerja dengan reverse proxy');
        console.log('');
    });

    server.timeout = 30 * 60 * 1000;
    server.keepAliveTimeout = 65 * 1000;
    server.headersTimeout = 66 * 1000;
}

// Notification system
let latestNotification = null;

app.get('/api/notification', (req, res) => {
    res.json(latestNotification || {});
});

function updateNotification(text) {
    latestNotification = {
        id: Date.now(),
        text: text,
        timestamp: new Date().toISOString()
    };
    return latestNotification;
}

module.exports = { startWebServer, getServerSpecs, getLocalIPs, updateNotification };