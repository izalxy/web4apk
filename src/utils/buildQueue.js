/**
 * Build Queue System - Single Build Lock with Timeout & Auto-Recovery
 * Ensures only one build runs at a time and auto-releases stuck builds
 */

class BuildQueue {
    constructor() {
        this.isBuilding = false;
        this.currentBuildChatId = null;
        this.currentBuildUsername = null;
        this.buildStartTime = null;
        this.lastActivityTime = null;
        this.buildType = null; // 'url' or 'zip'
        this.waitingQueue = []; // Queue for waiting users
        this.stats = {
            totalBuilds: 0,
            successfulBuilds: 0,
            failedBuilds: 0,
            totalBuildTime: 0,
            zipBuilds: 0,
            urlBuilds: 0
        };

        // Timeout settings
        this.MAX_BUILD_TIME = 45 * 60 * 1000;      // 45 minutes absolute max
        this.INACTIVITY_TIMEOUT = 10 * 60 * 1000;  // 10 minutes no activity
        this.WATCHDOG_INTERVAL = 30 * 1000;        // Check every 30 seconds

        // Start watchdog to detect stuck builds
        this.watchdogInterval = null;
        this.startWatchdog();
    }

    /**
     * Start watchdog to check for stuck builds
     */
    startWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
        }
        this.watchdogInterval = setInterval(() => {
            this.checkStuckBuilds();
        }, this.WATCHDOG_INTERVAL);
    }

    /**
     * Stop watchdog
     */
    stopWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
    }

    /**
     * Check and auto-release stuck builds
     */
    checkStuckBuilds() {
        if (!this.isBuilding) return;

        const now = Date.now();
        const totalTime = now - this.buildStartTime;
        const inactiveTime = now - (this.lastActivityTime || this.buildStartTime);

        // Force release if exceeded max time
        if (totalTime > this.MAX_BUILD_TIME) {
            console.warn(`[Queue] ⚠️ BUILD TIMEOUT! Total time ${Math.round(totalTime / 60000)}m exceeded limit. Force releasing...`);
            this.forceRelease('Build timeout exceeded');
            return;
        }

        // Force release if inactive too long
        if (inactiveTime > this.INACTIVITY_TIMEOUT) {
            console.warn(`[Queue] ⚠️ BUILD INACTIVE! No activity for ${Math.round(inactiveTime / 60000)}m. Force releasing...`);
            this.forceRelease('Build inactive timeout');
            return;
        }

        // Log status for monitoring (every 5 minutes)
        const totalMinutes = Math.round(totalTime / 60000);
        if (totalMinutes > 0 && totalMinutes % 5 === 0 && Math.floor(Date.now() / 60000) % 5 === 0) {
            console.log(`[Queue] 📊 Build running: ${totalMinutes}m, last activity: ${Math.round(inactiveTime / 1000)}s ago`);
        }
    }

    /**
     * Update activity timestamp (call during build progress)
     */
    updateActivity() {
        this.lastActivityTime = Date.now();
    }

    /**
     * Check if a build is currently in progress
     * @returns {boolean}
     */
    isBusy() {
        return this.isBuilding;
    }

    /**
     * Get current build info
     * @returns {object|null}
     */
    getCurrentBuild() {
        if (!this.isBuilding) return null;
        return {
            chatId: this.currentBuildChatId,
            username: this.currentBuildUsername,
            buildType: this.buildType,
            startTime: this.buildStartTime,
            duration: Date.now() - this.buildStartTime,
            lastActivity: this.lastActivityTime,
            waitingCount: this.waitingQueue.length
        };
    }

    /**
     * Lock the build queue for a specific chat
     * @param {number|string} chatId - Chat ID of the user
     * @param {string} username - Username of the user (optional)
     * @param {string} buildType - Type of build ('url' or 'zip')
     * @returns {boolean} - True if lock acquired, false if busy
     */
    acquire(chatId, username = null, buildType = 'url') {
        // Convert chatId to string for consistent comparison
        const chatIdStr = String(chatId);
        
        if (this.isBuilding) {
            // Check if user already in queue
            const alreadyInQueue = this.waitingQueue.some(item => String(item.chatId) === chatIdStr);
            if (!alreadyInQueue) {
                this.waitingQueue.push({
                    chatId: chatIdStr,
                    username,
                    buildType,
                    timestamp: Date.now()
                });
                console.log(`[Queue] 📝 Added chat ${chatIdStr} to waiting queue (position: ${this.waitingQueue.length})`);
            } else {
                console.log(`[Queue] ⚠️ Chat ${chatIdStr} already in waiting queue`);
            }
            return false;
        }

        this.isBuilding = true;
        this.currentBuildChatId = chatIdStr;
        this.currentBuildUsername = username;
        this.buildType = buildType;
        this.buildStartTime = Date.now();
        this.lastActivityTime = Date.now();
        this.stats.totalBuilds++;
        
        if (buildType === 'zip') {
            this.stats.zipBuilds++;
        } else {
            this.stats.urlBuilds++;
        }
        
        console.log(`[Queue] ✅ Build started for chat ${chatIdStr} (${username || 'unknown'}) - Type: ${buildType}`);
        return true;
    }

    /**
     * Release the build lock and process next in queue
     * @param {number|string} chatId - Chat ID of the user (for verification)
     * @param {boolean} success - Whether build was successful
     * @returns {object|null} - Next user in queue or null
     */
    release(chatId = null, success = true) {
        const chatIdStr = chatId ? String(chatId) : null;
        
        if (chatIdStr && this.currentBuildChatId !== chatIdStr) {
            console.warn(`[Queue] ⚠️ Attempted to release lock by wrong chat: ${chatIdStr}, current: ${this.currentBuildChatId}`);
        }

        const duration = this.buildStartTime ? Date.now() - this.buildStartTime : 0;
        
        // Update statistics
        if (success) {
            this.stats.successfulBuilds++;
        } else {
            this.stats.failedBuilds++;
        }
        this.stats.totalBuildTime += duration;
        
        console.log(`[Queue] ✅ Build completed for chat ${this.currentBuildChatId} (${Math.round(duration / 1000)}s) - ${success ? 'SUCCESS' : 'FAILED'}`);

        this.isBuilding = false;
        this.currentBuildChatId = null;
        this.currentBuildUsername = null;
        this.buildStartTime = null;
        this.lastActivityTime = null;

        // Process next in queue
        if (this.waitingQueue.length > 0) {
            const next = this.waitingQueue.shift();
            console.log(`[Queue] 🔄 Processing next in queue: chat ${next.chatId} (${next.username || 'unknown'})`);
            return next;
        }
        
        return null;
    }

    /**
     * Force release (for error recovery or admin)
     * @param {string} reason - Reason for force release
     */
    forceRelease(reason = 'Manual force release') {
        console.log(`[Queue] 🔄 Force releasing lock for chat ${this.currentBuildChatId} - Reason: ${reason}`);
        this.isBuilding = false;
        this.currentBuildChatId = null;
        this.currentBuildUsername = null;
        this.buildStartTime = null;
        this.lastActivityTime = null;
    }

    /**
     * Clear entire waiting queue
     * @returns {number} - Number of items cleared
     */
    clearQueue() {
        const count = this.waitingQueue.length;
        this.waitingQueue = [];
        console.log(`[Queue] 🗑️ Cleared ${count} items from waiting queue`);
        return count;
    }

    /**
     * Remove user from waiting queue
     * @param {number|string} chatId - Chat ID to remove
     * @returns {boolean} - True if removed
     */
    removeFromQueue(chatId) {
        const chatIdStr = String(chatId);
        const index = this.waitingQueue.findIndex(item => String(item.chatId) === chatIdStr);
        if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            console.log(`[Queue] 🗑️ Removed chat ${chatIdStr} from waiting queue`);
            return true;
        }
        return false;
    }

    /**
     * Get queue position for a user
     * @param {number|string} chatId - Chat ID
     * @returns {number} - Position (0 if not in queue)
     */
    getQueuePosition(chatId) {
        const chatIdStr = String(chatId);
        const index = this.waitingQueue.findIndex(item => String(item.chatId) === chatIdStr);
        return index !== -1 ? index + 1 : 0;
    }

    /**
     * Get waiting queue count
     * @returns {number}
     */
    getWaitingCount() {
        return this.waitingQueue.length;
    }

    /**
     * Get formatted status message for Telegram
     * @returns {string}
     */
    getStatusMessage() {
        if (!this.isBuilding) {
            const waitingCount = this.waitingQueue.length;
            if (waitingCount > 0) {
                return `✅ Server siap\n📝 Antrian: ${waitingCount} user`;
            }
            return '✅ Server siap untuk build';
        }

        const duration = Math.round((Date.now() - this.buildStartTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const waitingCount = this.waitingQueue.length;

        let status = `⏳ <b>Server sedang build</b>\n`;
        status += `━━━━━━━━━━━━━━━━━━\n`;
        status += `📱 Type: ${this.buildType === 'url' ? 'URL Build' : 'ZIP Build'}\n`;
        status += `⏱️ Durasi: ${minutes}m ${seconds}s\n`;
        
        if (waitingCount > 0) {
            status += `📝 Antrian: ${waitingCount} user\n`;
        }
        
        status += `━━━━━━━━━━━━━━━━━━\n`;
        status += `💡 <i>Silakan tunggu giliran Anda...</i>`;

        return status;
    }

    /**
     * Get formatted waiting message for user
     * @param {number} position - Position in queue
     * @returns {string}
     */
    getWaitingMessage(position) {
        const currentBuild = this.getCurrentBuild();
        const estimatedTimePerBuild = currentBuild ? Math.ceil((currentBuild.duration || 0) / 60000) : 5;
        
        return `
⏳ <b>Build Dalam Antrian</b>
━━━━━━━━━━━━━━━━━━

📋 <b>Posisi Anda:</b> #${position}
👥 <b>Total Antrian:</b> ${this.waitingQueue.length} user
⏱️ <b>Estimasi Tunggu:</b> ~${estimatedTimePerBuild * position} menit

📱 <b>Sedang diproses:</b> ${currentBuild?.username || 'Unknown'}

💡 <i>Bot akan memberi tahu saat giliran Anda tiba.</i>
        `.trim();
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        const avgTime = this.stats.successfulBuilds > 0 
            ? Math.round(this.stats.totalBuildTime / this.stats.successfulBuilds / 1000) 
            : 0;
        
        return {
            total: this.stats.totalBuilds,
            successful: this.stats.successfulBuilds,
            failed: this.stats.failedBuilds,
            successRate: this.stats.totalBuilds > 0 
                ? Math.round((this.stats.successfulBuilds / this.stats.totalBuilds) * 100) 
                : 0,
            avgBuildTime: avgTime,
            waitingQueue: this.waitingQueue.length,
            isBuilding: this.isBuilding,
            zipBuilds: this.stats.zipBuilds,
            urlBuilds: this.stats.urlBuilds
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalBuilds: 0,
            successfulBuilds: 0,
            failedBuilds: 0,
            totalBuildTime: 0,
            zipBuilds: 0,
            urlBuilds: 0
        };
        console.log(`[Queue] 📊 Statistics reset`);
    }

    /**
     * Get queue info as array
     * @returns {Array}
     */
    getQueueList() {
        return [...this.waitingQueue];
    }
}

// Singleton instance
const buildQueue = new BuildQueue();

module.exports = { buildQueue };