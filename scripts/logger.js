/**
 * Gemini API Call Logger
 *
 * Logs all Gemini API calls with success/failure status.
 * Logs are stored in a JSON file for web dashboard viewing.
 */

import fs from 'fs/promises';
import path from 'path';

// Log file path
const LOG_FILE = 'gemini-logs.json';

// Maximum number of log entries to keep
const MAX_LOG_ENTRIES = 1000;

/**
 * Log entry structure
 * @typedef {Object} LogEntry
 * @property {string} id - Unique identifier
 * @property {string} timestamp - ISO timestamp
 * @property {string} pdfFile - PDF file being processed
 * @property {number} pageNumber - Page number being processed
 * @property {boolean} success - Whether the call succeeded
 * @property {number} [questionsFound] - Number of questions detected (if success)
 * @property {string} [error] - Error message (if failed)
 * @property {number} attempt - Attempt number (1-based)
 * @property {number} duration - Duration in milliseconds
 */

/**
 * Read existing logs from file
 */
async function readLogs() {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { entries: [], stats: { total: 0, success: 0, failed: 0 } };
  }
}

/**
 * Write logs to file
 */
async function writeLogs(logs) {
  await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
}

/**
 * Add a log entry
 */
async function addLogEntry(entry) {
  const logs = await readLogs();

  // Add new entry at the beginning
  logs.entries.unshift(entry);

  // Trim if too many entries
  if (logs.entries.length > MAX_LOG_ENTRIES) {
    logs.entries = logs.entries.slice(0, MAX_LOG_ENTRIES);
  }

  // Update stats
  logs.stats.total++;
  if (entry.success) {
    logs.stats.success++;
  } else {
    logs.stats.failed++;
  }
  logs.stats.lastUpdated = new Date().toISOString();

  await writeLogs(logs);
  return entry;
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a logger instance for a specific PDF file
 */
export function createLogger(pdfFile) {
  const pdfName = path.basename(pdfFile);

  return {
    /**
     * Log a successful Gemini API call
     */
    async logSuccess(pageNumber, questionsFound, duration, attempt = 1) {
      const entry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        pdfFile: pdfName,
        pageNumber,
        success: true,
        questionsFound,
        duration,
        attempt
      };
      await addLogEntry(entry);
      return entry;
    },

    /**
     * Log a failed Gemini API call
     */
    async logFailure(pageNumber, error, duration, attempt = 1) {
      const entry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        pdfFile: pdfName,
        pageNumber,
        success: false,
        error: error.message || String(error),
        duration,
        attempt
      };
      await addLogEntry(entry);
      return entry;
    }
  };
}

/**
 * Get all logs (for API)
 * Returns:
 * - entries: filtered and limited log entries (部分明细)
 * - stats: statistics based on ALL logs (基于全部日志的统计信息)
 * - fullStats: detailed statistics based on ALL logs (详细统计信息)
 * - totalEntries: total number of entries in database (数据库中的总条数)
 * - returnedEntries: number of entries returned (返回的条数)
 */
export async function getLogs(limit = 100, filter = {}) {
  const logs = await readLogs();
  const allEntries = logs.entries;

  let entries = allEntries;

  // Apply filters
  if (filter.success !== undefined) {
    entries = entries.filter(e => e.success === filter.success);
  }
  if (filter.pdfFile) {
    entries = entries.filter(e => e.pdfFile.includes(filter.pdfFile));
  }

  // Apply limit to filtered entries
  const filteredTotal = entries.length;
  entries = entries.slice(0, limit);

  // Get full statistics (always based on ALL logs, not filtered)
  const fullStats = await getLogStats();

  return {
    entries,                          // 返回的明细（已过滤和限制）
    stats: logs.stats,                // 基本统计（基于全部日志）
    fullStats,                        // 详细统计（基于全部日志）
    totalEntries: allEntries.length,  // 数据库中的总条数
    filteredTotal,                    // 过滤后的总数
    returnedEntries: entries.length   // 实际返回的条数
  };
}

/**
 * Get log statistics (always based on ALL logs)
 */
export async function getLogStats() {
  const logs = await readLogs();
  const allEntries = logs.entries; // 始终基于全部日志

  // Calculate additional stats from ALL entries
  const recentEntries = allEntries.slice(0, 100);
  const recentSuccess = recentEntries.filter(e => e.success).length;
  const recentFailed = recentEntries.filter(e => !e.success).length;

  // Calculate average duration from ALL successful calls
  const successfulCalls = allEntries.filter(e => e.success && e.duration);
  const avgDuration = successfulCalls.length > 0
    ? Math.round(successfulCalls.reduce((acc, e) => acc + e.duration, 0) / successfulCalls.length)
    : 0;

  // Group by PDF file - using ALL entries
  const byPdf = {};
  for (const entry of allEntries) {
    if (!byPdf[entry.pdfFile]) {
      byPdf[entry.pdfFile] = { success: 0, failed: 0, total: 0 };
    }
    byPdf[entry.pdfFile].total++;
    if (entry.success) {
      byPdf[entry.pdfFile].success++;
    } else {
      byPdf[entry.pdfFile].failed++;
    }
  }

  return {
    ...logs.stats, // 累计统计（基于全部日志）
    totalEntries: allEntries.length, // 明确返回全部日志条数
    recent: {
      success: recentSuccess,
      failed: recentFailed,
      total: recentEntries.length
    },
    avgDuration,
    byPdf: Object.entries(byPdf)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
  };
}

/**
 * Clear all logs
 */
export async function clearLogs() {
  await writeLogs({ entries: [], stats: { total: 0, success: 0, failed: 0 } });
}

export { LOG_FILE };


