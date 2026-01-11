# PM2 后台任务使用指南

## 快速开始

### 1. 安装 PM2（如果尚未安装）

```bash
npm install -g pm2
```

### 2. 创建日志目录

```bash
mkdir -p logs
```

### 3. 启动批处理任务

```bash
# 方法1：使用配置文件
pm2 start ecosystem.config.cjs --only exam-batch

# 方法2：使用便捷脚本
./pm2-commands.sh start

# 方法3：使用 pnpm 脚本（需要先添加到 package.json）
pnpm pm2:start
```

## 常用命令

### 查看任务状态

```bash
pm2 status
# 或
pm2 ls
```

### 查看实时日志

```bash
# 查看批处理任务的日志
pm2 logs exam-batch

# 查看最后 200 行
pm2 logs exam-batch --lines 200

# 只看输出（不含错误）
pm2 logs exam-batch --out

# 只看错误
pm2 logs exam-batch --err
```

### 停止任务

```bash
pm2 stop exam-batch
```

### 重启任务

```bash
pm2 restart exam-batch
```

### 删除任务

```bash
pm2 delete exam-batch
```

### 查看详细信息

```bash
pm2 info exam-batch
```

### 实时监控

```bash
pm2 monit
```

## 自定义参数运行

### 修改并发数和重试次数

```bash
pm2 start ecosystem.config.cjs --only exam-batch -- --concurrency 10 --retries 5
```

### 强制重新处理所有文件

```bash
pm2 start ecosystem.config.cjs --only exam-batch -- --force
```

### 指定输入输出目录

```bash
pm2 start ecosystem.config.cjs --only exam-batch -- --input /path/to/exams --output /path/to/output
```

## 日志管理

### 查看日志文件位置

```bash
# 输出日志
cat logs/batch-output.log

# 错误日志
cat logs/batch-error.log
```

### 实时查看日志文件

```bash
tail -f logs/batch-output.log
```

### 清空日志

```bash
pm2 flush
```

## 开机自启动（可选）

如果需要服务器重启后自动运行：

```bash
# 1. 生成启动脚本
pm2 startup

# 2. 启动你的任务
pm2 start ecosystem.config.cjs --only exam-batch

# 3. 保存当前任务列表
pm2 save

# 4. 禁用自启动（如需）
pm2 unstartup
```

## 便捷脚本使用

使用 `pm2-commands.sh` 简化命令：

```bash
# 查看帮助
./pm2-commands.sh

# 启动任务
./pm2-commands.sh start

# 查看状态
./pm2-commands.sh status

# 查看日志
./pm2-commands.sh logs

# 停止任务
./pm2-commands.sh stop

# 自定义参数启动
./pm2-commands.sh start-custom --concurrency 10 --force
```

## 故障排查

### 任务一直重启

检查 `ecosystem.config.cjs` 中的 `autorestart` 设置：

- 批处理任务应该是 `autorestart: false`
- 服务器应该是 `autorestart: true`

### 查看错误信息

```bash
# 查看 PM2 日志
pm2 logs exam-batch --err --lines 50

# 查看日志文件
cat logs/batch-error.log
```

### 任务卡住不动

```bash
# 查看进程详情
pm2 info exam-batch

# 强制停止
pm2 delete exam-batch

# 重新启动
pm2 start ecosystem.config.js --only exam-batch
```

### 清理并重新开始

```bash
# 删除所有 PM2 任务
pm2 delete all

# 清理日志
pm2 flush

# 重新启动
pm2 start ecosystem.config.cjs --only exam-batch
```

## 多个任务管理

配置文件中包含两个任务：

1. **exam-batch** - 批处理任务
2. **exam-server** - Web 服务器

```bash
# 只启动批处理
pm2 start ecosystem.config.cjs --only exam-batch

# 只启动服务器
pm2 start ecosystem.config.cjs --only exam-server

# 启动所有任务
pm2 start ecosystem.config.cjs

# 查看所有任务状态
pm2 status

# 停止所有任务
pm2 stop all
```

## 远程服务器使用

### SSH 连接后台运行

```bash
# SSH 连接到服务器
ssh web@foo.com

# 进入项目目录
cd ~/examsplit

# 启动任务
pm2 start ecosystem.config.cjs --only exam-batch

# 断开 SSH（任务继续运行）
exit
```

### 远程查看日志

```bash
# 重新连接
ssh web@foo.com

# 查看日志
pm2 logs exam-batch

# 或直接查看日志文件
tail -f ~/examsplit/logs/batch-output.log
```

## 性能优化建议

### 调整并发数

根据服务器性能调整：

```bash
# CPU 核心数较多时
pm2 start ecosystem.config.cjs --only exam-batch -- --concurrency 10

# 内存较小时
pm2 start ecosystem.config.cjs --only exam-batch -- --concurrency 3
```

### 监控资源使用

```bash
# 实时监控
pm2 monit

# 查看内存使用
pm2 info exam-batch | grep memory

# 如果内存超出限制，PM2 会自动重启（根据 max_memory_restart 设置）
```

## 总结

最常用的命令组合：

```bash
# 启动
pm2 start ecosystem.config.cjs --only exam-batch

# 查看进度
pm2 logs exam-batch

# 查看状态
pm2 status

# 完成后停止
pm2 delete exam-batch
```

Happy Processing! 🚀
