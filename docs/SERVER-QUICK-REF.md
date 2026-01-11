# Web 服务器快速参考 ⚡

## 🚀 快速启动

```bash
# 1. 检查端口（首次运行）
./check-ports.sh

# 2. 开放防火墙端口（以 3000 为例）
sudo ufw allow 3000/tcp
sudo ufw reload

# 3. 启动服务器（PM2 后台运行）
pm2 start ecosystem.config.cjs --only exam-server

# 4. 查看服务器 IP
curl ifconfig.me

# 5. 访问
# http://YOUR_SERVER_IP:3000
```

---

## 📋 常用命令

### 启动服务器

```bash
# PM2 后台启动（推荐）
pm2 start ecosystem.config.cjs --only exam-server
pnpm pm2:serve

# 前台运行（调试用）
pnpm serve:public
node scripts/server.js --host 0.0.0.0 --port 3000

# 指定端口
pm2 start ecosystem.config.cjs --only exam-server -- --port 8080
node scripts/server.js --host 0.0.0.0 --port 8080

# 只本地访问
node scripts/server.js --host 127.0.0.1 --port 3000
```

### 管理服务器

```bash
# 查看状态
pm2 status
pm2 info exam-server

# 查看日志
pm2 logs exam-server
pm2 logs exam-server --lines 100

# 停止服务器
pm2 stop exam-server
pnpm pm2:serve:stop

# 重启服务器
pm2 restart exam-server

# 删除服务器
pm2 delete exam-server
```

### 端口和防火墙

```bash
# 检查端口
./check-ports.sh
sudo ss -tlnp | grep :3000
sudo netstat -tlnp | grep :3000

# UFW 防火墙（Ubuntu/Debian）
sudo ufw allow 3000/tcp          # 开放给所有人
sudo ufw allow from YOUR_IP to any port 3000  # 只允许特定 IP
sudo ufw delete allow 3000/tcp   # 关闭端口
sudo ufw status                  # 查看状态
sudo ufw reload                  # 重新加载

# Firewalld（CentOS/RHEL）
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
sudo firewall-cmd --permanent --remove-port=3000/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -L -n --line-numbers
```

### 网络诊断

```bash
# 获取公网 IP
curl ifconfig.me
curl icanhazip.com
hostname -I  # 本地 IP

# 测试本地连接
curl http://localhost:3000
curl http://127.0.0.1:3000

# 测试端口连通性（在本地电脑运行）
telnet YOUR_SERVER_IP 3000
nc -zv YOUR_SERVER_IP 3000

# 查看监听端口
sudo ss -tlnp
sudo netstat -tlnp
```

---

## 🔧 配置选项

### server.js 参数

| 参数           | 说明     | 默认值    | 示例                       |
| -------------- | -------- | --------- | -------------------------- |
| `-p, --port`   | 端口号   | 3000      | `--port 8080`              |
| `-H, --host`   | 监听地址 | 127.0.0.1 | `--host 0.0.0.0`           |
| `-i, --input`  | 输入目录 | exams     | `--input /path/to/pdfs`    |
| `-o, --output` | 输出目录 | output    | `--output /path/to/output` |

### 常用 host 值

- `127.0.0.1` - 只允许本地访问（默认，安全）
- `0.0.0.0` - 允许所有网络接口访问（远程访问必需）
- `::` - IPv6 版本的 0.0.0.0

---

## 🌐 访问地址

### 本地访问

```
http://localhost:3000           # 本地浏览器
http://127.0.0.1:3000          # 本地浏览器
```

### 远程访问（需要 --host 0.0.0.0）

```
http://YOUR_SERVER_IP:3000      # 从任何地方访问
http://your-domain.com:3000     # 如果配置了域名
```

### API 端点

```
GET  /                          # 主页（进度仪表板）
GET  /api/progress              # 进度 JSON API
GET  /api/files                 # 文件列表 API
GET  /api/logs                  # 日志 API
GET  /download/:filename        # 下载文件
GET  /logs                      # 日志页面
```

---

## ⚠️ 云服务器重要提示

**除了服务器本地防火墙，还必须配置云安全组！**

### 快速链接

- **阿里云**: 云服务器 ECS → 实例 → 安全组 → 配置规则
- **腾讯云**: 云服务器 → 实例 → 安全组 → 编辑规则
- **AWS**: EC2 → Security Groups → Inbound rules
- **华为云**: 弹性云服务器 → 安全组
- **DigitalOcean**: Droplets → Networking → Firewalls

### 安全组配置示例

```
规则方向: 入方向
协议类型: TCP
端口范围: 3000
授权对象: 0.0.0.0/0（所有人）或你的 IP
```

---

## 🔒 安全建议

1. **生产环境**: 使用 Nginx 反向代理 + 80/443 端口
2. **限制 IP**: 只允许特定 IP 访问
3. **使用 HTTPS**: Let's Encrypt 免费证书
4. **定期更新**: 系统和依赖包
5. **监控日志**: `pm2 logs exam-server`

---

## 🐛 故障排查

### 问题：无法从外部访问

**解决步骤**：

1. 确认服务运行: `pm2 status`
2. 确认端口监听: `sudo ss -tlnp | grep :3000`
3. 确认使用 `--host 0.0.0.0` 启动
4. 确认防火墙开放: `sudo ufw status`
5. 确认云安全组配置
6. 测试连通性: `telnet YOUR_IP 3000`

### 问题：端口被占用

```bash
# 查找占用端口的进程
sudo ss -tlnp | grep :3000
sudo lsof -i :3000

# 杀死进程
sudo kill -9 <PID>

# 或使用不同端口
pm2 start ecosystem.config.cjs --only exam-server -- --port 8080
```

### 问题：权限不足（80 端口）

```bash
# 方法 1: 使用 sudo
sudo pm2 start ecosystem.config.cjs --only exam-server -- --port 80

# 方法 2: 使用 Nginx 反向代理（推荐）
# 参考 REMOTE-DEPLOY.md 的 Nginx 配置

# 方法 3: 使用高端口 + iptables 转发
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
```

---

## 📚 更多信息

- **详细部署指南**: `REMOTE-DEPLOY.md`
- **PM2 使用说明**: `PM2-USAGE.md`
- **快速开始**: `QUICK-START-PM2.md`

---

## 💡 示例工作流

### 首次部署

```bash
# 1. 检查环境
./check-ports.sh

# 2. 配置防火墙
sudo ufw allow 3000/tcp && sudo ufw reload

# 3. 启动服务
pm2 start ecosystem.config.cjs --only exam-server

# 4. 查看日志确认
pm2 logs exam-server --lines 20

# 5. 获取 IP 并访问
curl ifconfig.me
# 浏览器打开: http://YOUR_IP:3000
```

### 日常维护

```bash
# 查看服务状态
pm2 status

# 查看最新日志
pm2 logs exam-server --lines 50

# 重启服务
pm2 restart exam-server

# 查看访问情况
tail -f logs/server-output.log
```

---

**快速参考完毕！需要详细说明请查看 `REMOTE-DEPLOY.md`** 📖
