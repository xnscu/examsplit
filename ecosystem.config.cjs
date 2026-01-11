module.exports = {
  apps: [
    {
      name: 'exam-batch',
      script: 'scripts/batch-process.js',
      cwd: '/root/examsplit',
      instances: 1,
      autorestart: false, // 批处理任务完成后不自动重启
      max_memory_restart: '2G',
      error_file: 'logs/batch-error.log',
      out_file: 'logs/batch-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      },
      // 批处理的默认参数（可以被命令行覆盖）
      args: [
        '--concurrency', '5',
        '--retries', '3',
        '--input', 'exams',
        '--output', 'output'
      ]
    },
    {
      name: 'exam-server',
      script: 'scripts/server.js',
      cwd: '/root/examsplit',
      instances: 1,
      autorestart: true, // 服务器崩溃时自动重启
      max_memory_restart: '1G',
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};

