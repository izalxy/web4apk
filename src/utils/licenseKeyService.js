/**
 * License Key Service
 * Manages license keys with single device binding per type (APK + Web)
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'license_keys.json');

class LicenseKeyService {
    constructor() {
        this.keys = {};
        this.loadDatabase();
    }

    loadDatabase() {
        if (fs.existsSync(DB_PATH)) {
            try {
                const data = fs.readFileSync(DB_PATH, 'utf8');
                this.keys = JSON.parse(data);
                console.log(`🔑 License keys loaded: ${Object.keys(this.keys).length} keys`);
            } catch (e) {
                console.error('Failed to load license keys:', e.message);
                this.keys = {};
            }
        }
    }

    persist() {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(this.keys, null, 2));
        } catch (e) {
            console.error('Failed to save license keys:', e.message);
        }
    }

    /**
     * Generate a new license key
     * @param {string} username - Username for the key
     * @param {number} days - Number of days until expiration
     * @param {string} telegramId - Telegram User ID for sending download links
     * @returns {object} - { success, key, expiresAt } or { success, error }
     */
    createKey(username, days, telegramId = null) {
        if (!username || typeof username !== 'string') {
            return { success: false, error: 'Username tidak valid' };
        }

        if (!days || days < 1 || days > 365) {
            return { success: false, error: 'Hari harus antara 1-365' };
        }

        // Normalize username
        const normalizedUsername = username.toLowerCase().trim();

        // Check if username already exists
        if (this.keys[normalizedUsername]) {
            return { success: false, error: `Username "${normalizedUsername}" sudah ada` };
        }

        // Generate random key
        const key = crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();

        // Calculate expiration
        const now = new Date();
        const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        // Store key with telegramId
        this.keys[normalizedUsername] = {
            key: key,
            expiresAt: expiresAt.toISOString(),
            deviceId: null,
            devices: {}, // Multi-device support: { apk: 'deviceId', web: 'deviceId' }
            telegramId: telegramId ? String(telegramId).trim() : null,
            createdAt: now.toISOString(),
            lastLoginAt: null,
            loginCount: 0
        };

        this.persist();

        return {
            success: true,
            username: normalizedUsername,
            key: key,
            expiresAt: expiresAt.toISOString(),
            telegramId: telegramId ? String(telegramId).trim() : null,
            days: days
        };
    }

    /**
     * Delete a license key
     * @param {string} username - Username to delete
     * @returns {object} - { success } or { success, error }
     */
    deleteKey(username) {
        const normalizedUsername = username.toLowerCase().trim();

        if (!this.keys[normalizedUsername]) {
            return { success: false, error: `Username "${normalizedUsername}" tidak ditemukan` };
        }

        delete this.keys[normalizedUsername];
        this.persist();

        return { success: true, username: normalizedUsername };
    }

    /**
     * Get all license keys
     * @returns {array} - Array of { username, expiresAt, deviceId, telegramId, isActive }
     */
    listKeys() {
        const now = new Date();
        return Object.entries(this.keys).map(([username, data]) => {
            const expiresAt = new Date(data.expiresAt);
            const isExpired = expiresAt < now;
            const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

            return {
                username,
                key: data.key,
                expiresAt: data.expiresAt,
                deviceId: data.deviceId,
                devices: data.devices || {},
                telegramId: data.telegramId || null,
                isExpired,
                daysLeft: isExpired ? 0 : daysLeft,
                createdAt: data.createdAt,
                lastLoginAt: data.lastLoginAt,
                loginCount: data.loginCount || 0
            };
        });
    }

    /**
     * Get Telegram ID by username
     * @param {string} username - Username to lookup
     * @returns {string|null} - Telegram ID or null if not found
     */
    getTelegramIdByUsername(username) {
        const normalizedUsername = username.toLowerCase().trim();
        const userData = this.keys[normalizedUsername];
        return userData?.telegramId || null;
    }

    /**
     * Get username by license key
     * @param {string} key - License key
     * @returns {string|null} - Username or null
     */
    getUsernameByKey(key) {
        const entry = Object.entries(this.keys).find(([_, data]) => data.key === key);
        return entry ? entry[0] : null;
    }

    /**
     * Validate login attempt
     * Allows 1 APK device + 1 Web device per account
     * @param {string} username - Username
     * @param {string} key - License key
     * @param {string} deviceId - Device ID (prefixed with 'web-' for web)
     * @returns {object} - { success, expiresAt } or { success, error }
     */
    validateLogin(username, key, deviceId) {
        const normalizedUsername = username.toLowerCase().trim();
        const userData = this.keys[normalizedUsername];

        // Check if user exists
        if (!userData) {
            return { success: false, error: 'Username tidak ditemukan' };
        }

        // Check key
        if (userData.key !== key) {
            return { success: false, error: 'License key salah' };
        }

        // Check expiration
        const expiresAt = new Date(userData.expiresAt);
        if (expiresAt < new Date()) {
            return { success: false, error: 'License key sudah expired' };
        }

        // Determine device type from deviceId prefix
        const isWebDevice = deviceId.startsWith('web-');
        const deviceType = isWebDevice ? 'web' : 'apk';

        // Initialize devices object if not exists (migration from old format)
        if (!userData.devices) {
            userData.devices = {};
            // Migrate old single deviceId to new format
            if (userData.deviceId) {
                const oldIsWeb = userData.deviceId.startsWith('web-');
                userData.devices[oldIsWeb ? 'web' : 'apk'] = userData.deviceId;
            }
        }

        // Check if this device type slot is already taken by different device
        const existingDevice = userData.devices[deviceType];
        if (existingDevice && existingDevice !== deviceId) {
            const deviceName = deviceType === 'web' ? 'browser' : 'HP';
            return {
                success: false,
                error: `Akun sudah login di ${deviceName} lain. Logout dari ${deviceName} sebelumnya terlebih dahulu.`
            };
        }

        // Bind device to its slot
        userData.devices[deviceType] = deviceId;
        // Keep old format for backwards compatibility
        userData.deviceId = userData.devices['apk'] || userData.devices['web'];
        
        // Update login stats
        userData.lastLoginAt = new Date().toISOString();
        userData.loginCount = (userData.loginCount || 0) + 1;
        
        this.persist();

        return {
            success: true,
            username: normalizedUsername,
            expiresAt: userData.expiresAt
        };
    }

    /**
     * Verify session is still valid
     * Supports multi-device (APK + Web)
     * @param {string} username - Username
     * @param {string} deviceId - Device ID
     * @returns {object} - { valid, expiresAt } or { valid, reason }
     */
    verifySession(username, deviceId) {
        const normalizedUsername = username.toLowerCase().trim();
        const userData = this.keys[normalizedUsername];

        if (!userData) {
            return { valid: false, reason: 'User tidak ditemukan' };
        }

        // Check expiration
        const expiresAt = new Date(userData.expiresAt);
        if (expiresAt < new Date()) {
            return { valid: false, reason: 'License expired' };
        }

        // Determine device type
        const isWebDevice = deviceId.startsWith('web-');
        const deviceType = isWebDevice ? 'web' : 'apk';

        // Check device in multi-device format
        if (userData.devices) {
            if (userData.devices[deviceType] !== deviceId) {
                return { valid: false, reason: 'Device tidak cocok' };
            }
        } else {
            // Fallback to old single device format
            if (userData.deviceId !== deviceId) {
                return { valid: false, reason: 'Device tidak cocok' };
            }
        }

        return {
            valid: true,
            username: normalizedUsername,
            expiresAt: userData.expiresAt
        };
    }

    /**
     * Logout - clear device binding for specific device type
     * @param {string} username - Username
     * @param {string} deviceId - Device ID (for verification)
     * @returns {object} - { success } or { success, error }
     */
    logout(username, deviceId) {
        const normalizedUsername = username.toLowerCase().trim();
        const userData = this.keys[normalizedUsername];

        if (!userData) {
            return { success: false, error: 'User tidak ditemukan' };
        }

        // Determine device type
        const isWebDevice = deviceId.startsWith('web-');
        const deviceType = isWebDevice ? 'web' : 'apk';

        // Handle multi-device format
        if (userData.devices) {
            if (userData.devices[deviceType] !== deviceId) {
                return { success: false, error: 'Device tidak cocok' };
            }
            // Clear only this device type slot
            delete userData.devices[deviceType];
            // Update legacy field
            userData.deviceId = userData.devices['apk'] || userData.devices['web'] || null;
        } else {
            // Fallback to old single device format
            if (userData.deviceId !== deviceId) {
                return { success: false, error: 'Device tidak cocok' };
            }
            userData.deviceId = null;
        }

        this.persist();
        return { success: true };
    }

    /**
     * Extend license key duration
     * @param {string} username - Username
     * @param {number} additionalDays - Additional days to add
     * @returns {object} - { success, newExpiresAt } or { success, error }
     */
    extendKey(username, additionalDays) {
        const normalizedUsername = username.toLowerCase().trim();
        const userData = this.keys[normalizedUsername];

        if (!userData) {
            return { success: false, error: `Username "${normalizedUsername}" tidak ditemukan` };
        }

        if (!additionalDays || additionalDays < 1 || additionalDays > 365) {
            return { success: false, error: 'Hari harus antara 1-365' };
        }

        const currentExpiry = new Date(userData.expiresAt);
        const now = new Date();
        
        // If already expired, start from now
        const newExpiry = currentExpiry < now 
            ? new Date(now.getTime() + additionalDays * 24 * 60 * 60 * 1000)
            : new Date(currentExpiry.getTime() + additionalDays * 24 * 60 * 60 * 1000);
        
        userData.expiresAt = newExpiry.toISOString();
        this.persist();

        return {
            success: true,
            username: normalizedUsername,
            newExpiresAt: userData.expiresAt,
            additionalDays: additionalDays
        };
    }

    /**
     * Get key info
     * @param {string} username - Username
     * @returns {object|null} - Key data or null
     */
    getKeyInfo(username) {
        const normalizedUsername = username.toLowerCase().trim();
        const data = this.keys[normalizedUsername];
        
        if (!data) return null;
        
        const expiresAt = new Date(data.expiresAt);
        const now = new Date();
        
        return {
            ...data,
            isExpired: expiresAt < now,
            daysLeft: Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))
        };
    }

    /**
     * Get all active sessions (logged in devices)
     * @returns {array} - Array of active sessions
     */
    getActiveSessions() {
        const sessions = [];
        
        for (const [username, data] of Object.entries(this.keys)) {
            if (data.devices) {
                for (const [type, deviceId] of Object.entries(data.devices)) {
                    if (deviceId) {
                        sessions.push({
                            username,
                            type,
                            deviceId,
                            expiresAt: data.expiresAt
                        });
                    }
                }
            } else if (data.deviceId) {
                // Legacy format
                const type = data.deviceId.startsWith('web-') ? 'web' : 'apk';
                sessions.push({
                    username,
                    type,
                    deviceId: data.deviceId,
                    expiresAt: data.expiresAt
                });
            }
        }
        
        return sessions;
    }

    /**
     * Get statistics
     * @returns {object} - Statistics object
     */
    getStats() {
        const keys = Object.values(this.keys);
        const now = new Date();
        
        const active = keys.filter(k => new Date(k.expiresAt) > now).length;
        const expired = keys.filter(k => new Date(k.expiresAt) <= now).length;
        const loggedIn = keys.filter(k => k.deviceId || (k.devices && Object.keys(k.devices).length > 0)).length;
        
        return {
            total: keys.length,
            active,
            expired,
            loggedIn
        };
    }
}

module.exports = new LicenseKeyService();