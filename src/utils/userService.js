const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'users.json');

// Helper untuk format timestamp
function getTimestamp() {
    return new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Helper untuk escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

class UserService {
    constructor() {
        this.users = new Set();
        this.userDetails = new Map();
        this.statsCache = null;
        this.lastStatsUpdate = 0;
        this.STATS_CACHE_TTL = 60000; // 1 minute cache
        this.loadDatabase();
    }

    loadDatabase() {
        if (fs.existsSync(DB_PATH)) {
            try {
                const data = fs.readFileSync(DB_PATH, 'utf8');
                const parsed = JSON.parse(data);
                
                if (Array.isArray(parsed)) {
                    this.users = new Set(parsed);
                } else if (parsed.users) {
                    this.users = new Set(parsed.users);
                    if (parsed.userDetails) {
                        this.userDetails = new Map(Object.entries(parsed.userDetails));
                    }
                }
                
                console.log(`📂 Database loaded: ${this.users.size} users`);
            } catch (e) {
                console.error('Failed to load user database:', e.message);
            }
        }
    }

    saveUser(chatId, bot, userInfo = null) {
        if (!chatId) return false;

        const chatIdStr = String(chatId);
        const isNew = !this.users.has(chatIdStr);
        
        if (isNew) {
            this.users.add(chatIdStr);
            
            if (userInfo) {
                this.userDetails.set(chatIdStr, {
                    firstSeen: new Date().toISOString(),
                    username: userInfo.username || null,
                    firstName: userInfo.first_name || null,
                    lastName: userInfo.last_name || null,
                    languageCode: userInfo.language_code || null,
                    isPremium: userInfo.is_premium || false
                });
            }
            
            this.persist();
            this.invalidateCache();
            console.log(`✅ New user registered: ${chatIdStr}`);

            if (bot && process.env.ADMIN_IDS) {
                this.sendBackupToOwner(bot, chatIdStr, userInfo);
            }
            return true;
        }
        
        // Update existing user info if changed
        if (userInfo && this.userDetails.has(chatIdStr)) {
            const details = this.userDetails.get(chatIdStr);
            let updated = false;
            
            if (userInfo.username && details.username !== userInfo.username) {
                details.username = userInfo.username;
                updated = true;
            }
            if (userInfo.first_name && details.firstName !== userInfo.first_name) {
                details.firstName = userInfo.first_name;
                updated = true;
            }
            if (userInfo.last_name && details.lastName !== userInfo.last_name) {
                details.lastName = userInfo.last_name;
                updated = true;
            }
            
            if (updated) {
                this.userDetails.set(chatIdStr, details);
                this.persist();
            }
        }
        
        return false;
    }

    updateUserActivity(chatId) {
        const chatIdStr = String(chatId);
        if (this.users.has(chatIdStr)) {
            const details = this.userDetails.get(chatIdStr) || {};
            details.lastActive = new Date().toISOString();
            this.userDetails.set(chatIdStr, details);
            this.persist();
            this.invalidateCache();
        }
    }

    removeUser(chatId) {
        const chatIdStr = String(chatId);
        if (this.users.has(chatIdStr)) {
            this.users.delete(chatIdStr);
            this.userDetails.delete(chatIdStr);
            this.persist();
            this.invalidateCache();
            console.log(`🗑️ User removed: ${chatIdStr}`);
        }
    }

    persist() {
        try {
            const data = {
                users: [...this.users],
                userDetails: Object.fromEntries(this.userDetails),
                lastBackup: new Date().toISOString(),
                totalUsers: this.users.size,
                version: 2
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save database:', e.message);
        }
    }

    invalidateCache() {
        this.statsCache = null;
        this.lastStatsUpdate = 0;
    }

    async sendBackupToOwner(bot, newUser, userInfo = null) {
        const ownerId = process.env.ADMIN_IDS?.split(',')[0];
        if (!ownerId || !fs.existsSync(DB_PATH)) return;

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const timestamp = getTimestamp();
            const userInfoText = userInfo ? `
👤 <b>Username:</b> ${userInfo.username ? '@' + escapeHtml(userInfo.username) : '-'}
📛 <b>Name:</b> ${escapeHtml(userInfo.first_name || '-')} ${escapeHtml(userInfo.last_name || '')}
🌐 <b>Language:</b> ${userInfo.language_code || '-'}
⭐ <b>Premium:</b> ${userInfo.is_premium ? 'Yes' : 'No'}` : '';

            const caption = `
╔═══════════════════════════════╗
     💾  <b>DATABASE BACKUP</b>  💾
╚═══════════════════════════════╝

👤 <b>New User:</b> <code>${escapeHtml(newUser)}</code>${userInfoText}
👥 <b>Total Users:</b> <code>${this.users.size}</code>
📅 <b>Time:</b> ${timestamp}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 <i>File database terlampir</i>
            `.trim();

            await bot.sendDocument(ownerId, DB_PATH, {
                caption: caption,
                parse_mode: 'HTML'
            });
        } catch (e) {
            console.error('Failed to send backup:', e.message);
        }
    }

    getBroadcastList() {
        return [...this.users];
    }

    getCount() {
        return this.users.size;
    }

    hasUser(chatId) {
        return this.users.has(String(chatId));
    }

    getUserInfo(chatId) {
        return this.userDetails.get(String(chatId)) || null;
    }

    getAllUsersInfo() {
        const users = [];
        for (const userId of this.users) {
            users.push({
                id: userId,
                info: this.userDetails.get(userId) || null
            });
        }
        return users;
    }

    getStats() {
        // Check cache
        if (this.statsCache && (Date.now() - this.lastStatsUpdate) < this.STATS_CACHE_TTL) {
            return this.statsCache;
        }
        
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        let active24h = 0;
        let active7d = 0;
        let withUsername = 0;
        let premium = 0;
        
        for (const details of this.userDetails.values()) {
            if (details.username) withUsername++;
            if (details.isPremium) premium++;
            
            if (details.lastActive) {
                const lastActive = new Date(details.lastActive);
                if (lastActive > oneDayAgo) active24h++;
                if (lastActive > oneWeekAgo) active7d++;
            }
        }
        
        const stats = {
            total: this.users.size,
            active24h,
            active7d,
            withUsername,
            premium,
            lastBackup: new Date().toISOString()
        };
        
        // Update cache
        this.statsCache = stats;
        this.lastStatsUpdate = Date.now();
        
        return stats;
    }

    async sendStatsToOwner(bot) {
        const ownerId = process.env.ADMIN_IDS?.split(',')[0];
        if (!ownerId) return;

        const stats = this.getStats();
        const timestamp = getTimestamp();

        const message = `
╔═══════════════════════════════╗
     📊  <b>USER STATISTICS</b>  📊
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>Total Users:</b> <code>${stats.total}</code>
🟢 <b>Active (24h):</b> <code>${stats.active24h}</code>
🟡 <b>Active (7d):</b> <code>${stats.active7d}</code>
👤 <b>With Username:</b> <code>${stats.withUsername}</code>
⭐ <b>Premium Users:</b> <code>${stats.premium}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Report Time:</b> ${timestamp}
        `.trim();

        await bot.sendMessage(ownerId, message, { parse_mode: 'HTML' });
    }

    // Export database to JSON string
    exportDatabase() {
        return {
            users: [...this.users],
            userDetails: Object.fromEntries(this.userDetails),
            exportedAt: new Date().toISOString(),
            totalUsers: this.users.size,
            version: 2
        };
    }

    // Import database from JSON
    importDatabase(data) {
        if (data.users && Array.isArray(data.users)) {
            this.users = new Set(data.users);
            if (data.userDetails) {
                this.userDetails = new Map(Object.entries(data.userDetails));
            }
            this.persist();
            this.invalidateCache();
            console.log(`📥 Database imported: ${this.users.size} users`);
            return true;
        }
        return false;
    }

    // Get user by username
    getUserByUsername(username) {
        if (!username) return null;
        const searchUsername = username.toLowerCase().replace('@', '');
        
        for (const [userId, details] of this.userDetails.entries()) {
            if (details.username && details.username.toLowerCase() === searchUsername) {
                return { id: userId, info: details };
            }
        }
        return null;
    }

    // Search users
    searchUsers(query) {
        const results = [];
        const searchLower = query.toLowerCase();
        
        for (const userId of this.users) {
            const details = this.userDetails.get(userId);
            if (details) {
                if (details.username && details.username.toLowerCase().includes(searchLower)) {
                    results.push({ id: userId, info: details, match: 'username' });
                } else if (details.firstName && details.firstName.toLowerCase().includes(searchLower)) {
                    results.push({ id: userId, info: details, match: 'name' });
                }
            } else if (userId.includes(searchLower)) {
                results.push({ id: userId, info: null, match: 'id' });
            }
        }
        
        return results;
    }
}

module.exports = new UserService();