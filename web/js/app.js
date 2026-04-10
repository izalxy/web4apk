/**
 * Web4APK Dashboard - JavaScript App
 */

// State
let selectedIcon = null;
let expireCountdown = null;

// ZIP Build State
let selectedProjectType = 'flutter';
let selectedBuildType = 'release';
let selectedZipFile = null;
let zipExpireCountdown = null;

// Session ID - unique per browser tab for per-session logs
const sessionId = (function () {
    let id = sessionStorage.getItem('buildSessionId');
    if (!id) {
        id = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('buildSessionId', id);
    }
    return id;
})();
console.log('[Session] ID:', sessionId);

// ==================== BUILD STATE PERSISTENCE ====================

function saveBuildState(type, state) {
    const key = `web4apk_build_${type}`;
    const data = {
        ...state,
        savedAt: Date.now(),
        sessionId: sessionId
    };
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[BuildState] Saved ${type}:`, state.status);
}

function getBuildState(type) {
    const key = `web4apk_build_${type}`;
    const data = localStorage.getItem(key);
    if (!data) return null;

    try {
        const state = JSON.parse(data);
        const maxAge = 5 * 60 * 1000;
        if (Date.now() - state.savedAt > maxAge && state.status !== 'result') {
            localStorage.removeItem(key);
            return null;
        }
        return state;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
    }
}

function clearBuildState(type) {
    const key = `web4apk_build_${type}`;
    localStorage.removeItem(key);
    console.log(`[BuildState] Cleared ${type}`);
}

// ==================== AUTH SESSION MANAGEMENT ====================

function getAuthSession() {
    const sessionData = localStorage.getItem('web4apk_session');
    if (!sessionData) return null;

    try {
        const session = JSON.parse(sessionData);
        if (new Date(session.expiresAt) <= new Date()) {
            localStorage.removeItem('web4apk_session');
            return null;
        }
        return session;
    } catch (e) {
        localStorage.removeItem('web4apk_session');
        return null;
    }
}

function getAuthHeader() {
    const session = getAuthSession();
    if (!session) return {};
    return {
        'Authorization': `Bearer ${session.username}:${session.deviceId}`
    };
}

async function checkAuthRequired() {
    const session = getAuthSession();

    if (!session) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        const response = await fetch(`/api/auth/verify?username=${encodeURIComponent(session.username)}&deviceId=${encodeURIComponent(session.deviceId)}`);
        const data = await response.json();

        if (!data.valid) {
            localStorage.removeItem('web4apk_session');
            window.location.href = 'login.html';
            return false;
        }

        return true;
    } catch (e) {
        console.error('[Auth] Verify error:', e);
        return true;
    }
}

async function logout() {
    const session = getAuthSession();

    if (session) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: session.username,
                    deviceId: session.deviceId
                })
            });
        } catch (e) {
            console.error('[Auth] Logout error:', e);
        }
    }

    localStorage.removeItem('web4apk_session');
    window.location.href = 'login.html';
}

// Check auth immediately
checkAuthRequired().then(isValid => {
    if (isValid) {
        const session = getAuthSession();
        if (session) {
            const userDisplay = document.getElementById('userDisplay');
            const loggedInUser = document.getElementById('loggedInUser');
            if (userDisplay && loggedInUser) {
                loggedInUser.textContent = session.username;
                userDisplay.style.display = 'inline-flex';
            }
        }
    }
});

// ==================== WEBVIEW COMPATIBILITY HELPERS ====================

function setElementVisible(element, visible) {
    if (!element) return;

    if (visible) {
        element.classList.remove('hidden');
        element.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important;';
        forceRepaint(element);
    } else {
        element.style.cssText = '';
        element.classList.add('hidden');
    }
}

function forceRepaint(element) {
    if (!element) return;
    void element.offsetHeight;
    element.style.transform = 'translateZ(0)';
    void element.offsetWidth;
    element.style.transform = '';
}

function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

// DOM Elements
const elements = {
    serverStatus: document.getElementById('serverStatus'),
    totalUsers: document.getElementById('totalUsers'),
    uptime: document.getElementById('uptime'),
    queueStatus: document.getElementById('queueStatus'),
    activeSessions: document.getElementById('activeSessions'),
    osInfo: document.getElementById('osInfo'),
    cpuInfo: document.getElementById('cpuInfo'),
    memInfo: document.getElementById('memInfo'),
    memoryBar: document.getElementById('memoryBar'),
    memoryText: document.getElementById('memoryText'),
    nodeInfo: document.getElementById('nodeInfo'),
    buildForm: document.getElementById('buildForm'),
    urlInput: document.getElementById('urlInput'),
    appNameInput: document.getElementById('appNameInput'),
    buildBtn: document.getElementById('buildBtn'),
    iconUploadZone: document.getElementById('iconUploadZone'),
    iconInput: document.getElementById('iconInput'),
    uploadPlaceholder: document.getElementById('uploadPlaceholder'),
    uploadPreview: document.getElementById('uploadPreview'),
    iconPreviewImg: document.getElementById('iconPreviewImg'),
    removeIconBtn: document.getElementById('removeIconBtn'),
    buildProgress: document.getElementById('buildProgress'),
    progressText: document.getElementById('progressText'),
    progressFill: document.getElementById('progressFill'),
    buildResult: document.getElementById('buildResult'),
    downloadBtn: document.getElementById('downloadBtn'),
    expireTime: document.getElementById('expireTime'),
    buildError: document.getElementById('buildError'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    zipBuildForm: document.getElementById('zipBuildForm'),
    zipUploadZone: document.getElementById('zipUploadZone'),
    zipInput: document.getElementById('zipInput'),
    zipPlaceholder: document.getElementById('zipPlaceholder'),
    zipPreview: document.getElementById('zipPreview'),
    zipFileName: document.getElementById('zipFileName'),
    removeZipBtn: document.getElementById('removeZipBtn'),
    zipBuildBtn: document.getElementById('zipBuildBtn'),
    zipBuildProgress: document.getElementById('zipBuildProgress'),
    zipProgressText: document.getElementById('zipProgressText'),
    zipProgressFill: document.getElementById('zipProgressFill'),
    zipBuildResult: document.getElementById('zipBuildResult'),
    zipDownloadBtn: document.getElementById('zipDownloadBtn'),
    zipExpireTime: document.getElementById('zipExpireTime'),
    zipBuildError: document.getElementById('zipBuildError'),
    zipErrorMessage: document.getElementById('zipErrorMessage'),
    zipRetryBtn: document.getElementById('zipRetryBtn'),
    refreshBtn: document.getElementById('refreshBtn')
};

const urlBuildCard = document.getElementById('urlBuildCard');
const zipBuildCard = document.getElementById('zipBuildCard');
const logsCard = document.querySelector('.logs-card');
const logsToggle = document.getElementById('logsToggle');
const logsContainer = document.getElementById('logsContainer');
const logsRefreshBtn = document.getElementById('logsRefreshBtn');
const logsClearBtn = document.getElementById('logsClearBtn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadSpecs();
    setupIconUpload();
    setupForm();
    setupRefresh();
    setupTabs();
    setupProjectTypePicker();
    setupBuildTypePicker();
    setupZipUpload();
    setupZipForm();
    setupLogs();
    restoreBuildState();
    setInterval(loadStats, 10000);
});

function restoreBuildState() {
    const urlState = getBuildState('url');
    if (urlState) {
        if (urlState.status === 'result' && urlState.downloadUrl) {
            const elapsedSeconds = Math.floor((Date.now() - urlState.savedAt) / 1000);
            const remainingTime = Math.max(0, (urlState.expiresIn || 120) - elapsedSeconds);
            if (remainingTime > 0) {
                showResult(urlState.downloadUrl, remainingTime);
            } else {
                clearBuildState('url');
            }
        } else if (urlState.status === 'progress') {
            showError('Build sebelumnya terinterupsi. Silakan mulai build baru.');
            clearBuildState('url');
        }
    }

    const zipState = getBuildState('zip');
    if (zipState) {
        const zipTabBtn = document.querySelector('.tab-btn[data-tab="zip"]');
        if (zipTabBtn) zipTabBtn.click();

        if (zipState.status === 'result' && zipState.downloadUrl) {
            const elapsedSeconds = Math.floor((Date.now() - zipState.savedAt) / 1000);
            const remainingTime = Math.max(0, (zipState.expiresIn || 120) - elapsedSeconds);
            if (remainingTime > 0) {
                showZipResult(zipState.downloadUrl, remainingTime);
            } else {
                clearBuildState('zip');
            }
        } else if (zipState.status === 'progress') {
            showZipError('Build sebelumnya terinterupsi. Silakan mulai build baru.');
            clearBuildState('zip');
        }
    }
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.build-tabs .tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            if (tab === 'url') {
                urlBuildCard.classList.remove('hidden');
                zipBuildCard.classList.add('hidden');
            } else {
                urlBuildCard.classList.add('hidden');
                zipBuildCard.classList.remove('hidden');
            }
        });
    });
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        elements.totalUsers.textContent = data.totalUsers;
        elements.activeSessions.textContent = data.activeSessions;
        elements.uptime.textContent = formatUptime(data.uptime);
        const isBusy = data.queueStatus === 'busy';
        elements.queueStatus.textContent = isBusy ? 'Busy' : 'Ready';
        elements.serverStatus.className = `status-badge ${isBusy ? 'busy' : ''}`;
        if (elements.serverStatus.querySelector('span:last-child')) {
            elements.serverStatus.querySelector('span:last-child').textContent = isBusy ? 'Building...' : 'Online';
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadSpecs() {
    try {
        const response = await fetch('/api/specs');
        const data = await response.json();
        const osName = getOSName(data.os.platform);
        elements.osInfo.textContent = `${osName} (${data.os.arch})`;
        const cpuModel = data.cpu.model.split('@')[0].trim();
        elements.cpuInfo.textContent = `${cpuModel} • ${data.cpu.cores} Cores`;
        elements.memInfo.textContent = `${data.memory.used} GB / ${data.memory.total} GB`;
        const memPercent = Math.round((data.memory.used / data.memory.total) * 100);
        elements.memoryBar.style.width = `${memPercent}%`;
        elements.memoryText.textContent = `${memPercent}% used`;
        elements.nodeInfo.textContent = data.node;
    } catch (error) {
        console.error('Failed to load specs:', error);
    }
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getOSName(platform) {
    const names = { 'win32': 'Windows', 'darwin': 'macOS', 'linux': 'Linux (VPS)' };
    return names[platform] || platform;
}

function setupIconUpload() {
    const zone = elements.iconUploadZone;
    const input = elements.iconInput;

    zone.addEventListener('click', () => {
        if (!selectedIcon) input.click();
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleIconFile(file);
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handleIconFile(file);
    });

    elements.removeIconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeIcon();
    });
}

function handleIconFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file (PNG or JPG)');
        return;
    }
    selectedIcon = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.iconPreviewImg.src = e.target.result;
        elements.uploadPlaceholder.classList.add('hidden');
        elements.uploadPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removeIcon() {
    selectedIcon = null;
    elements.iconInput.value = '';
    elements.iconPreviewImg.src = '';
    elements.uploadPlaceholder.classList.remove('hidden');
    elements.uploadPreview.classList.add('hidden');
}

function setupForm() {
    elements.buildForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await startBuild();
    });
    elements.retryBtn.addEventListener('click', () => resetForm());
}

function setupRefresh() {
    elements.refreshBtn.addEventListener('click', () => {
        loadStats();
        loadSpecs();
    });
}

async function startBuild() {
    const url = elements.urlInput.value.trim();
    const appName = elements.appNameInput.value.trim();

    if (!url || !appName) return;

    try {
        new URL(url);
    } catch {
        showError('URL tidak valid. Pastikan dimulai dengan http:// atau https://');
        return;
    }

    showProgress();

    try {
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 15, 90);
            elements.progressFill.style.width = `${progress}%`;
            if (progress < 20) elements.progressText.textContent = 'Preparing project...';
            else if (progress < 40) elements.progressText.textContent = 'Configuring Android project...';
            else if (progress < 60) elements.progressText.textContent = 'Building APK...';
            else if (progress < 80) elements.progressText.textContent = 'Compiling resources...';
            else elements.progressText.textContent = 'Finalizing...';
        }, 500);

        const formData = new FormData();
        formData.append('url', url);
        formData.append('appName', appName);
        formData.append('themeColor', '#2196F3');
        if (selectedIcon) formData.append('icon', selectedIcon);

        const response = await fetch('/api/build', {
            method: 'POST',
            headers: getAuthHeader(),
            body: formData
        });

        clearInterval(progressInterval);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Build failed');

        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = 'Build complete!';
        setTimeout(() => showResult(data.downloadUrl, data.expiresIn), 500);

    } catch (error) {
        showError(error.message);
    }
}

function showProgress() {
    elements.buildBtn.disabled = true;
    elements.buildProgress.classList.remove('hidden');
    elements.buildResult.classList.add('hidden');
    elements.buildError.classList.add('hidden');
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = 'Starting build...';
    saveBuildState('url', { status: 'progress' });
}

function showResult(downloadUrl, expiresIn) {
    if (!downloadUrl) {
        showError('Download link not available. Please try again.');
        return;
    }

    const savedUrl = downloadUrl;
    saveBuildState('url', { status: 'result', downloadUrl, expiresIn: expiresIn || 120 });

    setElementVisible(elements.buildProgress, false);
    setElementVisible(elements.buildError, false);
    setElementVisible(elements.buildResult, true);

    if (elements.downloadBtn) {
        elements.downloadBtn.href = downloadUrl;
        elements.downloadBtn.setAttribute('download', '');
    }

    let timeLeft = expiresIn || 60;
    if (elements.expireTime) elements.expireTime.textContent = timeLeft;

    if (expireCountdown) clearInterval(expireCountdown);
    expireCountdown = setInterval(() => {
        timeLeft--;
        if (elements.expireTime) elements.expireTime.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(expireCountdown);
            expireCountdown = null;
            resetForm();
        }
    }, 1000);

    setTimeout(() => {
        if (!isElementVisible(elements.buildResult)) {
            alert('Build berhasil! 🎉\n\nDownload APK Anda di:\n' + savedUrl);
        }
    }, 1000);
}

function showError(message) {
    elements.buildProgress.classList.add('hidden');
    elements.buildResult.classList.add('hidden');
    elements.buildError.classList.remove('hidden');
    elements.errorMessage.textContent = message;
    elements.buildBtn.disabled = false;
}

function resetForm() {
    elements.buildBtn.disabled = false;
    elements.buildProgress.classList.add('hidden');
    elements.buildResult.classList.add('hidden');
    elements.buildError.classList.add('hidden');
    elements.progressFill.style.width = '0%';
    removeIcon();
    if (expireCountdown) clearInterval(expireCountdown);
    expireCountdown = null;
    clearBuildState('url');
}

// ==================== ZIP BUILD ====================

function setupProjectTypePicker() {
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        if (btn.dataset.type === selectedProjectType) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedProjectType = btn.dataset.type;
        });
    });
}

function setupBuildTypePicker() {
    const buildBtns = document.querySelectorAll('.build-type-btn');
    buildBtns.forEach(btn => {
        if (btn.dataset.build === selectedBuildType) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
            buildBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBuildType = btn.dataset.build;
        });
    });
}

function setupZipUpload() {
    const zone = elements.zipUploadZone;
    const input = elements.zipInput;

    zone.addEventListener('click', () => {
        if (!selectedZipFile) input.click();
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleZipFile(file);
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.zip')) handleZipFile(file);
    });

    elements.removeZipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeZip();
    });
}

function handleZipFile(file) {
    if (!file.name.endsWith('.zip')) {
        showZipError('Please select a ZIP file');
        return;
    }
    if (file.size > 200 * 1024 * 1024) {
        showZipError('File too large. Max 200MB.');
        return;
    }
    selectedZipFile = file;
    elements.zipFileName.textContent = file.name;
    elements.zipPlaceholder.classList.add('hidden');
    elements.zipPreview.classList.remove('hidden');
}

function removeZip() {
    selectedZipFile = null;
    elements.zipInput.value = '';
    elements.zipFileName.textContent = '';
    elements.zipPlaceholder.classList.remove('hidden');
    elements.zipPreview.classList.add('hidden');
}

function setupZipForm() {
    elements.zipBuildForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await startZipBuild();
    });
    elements.zipRetryBtn.addEventListener('click', () => resetZipForm());
}

async function startZipBuild() {
    if (!selectedZipFile) {
        showZipError('Please select a ZIP file');
        return;
    }

    showZipProgress();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    let progressInterval = null;

    try {
        const formData = new FormData();
        formData.append('zipFile', selectedZipFile);
        formData.append('projectType', selectedProjectType);
        formData.append('buildType', selectedBuildType);
        formData.append('sessionId', sessionId);

        let progress = 5;
        progressInterval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 8, 90);
            elements.zipProgressFill.style.width = `${progress}%`;
            if (progress < 15) elements.zipProgressText.textContent = 'Uploading project...';
            else if (progress < 25) elements.zipProgressText.textContent = 'Extracting files...';
            else if (progress < 40) elements.zipProgressText.textContent = 'Installing dependencies...';
            else if (progress < 70) elements.zipProgressText.textContent = 'Building APK (this may take a while)...';
            else elements.zipProgressText.textContent = 'Finalizing build...';
        }, 2000);

        const response = await fetch('/api/build-zip', {
            method: 'POST',
            headers: getAuthHeader(),
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);

        if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Server error' }));
            throw new Error(data.error || `Build failed (HTTP ${response.status})`);
        }

        const data = await response.json();

        if (data.success && data.downloadUrl) {
            elements.zipProgressFill.style.width = '100%';
            elements.zipProgressText.textContent = 'Build complete!';
            setTimeout(() => showZipResult(data.downloadUrl, data.expiresIn || 120), 500);
            loadLogs();
        } else {
            throw new Error(data.error || 'Build failed');
        }

    } catch (error) {
        clearTimeout(timeoutId);
        if (progressInterval) clearInterval(progressInterval);
        let errorMessage = error.message;
        if (error.name === 'AbortError') errorMessage = 'Build timeout (30 minutes).';
        else if (error.message === 'Failed to fetch') errorMessage = 'Network error. Check your connection.';
        showZipError(errorMessage);
        loadLogs();
    }
}

function showZipProgress() {
    elements.zipBuildBtn.disabled = true;
    elements.zipBuildProgress.classList.remove('hidden');
    elements.zipBuildResult.classList.add('hidden');
    elements.zipBuildError.classList.add('hidden');
    elements.zipProgressFill.style.width = '0%';
    elements.zipProgressText.textContent = 'Starting build...';
    saveBuildState('zip', { status: 'progress' });
}

function showZipResult(downloadUrl, expiresIn) {
    if (!downloadUrl) {
        showZipError('Download link not available. Please try again.');
        return;
    }

    const savedUrl = downloadUrl;
    saveBuildState('zip', { status: 'result', downloadUrl, expiresIn: expiresIn || 120 });

    setElementVisible(elements.zipBuildProgress, false);
    setElementVisible(elements.zipBuildError, false);
    setElementVisible(elements.zipBuildResult, true);

    if (elements.zipDownloadBtn) {
        elements.zipDownloadBtn.href = downloadUrl;
        elements.zipDownloadBtn.setAttribute('download', '');
    }

    let timeLeft = expiresIn || 60;
    if (elements.zipExpireTime) elements.zipExpireTime.textContent = timeLeft;

    if (zipExpireCountdown) clearInterval(zipExpireCountdown);
    zipExpireCountdown = setInterval(() => {
        timeLeft--;
        if (elements.zipExpireTime) elements.zipExpireTime.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(zipExpireCountdown);
            zipExpireCountdown = null;
            resetZipForm();
        }
    }, 1000);

    setTimeout(() => {
        if (!isElementVisible(elements.zipBuildResult)) {
            alert('Build berhasil! 🎉\n\nDownload APK Anda di:\n' + savedUrl);
        }
    }, 1000);
}

function showZipError(message) {
    elements.zipBuildProgress.classList.add('hidden');
    elements.zipBuildResult.classList.add('hidden');
    elements.zipBuildError.classList.remove('hidden');
    elements.zipErrorMessage.textContent = message;
    elements.zipBuildBtn.disabled = false;
}

function resetZipForm() {
    elements.zipBuildBtn.disabled = false;
    elements.zipBuildProgress.classList.add('hidden');
    elements.zipBuildResult.classList.add('hidden');
    elements.zipBuildError.classList.add('hidden');
    elements.zipProgressFill.style.width = '0%';
    removeZip();
    if (zipExpireCountdown) clearInterval(zipExpireCountdown);
    zipExpireCountdown = null;
    clearBuildState('zip');
}

// ==================== LOGS PANEL ====================

let logsAutoRefreshInterval = null;
let isBuildInProgress = false;

function setupLogs() {
    logsToggle.addEventListener('click', (e) => {
        if (e.target.closest('.logs-refresh') || e.target.closest('.logs-clear')) return;
        logsCard.classList.toggle('collapsed');
    });

    logsRefreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadLogs();
    });

    if (logsClearBtn) {
        logsClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearLogs();
        });
    }

    startLogsAutoRefresh();
}

async function clearLogs() {
    try {
        const response = await fetch(`/api/logs?sessionId=${sessionId}`, { method: 'DELETE' });
        if (response.ok) {
            logsContainer.innerHTML = `
                <div class="log-empty">
                    <i class="ri-inbox-line"></i>
                    <span>No build logs yet</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to clear logs:', error);
    }
}

function startLogsAutoRefresh() {
    if (logsAutoRefreshInterval) clearInterval(logsAutoRefreshInterval);
    logsAutoRefreshInterval = setInterval(() => {
        loadLogs();
    }, isBuildInProgress ? 2000 : 5000);
}

function setBuildInProgress(inProgress) {
    isBuildInProgress = inProgress;
    startLogsAutoRefresh();
}

async function loadLogs() {
    try {
        const response = await fetch(`/api/logs?sessionId=${sessionId}`);
        const logs = await response.json();

        if (logs.length === 0) {
            logsContainer.innerHTML = `
                <div class="log-empty">
                    <i class="ri-inbox-line"></i>
                    <span>No build logs yet</span>
                </div>
            `;
            return;
        }

        const recentLog = logs[0];
        const isRecent = (Date.now() - new Date(recentLog.timestamp).getTime()) < 30000;
        const building = isRecent && !['success', 'error'].includes(recentLog.level);
        if (building !== isBuildInProgress) setBuildInProgress(building);

        logsContainer.innerHTML = logs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString('id-ID', {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const detailsHtml = log.details
                ? `<div class="log-details">${typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}</div>`
                : '';
            return `
                <div class="log-entry level-${log.level}">
                    <span class="log-time">${time}</span>
                    <span class="log-level">${log.level}</span>
                    <div class="log-message">
                        ${escapeHtml(log.message)}
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }).join('');

        logsContainer.scrollTop = 0;

    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}