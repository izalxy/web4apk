// ==================== BACKUP SERVICE ====================
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');
const moment = require('moment');

// Folder yang TIDAK akan di-backup
const EXCLUDED_TOP_LEVEL = new Set([
    'node_modules',
    '.git', 
    'sessions',
    'Q U A N T U M',
    'logs',
    'backups',
    'temp',
    'output',
    '.env',
    '.vscode',
    'dist',
    'build',
    'android-template/build',
    'android-template/.gradle'
]);

// File/folder pattern yang TIDAK akan di-backup
const EXCLUDED_PATTERNS = [
    '*.log',
    '*.tmp', 
    '*.cache',
    '.DS_Store',
    'Thumbs.db',
    '*.zip',
    '*.rar',
    '*.7z',
    '*.apk',
    'npm-debug.log',
    'yarn-error.log',
    '*.pyc',
    '__pycache__'
];

// Maksimal jumlah backup yang disimpan
const MAX_BACKUP_COUNT = 10;

class BackupService {
    constructor() {
        this.basePath = path.resolve(__dirname, '..', '..');
        this.backupDir = path.join(this.basePath, 'backups');
        this.scheduledJob = null;
        
        // Buat folder backup kalo belum ada
        fs.ensureDirSync(this.backupDir);
        
        // Cleanup old backups on startup
        this.cleanupOldBackups();
    }

    /**
     * Cleanup old backups, keep only MAX_BACKUP_COUNT
     */
    async cleanupOldBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backupFiles = files
                .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    mtime: fs.statSync(path.join(this.backupDir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            const toDelete = backupFiles.slice(MAX_BACKUP_COUNT);
            for (const file of toDelete) {
                await fs.remove(file.path);
                console.log(`🗑️ Deleted old backup: ${file.name}`);
            }
            
            if (toDelete.length > 0) {
                console.log(`✅ Cleaned up ${toDelete.length} old backups`);
            }
        } catch (error) {
            console.error('Failed to cleanup old backups:', error.message);
        }
    }

    /**
     * Schedule automatic backup
     * @param {number} hours - Interval in hours
     * @returns {boolean} - Success status
     */
    scheduleBackup(hours) {
        if (this.scheduledJob) {
            this.scheduledJob.stop();
        }
        
        console.log(`⏰ Menjadwalkan backup setiap ${hours} jam sekali`);
        
        this.scheduledJob = cron.schedule(`0 */${hours} * * *`, async () => {
            console.log(`🔄 Memulai backup otomatis...`);
            await this.performBackup('auto');
        });
        
        return true;
    }

    /**
     * Stop scheduled backup
     */
    stopScheduledBackup() {
        if (this.scheduledJob) {
            this.scheduledJob.stop();
            this.scheduledJob = null;
            console.log('⏰ Scheduled backup stopped');
        }
    }

    /**
     * Perform backup
     * @param {string} type - 'auto' or 'manual'
     * @returns {Promise<object>} - Backup result
     */
    async performBackup(type = 'manual') {
        const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
        const backupName = `backup_${timestamp}.zip`;
        const backupPath = path.join(this.backupDir, backupName);

        return new Promise(async (resolve, reject) => {
            const output = fs.createWriteStream(backupPath);
            const archive = archiver('zip', { 
                zlib: { level: 9 }
            });

            let totalSize = 0;
            let includedCount = 0;
            let excludedCount = 0;

            output.on('close', async () => {
                const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
                console.log(`✅ Backup selesai: ${backupName} (${sizeMB} MB)`);
                
                // Cleanup old backups after successful backup
                await this.cleanupOldBackups();
                
                resolve({
                    success: true,
                    path: backupPath,
                    name: backupName,
                    size: sizeMB,
                    type: type,
                    timestamp: timestamp
                });
            });

            archive.on('error', (err) => {
                reject(err);
            });
            
            archive.pipe(output);

            try {
                const files = await fs.readdir(this.basePath);
                
                for (const file of files) {
                    if (EXCLUDED_TOP_LEVEL.has(file)) {
                        excludedCount++;
                        console.log(`⏭️ Skip excluded: ${file}`);
                        continue;
                    }

                    const filePath = path.join(this.basePath, file);
                    const stat = await fs.stat(filePath);

                    if (stat.isDirectory()) {
                        archive.directory(filePath, {
                            name: file,
                            ignore: EXCLUDED_PATTERNS,
                            dot: false
                        }, { prefix: file });
                        console.log(`📁 Adding directory: ${file}`);
                    } else {
                        if (stat.size > 50 * 1024 * 1024) {
                            console.log(`⚠️ Skip large file: ${file} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
                            excludedCount++;
                            continue;
                        }
                        archive.file(filePath, { name: file });
                        console.log(`📄 Adding file: ${file}`);
                        totalSize += stat.size;
                    }
                    includedCount++;
                }

                // Add database files if they exist
                const dbFiles = ['users.json', 'license_keys.json'];
                for (const dbFile of dbFiles) {
                    const dbPath = path.join(this.basePath, dbFile);
                    if (await fs.pathExists(dbPath)) {
                        archive.file(dbPath, { name: dbFile });
                        console.log(`📄 Adding database: ${dbFile}`);
                        includedCount++;
                    }
                }

                console.log(`📊 Statistik: ${includedCount} item di-backup, ${excludedCount} item di-skip`);
                console.log(`💾 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
                
                archive.finalize();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send backup to Telegram
     * @param {Object} bot - Telegram bot instance
     * @param {string} type - 'auto' or 'manual'
     * @returns {Promise<boolean>} - Success status
     */
    async sendToTelegram(bot, type = "manual") {
        const adminIds = (process.env.ADMIN_IDS || '').split(',').filter(id => id.trim());
        const chatId = adminIds[0] ? adminIds[0].trim() : null;

        if (!chatId) {
            console.log("⚠️ ADMIN_IDS tidak ditemukan di environment variable");
            return false;
        }

        if (!bot) {
            console.log("⚠️ Bot instance tidak tersedia");
            return false;
        }

        try {
            console.log(`📤 Mengirim backup ke Telegram ${type === 'auto' ? '(otomatis)' : '(manual)'}...`);
            
            // Send processing message first
            const processMsg = await bot.sendMessage(chatId, `
⏳ <b>Memproses backup...</b>

📦 Membuat archive...
🕐 Estimasi: ~${type === 'auto' ? '3-5' : '1-2'} menit

<i>Mohon tunggu...</i>
            `.trim(), { parse_mode: 'HTML' }).catch(() => null);

            // Perform backup
            const result = await this.performBackup(type);
            
            if (!result.success) {
                throw new Error('Backup failed');
            }

            // Format caption
            const caption = `
╔═══════════════════════════════╗
     📦  <b>BACKUP DATABASE</b>  📦
╚═══════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>Tanggal:</b> ${moment().format('DD/MM/YYYY HH:mm:ss')}
💾 <b>Ukuran:</b> ${result.size} MB
🔄 <b>Tipe:</b> ${type === 'auto' ? 'Otomatis' : 'Manual'}
📁 <b>Nama:</b> <code>${result.name}</code>

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 <i>Backup ini berisi seluruh data project.</i>
            `.trim();

            // Send backup file
            await bot.sendDocument(chatId, result.path, {
                caption: caption,
                parse_mode: 'HTML'
            });

            console.log(`✅ Backup berhasil dikirim ke ${chatId}`);
            
            // Delete local backup file after sending
            await fs.remove(result.path).catch(() => {});
            console.log("🗑️ File backup lokal dihapus");

            // Delete processing message
            if (processMsg) {
                await bot.deleteMessage(chatId, processMsg.message_id).catch(() => {});
            }

            return true;

        } catch (error) {
            console.log("❌ Gagal mengirim backup:", error.message);
            
            if (bot && chatId) {
                await bot.sendMessage(chatId, `
❌ <b>Gagal membuat backup</b>

Error: <code>${error.message}</code>

💡 <i>Silakan coba lagi nanti atau periksa storage.</i>
                `.trim(), { parse_mode: 'HTML' }).catch(() => {});
            }
            
            return false;
        }
    }

    /**
     * List all available backups
     * @returns {Promise<Array>} - List of backups
     */
    async listBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backups = files
                .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
                .map(f => {
                    const stats = fs.statSync(path.join(this.backupDir, f));
                    return {
                        name: f,
                        path: path.join(this.backupDir, f),
                        size: (stats.size / 1024 / 1024).toFixed(2),
                        created: stats.mtime,
                        timestamp: f.replace('backup_', '').replace('.zip', '')
                    };
                })
                .sort((a, b) => b.created - a.created);
            
            return backups;
        } catch (error) {
            console.error('Failed to list backups:', error.message);
            return [];
        }
    }

    /**
     * Restore from backup file
     * @param {string} backupName - Name of backup file
     * @param {string} targetPath - Target path to restore to
     * @returns {Promise<boolean>} - Success status
     */
    async restoreBackup(backupName, targetPath) {
        const backupPath = path.join(this.backupDir, backupName);
        
        if (!await fs.pathExists(backupPath)) {
            throw new Error(`Backup file not found: ${backupName}`);
        }
        
        const extract = require('extract-zip');
        await extract(backupPath, { dir: targetPath });
        
        console.log(`✅ Restored backup to: ${targetPath}`);
        return true;
    }

    /**
     * Get backup statistics
     * @returns {Promise<object>} - Statistics
     */
    async getStats() {
        const backups = await this.listBackups();
        const totalSize = backups.reduce((sum, b) => sum + parseFloat(b.size), 0);
        
        return {
            totalBackups: backups.length,
            totalSize: totalSize.toFixed(2),
            latestBackup: backups[0] || null,
            oldestBackup: backups[backups.length - 1] || null,
            backupDir: this.backupDir
        };
    }
}

// Export class sebagai singleton
module.exports = new BackupService();