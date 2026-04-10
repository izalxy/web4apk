const fs = require('fs-extra');
const path = require('path');

// Folders to preserve (never delete)
const PROTECTED_FOLDERS = ['uploads', 'sessions', 'database', 'android-template'];

// File extensions that should be preserved
const PROTECTED_EXTENSIONS = ['.db', '.json', '.env', '.key', '.pem', '.crt'];

// File patterns that should be preserved (regex)
const PROTECTED_PATTERNS = [
    /^\.env/,
    /^creds\.json$/,
    /^premium\.json$/,
    /^admin\.json$/,
    /^users\.json$/
];

/**
 * Check if file is protected by pattern
 * @param {string} filename - File name to check
 * @returns {boolean}
 */
function isProtectedByPattern(filename) {
    return PROTECTED_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Clean up old files in a directory
 * @param {string} directory - Directory to clean
 * @param {number} maxAgeMinutes - Maximum age in minutes
 * @param {boolean} dryRun - If true, only log what would be deleted
 * @returns {Promise<number>} Number of files cleaned
 */
async function cleanupOldFiles(directory, maxAgeMinutes = 30, dryRun = false) {
    let cleanedCount = 0;
    
    try {
        if (!await fs.pathExists(directory)) return 0;

        const files = await fs.readdir(directory);
        const now = Date.now();
        const maxAge = maxAgeMinutes * 60 * 1000;

        for (const file of files) {
            // Skip protected folders
            if (PROTECTED_FOLDERS.includes(file)) {
                if (!dryRun) console.log(`🛡️ Skipped protected folder: ${file}`);
                continue;
            }

            // Skip protected patterns
            if (isProtectedByPattern(file)) {
                if (!dryRun) console.log(`🛡️ Skipped protected file: ${file}`);
                continue;
            }

            const filePath = path.join(directory, file);
            
            // Check if file exists (might have been deleted in previous iteration)
            if (!await fs.pathExists(filePath)) continue;
            
            const stats = await fs.stat(filePath);
            const age = now - stats.mtimeMs;
            
            // Skip if file is a directory
            if (stats.isDirectory()) {
                // Recursively clean subdirectories
                const subCleaned = await cleanupOldFiles(filePath, maxAgeMinutes, dryRun);
                cleanedCount += subCleaned;
                
                // Try to remove empty directory
                try {
                    const remaining = await fs.readdir(filePath);
                    if (remaining.length === 0) {
                        if (!dryRun) {
                            await fs.remove(filePath);
                            console.log(`🗑️ Removed empty directory: ${file}`);
                        }
                        cleanedCount++;
                    }
                } catch (err) {
                    // Directory might have been deleted already
                }
                continue;
            }

            // Skip protected file extensions
            const ext = path.extname(file).toLowerCase();
            if (PROTECTED_EXTENSIONS.includes(ext)) {
                if (!dryRun) console.log(`🛡️ Skipped protected file: ${file}`);
                continue;
            }

            if (age > maxAge) {
                if (dryRun) {
                    console.log(`📋 [DRY RUN] Would delete: ${file} (age: ${Math.round(age / 60000)}min, size: ${formatBytes(stats.size)})`);
                } else {
                    await fs.remove(filePath);
                    console.log(`🗑️ Cleaned up: ${file} (age: ${Math.round(age / 60000)}min, size: ${formatBytes(stats.size)})`);
                }
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0 && !dryRun) {
            console.log(`✅ Cleaned ${cleanedCount} items from ${directory}`);
        }
        
        return cleanedCount;
    } catch (error) {
        console.error('Cleanup error:', error.message);
        return cleanedCount;
    }
}

/**
 * Clean up temp folder immediately, preserving only protected folders
 * @param {string} directory - Directory to clean
 * @param {boolean} dryRun - If true, only log what would be deleted
 * @returns {Promise<number>} Number of items cleaned
 */
async function cleanupTempNow(directory, dryRun = false) {
    let cleanedCount = 0;
    
    try {
        if (!await fs.pathExists(directory)) return 0;

        const files = await fs.readdir(directory);

        for (const file of files) {
            // Skip protected folders
            if (PROTECTED_FOLDERS.includes(file)) {
                if (!dryRun) console.log(`🛡️ Skipped protected folder: ${file}`);
                continue;
            }

            // Skip protected patterns
            if (isProtectedByPattern(file)) {
                if (!dryRun) console.log(`🛡️ Skipped protected file: ${file}`);
                continue;
            }

            const filePath = path.join(directory, file);
            
            if (!await fs.pathExists(filePath)) continue;
            
            const stats = await fs.stat(filePath);
            
            // Skip protected file extensions
            const ext = path.extname(file).toLowerCase();
            if (PROTECTED_EXTENSIONS.includes(ext)) {
                if (!dryRun) console.log(`🛡️ Skipped protected file: ${file}`);
                continue;
            }
            
            if (stats.isDirectory()) {
                // Recursively clean subdirectory
                const subCleaned = await cleanupTempNow(filePath, dryRun);
                cleanedCount += subCleaned;
                
                // Remove empty directory
                try {
                    const remaining = await fs.readdir(filePath);
                    if (remaining.length === 0) {
                        if (!dryRun) {
                            await fs.remove(filePath);
                            console.log(`🗑️ Removed empty directory: ${file}`);
                        }
                        cleanedCount++;
                    }
                } catch (err) {
                    // Directory might have been deleted already
                }
            } else {
                if (dryRun) {
                    console.log(`📋 [DRY RUN] Would delete: ${file} (size: ${formatBytes(stats.size)})`);
                } else {
                    await fs.remove(filePath);
                    console.log(`🗑️ Cleaned: ${file} (size: ${formatBytes(stats.size)})`);
                }
                cleanedCount++;
            }
        }

        if (cleanedCount > 0 && !dryRun) {
            console.log(`✅ Cleaned ${cleanedCount} items from temp folder`);
        }
        
        return cleanedCount;
    } catch (error) {
        console.error('Cleanup error:', error.message);
        return cleanedCount;
    }
}

/**
 * Delete a specific file or directory
 * @param {string} targetPath - Path to delete
 * @param {boolean} force - Force delete even if protected
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteFile(targetPath, force = false) {
    try {
        if (!await fs.pathExists(targetPath)) {
            console.log(`❌ File not found: ${targetPath}`);
            return false;
        }
        
        // Check if path is protected
        const fileName = path.basename(targetPath);
        const ext = path.extname(fileName).toLowerCase();
        
        // Check by pattern
        if (!force && isProtectedByPattern(fileName)) {
            console.log(`🛡️ Cannot delete protected file: ${fileName}`);
            return false;
        }
        
        if (!force && PROTECTED_EXTENSIONS.includes(ext)) {
            console.log(`🛡️ Cannot delete protected file: ${fileName}`);
            return false;
        }
        
        // Check if inside protected folder
        const parentDir = path.basename(path.dirname(targetPath));
        if (!force && PROTECTED_FOLDERS.includes(parentDir)) {
            console.log(`🛡️ Cannot delete file in protected folder: ${targetPath}`);
            return false;
        }
        
        // Get file size before deletion
        let size = 0;
        try {
            const stats = await fs.stat(targetPath);
            size = stats.size;
        } catch (err) {}
        
        await fs.remove(targetPath);
        console.log(`🗑️ Deleted: ${targetPath} ${size > 0 ? `(${formatBytes(size)})` : ''}`);
        return true;
    } catch (error) {
        console.error('Delete error:', error.message);
        return false;
    }
}

/**
 * Get directory size in bytes
 * @param {string} directory - Directory path
 * @returns {Promise<number>} Size in bytes
 */
async function getDirectorySize(directory) {
    let size = 0;
    
    try {
        if (!await fs.pathExists(directory)) return 0;
        
        const files = await fs.readdir(directory);
        
        for (const file of files) {
            const filePath = path.join(directory, file);
            
            if (!await fs.pathExists(filePath)) continue;
            
            const stats = await fs.stat(filePath);
            
            if (stats.isDirectory()) {
                size += await getDirectorySize(filePath);
            } else {
                size += stats.size;
            }
        }
        
        return size;
    } catch (error) {
        console.error('Get size error:', error.message);
        return size;
    }
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get cleanup report
 * @param {string} directory - Directory to analyze
 * @param {number} maxAgeMinutes - Maximum age in minutes
 * @returns {Promise<object>} Report object
 */
async function getCleanupReport(directory, maxAgeMinutes = 30) {
    const report = {
        directory,
        totalFiles: 0,
        deletableFiles: 0,
        deletableSize: 0,
        protectedFiles: 0,
        protectedSize: 0,
        files: []
    };
    
    try {
        if (!await fs.pathExists(directory)) return report;
        
        const files = await fs.readdir(directory);
        const now = Date.now();
        const maxAge = maxAgeMinutes * 60 * 1000;
        
        for (const file of files) {
            // Skip protected folders
            if (PROTECTED_FOLDERS.includes(file)) {
                report.protectedFiles++;
                continue;
            }
            
            const filePath = path.join(directory, file);
            
            if (!await fs.pathExists(filePath)) continue;
            
            const stats = await fs.stat(filePath);
            const age = now - stats.mtimeMs;
            
            // Skip protected extensions
            const ext = path.extname(file).toLowerCase();
            const isProtected = PROTECTED_EXTENSIONS.includes(ext) || isProtectedByPattern(file);
            
            if (isProtected) {
                report.protectedFiles++;
                report.protectedSize += stats.size;
                continue;
            }
            
            report.totalFiles++;
            
            if (stats.isDirectory()) {
                const subReport = await getCleanupReport(filePath, maxAgeMinutes);
                report.totalFiles += subReport.totalFiles;
                report.deletableFiles += subReport.deletableFiles;
                report.deletableSize += subReport.deletableSize;
                report.protectedFiles += subReport.protectedFiles;
                report.protectedSize += subReport.protectedSize;
            } else if (age > maxAge) {
                report.deletableFiles++;
                report.deletableSize += stats.size;
                report.files.push({
                    name: file,
                    size: formatBytes(stats.size),
                    sizeBytes: stats.size,
                    age: Math.round(age / 60000),
                    path: filePath,
                    modified: stats.mtime
                });
            }
        }
        
        return report;
    } catch (error) {
        console.error('Report error:', error.message);
        return report;
    }
}

/**
 * Schedule automatic cleanup every interval
 * @param {string} directory - Directory to clean
 * @param {number} intervalMinutes - How often to clean (minutes)
 * @param {number} maxAgeMinutes - Maximum age of files (minutes)
 * @returns {NodeJS.Timeout} Interval ID
 */
function scheduleCleanup(directory, intervalMinutes = 60, maxAgeMinutes = 30) {
    console.log(`📅 Scheduled cleanup for ${directory} every ${intervalMinutes} minutes`);
    
    // Run initial cleanup
    cleanupOldFiles(directory, maxAgeMinutes);
    
    // Schedule recurring cleanup
    const intervalId = setInterval(() => {
        cleanupOldFiles(directory, maxAgeMinutes);
    }, intervalMinutes * 60 * 1000);
    
    return intervalId;
}

/**
 * Get total disk usage of all temp and output directories
 * @returns {Promise<object>} Disk usage info
 */
async function getDiskUsage() {
    const tempDir = path.join(__dirname, '..', 'temp');
    const outputDir = path.join(__dirname, '..', 'output');
    const logsDir = path.join(__dirname, '..', 'logs');
    
    const tempSize = await getDirectorySize(tempDir);
    const outputSize = await getDirectorySize(outputDir);
    const logsSize = await getDirectorySize(logsDir);
    const total = tempSize + outputSize + logsSize;
    
    return {
        temp: formatBytes(tempSize),
        output: formatBytes(outputSize),
        logs: formatBytes(logsSize),
        total: formatBytes(total),
        totalBytes: total
    };
}

module.exports = {
    cleanupOldFiles,
    cleanupTempNow,
    deleteFile,
    getDirectorySize,
    formatBytes,
    getCleanupReport,
    scheduleCleanup,
    getDiskUsage,
    PROTECTED_FOLDERS,
    PROTECTED_EXTENSIONS,
    PROTECTED_PATTERNS,
    isProtectedByPattern
};