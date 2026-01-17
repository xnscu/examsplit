#!/usr/bin/env node

/**
 * Output File Server
 *
 * Serves the output folder over HTTP with a beautiful progress dashboard.
 *
 * Usage:
 *   node scripts/server.js [options]
 *
 * Options:
 *   -p, --port <number>     Port to listen on (default: 3000)
 *   -o, --output <path>     Output folder path (default: output)
 *   -i, --input <path>      Input folder path for progress tracking (default: exams)
 */

import http from 'http';
import fs from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { program } from 'commander';
import { getLogs, getLogStats, clearLogs } from './logger.js';

/**
 * Get MIME type for file extension
 */
function getMimeType(ext) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Format file size
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date
 */
function formatDate(date) {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Get processing progress
 */
async function getProgress(inputDir, outputDir) {
  let inputFiles = [];
  let outputFiles = [];

  try {
    const files = await fs.readdir(inputDir);
    inputFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
  } catch {
    // Input directory might not exist
  }

  try {
    const files = await fs.readdir(outputDir);
    outputFiles = files.filter(f => f.toLowerCase().endsWith('.zip'));
  } catch {
    // Output directory might not exist
  }

  const total = inputFiles.length;
  const completed = outputFiles.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Check which files are pending
  const completedSet = new Set(outputFiles.map(f => f.replace('.zip', '')));
  const pending = inputFiles
    .filter(f => !completedSet.has(f.replace('.pdf', '')))
    .map(f => f.replace('.pdf', ''));

  return { total, completed, percentage, pending };
}

/**
 * Get output file list with details
 */
async function getOutputFiles(outputDir) {
  try {
    const files = await fs.readdir(outputDir);
    const zipFiles = files.filter(f => f.toLowerCase().endsWith('.zip'));

    const fileDetails = await Promise.all(
      zipFiles.map(async (file) => {
        const filePath = path.join(outputDir, file);
        const stat = await fs.stat(filePath);
        return {
          name: file,
          size: stat.size,
          sizeFormatted: formatSize(stat.size),
          mtime: stat.mtime,
          mtimeFormatted: formatDate(stat.mtime)
        };
      })
    );

    // Sort by modification time (newest first)
    fileDetails.sort((a, b) => b.mtime - a.mtime);
    return fileDetails;
  } catch {
    return [];
  }
}

/**
 * Generate HTML for logs page
 */
async function generateLogsPage() {
  const stats = await getLogStats();
  const logs = await getLogs(200); // 只获取最近200条明细，但stats是基于全部日志

  const successRate = stats.total > 0
    ? Math.round((stats.success / stats.total) * 100)
    : 0;

  const logsHtml = logs.entries.length > 0
    ? logs.entries.map(e => `
        <tr class="${e.success ? 'success' : 'error'}">
          <td>${new Date(e.timestamp).toLocaleString('zh-CN')}</td>
          <td>${e.pdfFile}</td>
          <td>P${e.pageNumber}</td>
          <td><span class="status ${e.success ? 'ok' : 'fail'}">${e.success ? '✅ 成功' : '❌ 失败'}</span></td>
          <td>${e.success ? `${e.questionsFound} 题` : e.error}</td>
          <td>${e.duration}ms</td>
          <td>${e.attempt}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="7" style="text-align: center; color: #666;">暂无日志</td></tr>';

  const byPdfHtml = stats.byPdf && stats.byPdf.length > 0
    ? stats.byPdf.map(p => `
        <div class="pdf-stat">
          <span class="pdf-name">${p.name}</span>
          <span class="pdf-counts">
            <span class="count success">${p.success}✓</span>
            <span class="count failed">${p.failed}✗</span>
          </span>
        </div>
      `).join('')
    : '<p style="color: #666;">暂无数据</p>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>Gemini API 日志 - ExamSplit</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'JetBrains Mono', monospace;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 2rem;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    h1 {
      color: #ff9f43;
      font-size: 2rem;
      text-shadow: 0 0 20px rgba(255, 159, 67, 0.3);
    }

    .nav-link {
      color: #00d4ff;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border: 1px solid #00d4ff;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .nav-link:hover {
      background: #00d4ff;
      color: #0f0f23;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .stat-value.success { color: #00ff88; }
    .stat-value.failed { color: #ff6b6b; }
    .stat-value.total { color: #00d4ff; }
    .stat-value.rate { color: #ff9f43; }

    .stat-label { color: #888; font-size: 0.875rem; }

    .card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2rem;
    }

    .card-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .card-header h2 { font-size: 1rem; color: #fff; }

    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.75rem;
      transition: all 0.2s;
    }

    .btn-danger {
      background: rgba(255, 107, 107, 0.2);
      color: #ff6b6b;
      border: 1px solid rgba(255, 107, 107, 0.3);
    }

    .btn-danger:hover {
      background: rgba(255, 107, 107, 0.3);
    }

    table { width: 100%; border-collapse: collapse; }

    th, td { padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; }

    th {
      background: rgba(255, 255, 255, 0.02);
      color: #888;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.7rem;
    }

    td { border-top: 1px solid rgba(255, 255, 255, 0.05); }

    tr.error td { background: rgba(255, 107, 107, 0.05); }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }

    .status {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .status.ok { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
    .status.fail { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }

    .pdf-stats { padding: 1rem 1.5rem; }

    .pdf-stat {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .pdf-name { color: #ccc; font-size: 0.8rem; }

    .pdf-counts { display: flex; gap: 0.5rem; }

    .count {
      font-size: 0.75rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .count.success { background: rgba(0, 255, 136, 0.2); color: #00ff88; }
    .count.failed { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }

    .auto-refresh {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      font-size: 0.75rem;
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pulse {
      width: 8px;
      height: 8px;
      background: #ff9f43;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .scrollable { max-height: 500px; overflow-y: auto; }

    .info-box {
      background: rgba(0, 212, 255, 0.1);
      border: 1px solid rgba(0, 212, 255, 0.3);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 2rem;
      font-size: 0.85rem;
      color: #00d4ff;
    }

    .info-box strong {
      color: #00ff88;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Gemini API 日志</h1>
      <a href="/" class="nav-link">← 返回进度</a>
    </div>

    <div class="info-box">
      <strong>ℹ️ 说明：</strong> 下方所有<strong>统计信息</strong>均基于<strong>全部日志记录</strong>计算，而<strong>调用记录明细</strong>仅显示最近部分记录以提升页面性能。
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value total">${stats.total}</div>
        <div class="stat-label">总调用次数 (全部)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value success">${stats.success}</div>
        <div class="stat-label">成功 (全部)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value failed">${stats.failed}</div>
        <div class="stat-label">失败 (全部)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value rate">${successRate}%</div>
        <div class="stat-label">成功率 (全部)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #a78bfa;">${stats.avgDuration}ms</div>
        <div class="stat-label">平均耗时 (全部)</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>📊 按文件统计 (基于全部日志)</h2>
      </div>
      <div class="pdf-stats">
        ${byPdfHtml}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>📜 调用记录 (显示最近 ${logs.returnedEntries} 条 / 共 ${logs.totalEntries} 条)</h2>
        <button class="btn btn-danger" onclick="clearLogs()">清空日志</button>
      </div>
      <div class="scrollable">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>文件</th>
              <th>页码</th>
              <th>状态</th>
              <th>结果</th>
              <th>耗时</th>
              <th>次数</th>
            </tr>
          </thead>
          <tbody>
            ${logsHtml}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="auto-refresh">
    <span class="pulse"></span>
    自动刷新中 (5秒)
  </div>

  <script>
    async function clearLogs() {
      if (!confirm('确定要清空所有日志吗？')) return;
      await fetch('/api/logs/clear', { method: 'POST' });
      location.reload();
    }
  </script>
</body>
</html>`;
}

/**
 * Generate HTML dashboard
 */
async function generateDashboard(inputDir, outputDir) {
  const progress = await getProgress(inputDir, outputDir);
  const files = await getOutputFiles(outputDir);

  const pendingHtml = progress.pending.length > 0
    ? `<div class="pending-list">
        <h3>⏳ 待处理 (${progress.pending.length})</h3>
        <ul>${progress.pending.slice(0, 20).map(f => `<li>${f}</li>`).join('')}
        ${progress.pending.length > 20 ? `<li>... 还有 ${progress.pending.length - 20} 个</li>` : ''}
        </ul>
      </div>`
    : '';

  const filesHtml = files.length > 0
    ? files.map(f => `
        <tr>
          <td><a href="#" class="file-link" data-filename="${encodeURIComponent(f.name)}" target="_blank">${f.name}</a></td>
          <td>${f.sizeFormatted}</td>
          <td>${f.mtimeFormatted}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="text-align: center; color: #666;">暂无文件</td></tr>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>PDF处理进度 - ExamSplit</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      color: #e0e0e0;
      padding: 2rem;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
    }

    h1 {
      color: #00d4ff;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      text-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
    }

    .subtitle {
      color: #666;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }

    .progress-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      backdrop-filter: blur(10px);
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .progress-stats {
      font-size: 2.5rem;
      font-weight: 600;
      color: #00ff88;
    }

    .progress-label {
      font-size: 0.875rem;
      color: #888;
    }

    .progress-bar-container {
      height: 12px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #00ff88);
      border-radius: 6px;
      transition: width 0.5s ease;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
    }

    .progress-detail {
      display: flex;
      gap: 2rem;
      font-size: 0.875rem;
    }

    .progress-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot.completed { background: #00ff88; }
    .dot.pending { background: #ff6b6b; }
    .dot.total { background: #00d4ff; }

    .pending-list {
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.2);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }

    .pending-list h3 {
      color: #ff6b6b;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .pending-list ul {
      list-style: none;
      font-size: 0.75rem;
      color: #888;
      columns: 2;
    }

    .pending-list li {
      padding: 0.25rem 0;
    }

    .files-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .files-header {
      padding: 1.5rem 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .files-header h2 {
      font-size: 1.25rem;
      color: #fff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 1rem 2rem;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.02);
      color: #888;
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    td {
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.875rem;
    }

    a {
      color: #00d4ff;
      text-decoration: none;
      transition: color 0.2s;
    }

    a:hover {
      color: #00ff88;
      text-decoration: underline;
    }

    .auto-refresh {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      font-size: 0.75rem;
      color: #444;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pulse {
      width: 8px;
      height: 8px;
      background: #00ff88;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .api-info {
      margin-top: 1rem;
      padding: 1rem;
      background: rgba(0, 212, 255, 0.1);
      border-radius: 8px;
      font-size: 0.75rem;
    }

    .api-info code {
      color: #00d4ff;
      background: rgba(0, 0, 0, 0.3);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 PDF 处理进度</h1>
    <p class="subtitle">ExamSplit - 数学试卷题目分割工具</p>

    <div class="progress-card">
      <div class="progress-header">
        <div>
          <div class="progress-stats">${progress.percentage}%</div>
          <div class="progress-label">处理进度</div>
        </div>
        <div style="text-align: right;">
          <div class="progress-stats" style="font-size: 1.5rem;">${progress.completed}/${progress.total}</div>
          <div class="progress-label">已完成</div>
        </div>
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${progress.percentage}%"></div>
      </div>

      <div class="progress-detail">
        <div class="progress-item">
          <span class="dot completed"></span>
          <span>已完成: ${progress.completed}</span>
        </div>
        <div class="progress-item">
          <span class="dot pending"></span>
          <span>待处理: ${progress.total - progress.completed}</span>
        </div>
        <div class="progress-item">
          <span class="dot total"></span>
          <span>总计: ${progress.total}</span>
        </div>
      </div>

      ${pendingHtml}
    </div>

    <div class="files-card">
      <div class="files-header">
        <h2>📁 已处理文件</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>处理时间</th>
          </tr>
        </thead>
        <tbody>
          ${filesHtml}
        </tbody>
      </table>
    </div>

    <div class="api-info">
      <strong>📡 API 端点:</strong><br>
      <code>GET /api/progress</code> - 获取进度 JSON<br>
      <code>GET /api/files</code> - 获取文件列表 JSON<br>
      <code>GET /api/logs?limit=N</code> - 获取日志明细(部分)，统计信息基于全部日志<br>
      <code>GET /api/logs/stats</code> - 获取完整统计信息(基于全部日志)<br>
      <code>POST /api/logs/clear</code> - 清空日志<br>
      <code>GET /files/{filename}</code> - 下载文件<br><br>
      <a href="/logs" style="color: #ff9f43;">📋 查看 Gemini API 调用日志 →</a>
    </div>
  </div>

  <div class="auto-refresh">
    <span class="pulse"></span>
    自动刷新中 (10秒)
  </div>

  <script>
    (function() {
      const host = window.location.host;
      const links = document.querySelectorAll('a.file-link');
      links.forEach(link => {
        const filename = link.getAttribute('data-filename');
        link.href = 'https://pdfsplit.xnscu.com?zip=https://' + host + '/files/' + filename;
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Create HTTP server
 */
function createServer(options) {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    try {
      // API endpoints
      if (pathname === '/api/progress') {
        const progress = await getProgress(inputDir, outputDir);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(progress));
        return;
      }

      if (pathname === '/api/files') {
        const files = await getOutputFiles(outputDir);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(files));
        return;
      }

      // Logs API
      if (pathname === '/api/logs') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const successFilter = url.searchParams.get('success');
        const pdfFilter = url.searchParams.get('pdf');

        const filter = {};
        if (successFilter !== null) {
          filter.success = successFilter === 'true';
        }
        if (pdfFilter) {
          filter.pdfFile = pdfFilter;
        }

        const logs = await getLogs(limit, filter);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(logs));
        return;
      }

      if (pathname === '/api/logs/stats') {
        const stats = await getLogStats();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(stats));
        return;
      }

      if (pathname === '/api/logs/clear' && req.method === 'POST') {
        await clearLogs();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // File download
      if (pathname.startsWith('/files/')) {
        const filename = pathname.slice(7);
        const filePath = path.join(outputDir, filename);

        // Security check: ensure file is within output directory
        const realPath = path.resolve(filePath);
        if (!realPath.startsWith(path.resolve(outputDir))) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        try {
          const stat = statSync(filePath);
          const ext = path.extname(filename).toLowerCase();

          res.writeHead(200, {
            'Content-Type': getMimeType(ext),
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            'Access-Control-Allow-Origin': '*'
          });

          createReadStream(filePath).pipe(res);
        } catch (error) {
          res.writeHead(404);
          res.end('File not found');
        }
        return;
      }

      // Dashboard
      if (pathname === '/' || pathname === '/index.html') {
        const html = await generateDashboard(inputDir, outputDir);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // Logs page
      if (pathname === '/logs' || pathname === '/logs.html') {
        const html = await generateLogsPage();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // 404
      res.writeHead(404);
      res.end('Not found');
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  });

  return server;
}

// CLI setup
program
  .name('server')
  .description('Serve output folder with progress dashboard')
  .option('-p, --port <number>', 'Port to listen on', (val) => parseInt(val, 10), 3000)
  .option('-H, --host <address>', 'Host to bind to (use 0.0.0.0 for external access)', '127.0.0.1')
  .option('-o, --output <path>', 'Output folder path', 'output')
  .option('-i, --input <path>', 'Input folder path', 'exams')
  .action(async (options) => {
    const server = createServer(options);
    const host = options.host;

    server.listen(options.port, host, () => {
      const isExternalAccess = host === '0.0.0.0' || host === '::';

      console.log('🚀 PDF Output Server Started');
      console.log('━'.repeat(40));
      console.log(`📁 Input:  ${path.resolve(options.input)}`);
      console.log(`📁 Output: ${path.resolve(options.output)}`);
      console.log('━'.repeat(40));

      if (isExternalAccess) {
        console.log(`🌐 Dashboard: http://<your-server-ip>:${options.port}`);
        console.log(`📡 API:       http://<your-server-ip>:${options.port}/api/progress`);
        console.log('━'.repeat(40));
        console.log(`⚠️  Server is accessible from external network`);
        console.log(`   Make sure port ${options.port} is open in your firewall`);
      } else {
        console.log(`🌐 Dashboard: http://${host === '127.0.0.1' ? 'localhost' : host}:${options.port}`);
        console.log(`📡 API:       http://${host === '127.0.0.1' ? 'localhost' : host}:${options.port}/api/progress`);
        console.log('━'.repeat(40));
        console.log(`ℹ️  Server is only accessible locally`);
        console.log(`   Use -H 0.0.0.0 for external access`);
      }

      console.log('━'.repeat(40));
      console.log('Press Ctrl+C to stop');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down server...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
  });

program.parse();

