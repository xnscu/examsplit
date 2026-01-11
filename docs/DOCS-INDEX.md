# 文档索引 📚

快速找到你需要的文档和工具。

## 🚀 快速开始

### 新手入门
1. **批处理任务**: 阅读 [`QUICK-START-PM2.md`](QUICK-START-PM2.md) - 30 秒上手
2. **Web 服务器**: 阅读 [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md) - 快速参考

### 常用脚本
```bash
./pm2-commands.sh          # PM2 管理工具
./test-server.sh           # 测试服务器配置
./check-ports.sh           # 检查端口和防火墙
```

---

## 📖 完整文档列表

### PM2 & 批处理

| 文档 | 说明 | 适合 |
|------|------|------|
| [`QUICK-START-PM2.md`](QUICK-START-PM2.md) | PM2 快速入门（30秒） | ⭐ 新手必读 |
| [`PM2-USAGE.md`](PM2-USAGE.md) | PM2 完整使用手册 | 详细参考 |
| [`pm2-commands.sh`](pm2-commands.sh) | PM2 便捷管理脚本 | 日常使用 |

### Web 服务器 & 远程部署

| 文档 | 说明 | 适合 |
|------|------|------|
| [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md) | 服务器快速参考卡片 | ⭐ 日常查询 |
| [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md) | 远程服务器部署完整指南 | ⭐ 部署必读 |
| [`test-server.sh`](test-server.sh) | 服务器配置测试工具 | 故障排查 |
| [`check-ports.sh`](check-ports.sh) | 端口和防火墙检查工具 | 网络诊断 |

### 配置文件

| 文件 | 说明 |
|------|------|
| [`ecosystem.config.cjs`](ecosystem.config.cjs) | PM2 配置文件 |
| [`package.json`](package.json) | 项目依赖和脚本 |

---

## 🎯 按场景查找

### 场景 1：首次部署批处理任务
1. 阅读 [`QUICK-START-PM2.md`](QUICK-START-PM2.md)
2. 运行 `pm2 start ecosystem.config.cjs --only exam-batch`
3. 运行 `pm2 logs exam-batch` 查看进度

### 场景 2：启动 Web 服务器（本地）
1. 运行 `pnpm serve`
2. 访问 `http://localhost:3000`

### 场景 3：启动 Web 服务器（远程）
1. 阅读 [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md)
2. 运行 `./check-ports.sh` 检查端口
3. 配置防火墙和云安全组
4. 运行 `pm2 start ecosystem.config.cjs --only exam-server`
5. 运行 `./test-server.sh` 验证配置
6. 访问 `http://YOUR_IP:3000`

### 场景 4：故障排查
1. 运行 `./test-server.sh` 诊断问题
2. 查看 [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md) 的"故障排查"部分
3. 检查 PM2 日志：`pm2 logs`

### 场景 5：更改端口
1. 查看 [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md)
2. 运行 `./pm2-commands.sh serve-port 8080`

---

## 🔧 工具脚本说明

### `pm2-commands.sh`
PM2 任务管理的便捷脚本

```bash
./pm2-commands.sh                    # 显示帮助
./pm2-commands.sh start              # 启动批处理
./pm2-commands.sh serve              # 启动服务器
./pm2-commands.sh status             # 查看状态
./pm2-commands.sh logs               # 查看日志
```

### `test-server.sh`
一键测试服务器配置和网络连通性

```bash
./test-server.sh
```

会检查：
- ✅ PM2 服务状态
- ✅ 端口监听情况
- ✅ 本地连接测试
- ✅ 服务器 IP 地址
- ✅ 防火墙配置
- ✅ 访问地址生成
- ✅ 检查清单

### `check-ports.sh`
检查端口和防火墙配置

```bash
./check-ports.sh
```

会检查：
- ✅ UFW/Firewalld/iptables 状态
- ✅ 当前监听的端口
- ✅ 哪些端口可用
- ✅ 如何开放端口的建议

---

## ⚡ 常用命令速查

### 批处理任务
```bash
# 启动
pm2 start ecosystem.config.cjs --only exam-batch
pnpm pm2:start

# 查看进度
pm2 logs exam-batch

# 停止
pm2 stop exam-batch
```

### Web 服务器
```bash
# 本地启动
pnpm serve

# 远程启动（允许外部访问）
pm2 start ecosystem.config.cjs --only exam-server
pnpm pm2:serve

# 测试配置
./test-server.sh

# 查看日志
pm2 logs exam-server
```

### 网络诊断
```bash
# 检查端口配置
./check-ports.sh

# 测试服务器
./test-server.sh

# 查看监听端口
sudo ss -tlnp

# 获取公网 IP
curl ifconfig.me
```

### 防火墙管理
```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 3000/tcp
sudo ufw status

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 📞 需要帮助？

### 按问题类型查找

| 问题 | 查看文档 | 运行工具 |
|------|----------|----------|
| PM2 不会用 | [`QUICK-START-PM2.md`](QUICK-START-PM2.md) | `./pm2-commands.sh` |
| 服务器无法访问 | [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md) | `./test-server.sh` |
| 不知道用哪个端口 | [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md) | `./check-ports.sh` |
| 防火墙怎么配置 | [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md) 第2节 | `./check-ports.sh` |
| 云安全组怎么设置 | [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md) 第3节 | - |
| 想快速查命令 | [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md) | - |

### 文档在哪里？

所有文档都在项目根目录：

```bash
cd ~/examsplit
ls *.md        # 查看所有文档
ls *.sh        # 查看所有脚本
```

---

## 🎓 学习路径

### 新手路径
1. 📖 阅读 [`QUICK-START-PM2.md`](QUICK-START-PM2.md)
2. 🚀 运行批处理任务
3. 📖 阅读 [`SERVER-QUICK-REF.md`](SERVER-QUICK-REF.md)
4. 🌐 启动本地 Web 服务器

### 进阶路径
1. 📖 阅读 [`REMOTE-DEPLOY.md`](REMOTE-DEPLOY.md)
2. 🔧 运行 `./check-ports.sh` 了解服务器配置
3. 🌐 部署远程 Web 服务器
4. 🧪 使用 `./test-server.sh` 验证部署

### 专家路径
1. 📖 阅读 [`PM2-USAGE.md`](PM2-USAGE.md) 完整手册
2. ⚙️ 自定义 `ecosystem.config.cjs` 配置
3. 🔒 配置 Nginx 反向代理 + HTTPS
4. 📊 设置监控和日志分析

---

## 🗂️ 文件结构

```
examsplit/
├── 📚 文档
│   ├── QUICK-START-PM2.md      # PM2 快速入门
│   ├── PM2-USAGE.md            # PM2 完整手册
│   ├── SERVER-QUICK-REF.md     # 服务器快速参考
│   ├── REMOTE-DEPLOY.md        # 远程部署指南
│   └── DOCS-INDEX.md           # 本文件
│
├── 🔧 配置文件
│   ├── ecosystem.config.cjs    # PM2 配置
│   └── package.json            # 项目配置
│
├── 🛠️ 工具脚本
│   ├── pm2-commands.sh         # PM2 管理工具
│   ├── test-server.sh          # 服务器测试
│   └── check-ports.sh          # 端口检查
│
├── 📜 核心脚本
│   ├── scripts/batch-process.js  # 批处理
│   ├── scripts/server.js         # Web 服务器
│   └── scripts/split.js          # PDF 分割
│
└── 📂 数据目录
    ├── exams/                  # PDF 输入
    ├── output/                 # 处理结果
    └── logs/                   # 日志文件
```

---

**快速导航完毕！祝你使用愉快！** 🎉

需要详细信息，请根据上面的索引选择相应文档查看。

