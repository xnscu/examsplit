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
          <td><a href="/files/${encodeURIComponent(f.name)}" download>${f.name}</a></td>
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
      <code>GET /files/{filename}</code> - 下载文件
    </div>
  </div>

  <div class="auto-refresh">
    <span class="pulse"></span>
    自动刷新中 (10秒)
  </div>
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
  .option('-p, --port <number>', 'Port to listen on', parseInt, 3000)
  .option('-o, --output <path>', 'Output folder path', 'output')
  .option('-i, --input <path>', 'Input folder path', 'exams')
  .action(async (options) => {
    const server = createServer(options);

    server.listen(options.port, () => {
      console.log('🚀 PDF Output Server Started');
      console.log('━'.repeat(40));
      console.log(`📁 Input:  ${path.resolve(options.input)}`);
      console.log(`📁 Output: ${path.resolve(options.output)}`);
      console.log('━'.repeat(40));
      console.log(`🌐 Dashboard: http://localhost:${options.port}`);
      console.log(`📡 API:       http://localhost:${options.port}/api/progress`);
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

