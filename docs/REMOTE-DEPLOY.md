# 远程服务器部署指南 🚀

## 目录

1. [检查服务器端口](#1-检查服务器端口)
2. [配置防火墙](#2-配置防火墙)
3. [配置云服务商安全组](#3-配置云服务商安全组)
4. [启动服务器](#4-启动服务器)
5. [验证访问](#5-验证访问)

---

## 1. 检查服务器端口

### 运行端口检查脚本

```bash
cd ~/examsplit
chmod +x check-ports.sh
./check-ports.sh
```

这个脚本会检查：

- ✅ 防火墙状态（UFW/Firewalld/iptables）
- ✅ 当前监听的端口
- ✅ 哪些端口可用
- ✅ 端口配置建议

### 推荐端口选择

| 端口 | 说明                   | 推荐度                                    |
| ---- | ---------------------- | ----------------------------------------- |
| 80   | HTTP 标准端口          | ⭐⭐⭐⭐⭐ 最推荐（需要 root 或反向代理） |
| 443  | HTTPS 标准端口         | ⭐⭐⭐⭐⭐ 最推荐（需要证书）             |
| 3000 | Node.js 常用端口       | ⭐⭐⭐⭐ 推荐                             |
| 8080 | 常用备用端口           | ⭐⭐⭐⭐ 推荐                             |
| 8000 | Python/Django 常用端口 | ⭐⭐⭐ 可用                               |
| 8888 | Jupyter/备用端口       | ⭐⭐⭐ 可用                               |

---

## 2. 配置防火墙

### 选项 A：使用 UFW（Ubuntu/Debian）

```bash
# 检查 UFW 状态
sudo ufw status

# 开放端口（以 3000 为例）
sudo ufw allow 3000/tcp

# 或者只允许特定 IP 访问
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# 重新加载
sudo ufw reload

# 验证
sudo ufw status numbered
```

### 选项 B：使用 Firewalld（CentOS/RHEL）

```bash
# 检查 firewalld 状态
sudo firewall-cmd --state

# 开放端口（以 3000 为例）
sudo firewall-cmd --permanent --add-port=3000/tcp

# 或者只允许特定 IP
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="YOUR_IP_ADDRESS" port protocol="tcp" port="3000" accept'

# 重新加载
sudo firewall-cmd --reload

# 验证
sudo firewall-cmd --list-all
```

### 选项 C：使用 iptables

```bash
# 开放端口（以 3000 为例）
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# 只允许特定 IP
sudo iptables -A INPUT -p tcp -s YOUR_IP_ADDRESS --dport 3000 -j ACCEPT

# 保存规则
# Ubuntu/Debian
sudo apt install iptables-persistent
sudo netfilter-persistent save

# CentOS/RHEL
sudo service iptables save

# 查看规则
sudo iptables -L -n --line-numbers
```

---

## 3. 配置云服务商安全组

如果你使用云服务器，**必须在云控制台配置安全组规则**。

### 阿里云 ECS

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
2. 云服务器 ECS → 实例与镜像 → 实例
3. 找到你的实例，点击"更多" → "网络和安全组" → "安全组配置"
4. 点击"配置规则" → "添加安全组规则"
5. 配置：
   - **规则方向**: 入方向
   - **授权策略**: 允许
   - **协议类型**: 自定义 TCP
   - **端口范围**: 3000/3000（或你选择的端口）
   - **授权对象**:
     - `0.0.0.0/0`（允许所有 IP，不安全但方便）
     - 或你的 IP 地址（更安全）
   - **描述**: ExamSplit Web 服务器

### 腾讯云 CVM

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/cvm)
2. 云服务器 → 实例
3. 点击实例 ID → 安全组 → 编辑规则
4. 入站规则 → 添加规则
5. 配置：
   - **类型**: 自定义
   - **来源**: 0.0.0.0/0 或你的 IP
   - **协议端口**: TCP:3000
   - **策略**: 允许
   - **备注**: ExamSplit Web 服务器

### AWS EC2

1. 登录 [AWS 控制台](https://console.aws.amazon.com/ec2/)
2. EC2 → Security Groups
3. 选择你的实例的安全组 → Inbound rules → Edit inbound rules
4. Add rule：
   - **Type**: Custom TCP
   - **Port range**: 3000
   - **Source**:
     - `0.0.0.0/0`（所有 IPv4）
     - 或 `My IP`（只允许你的 IP）
   - **Description**: ExamSplit Web Server

### 其他云服务商

- **华为云**: 弹性云服务器 → 安全组 → 入方向规则
- **百度云**: 云服务器 BCC → 安全组 → 入站规则
- **DigitalOcean**: Droplets → Networking → Firewalls

---

## 4. 启动服务器

### 方法 1：使用 PM2（推荐，后台运行）

```bash
cd ~/examsplit

# 启动 Web 服务器（默认端口 3000，允许外部访问）
pm2 start ecosystem.config.cjs --only exam-server

# 查看日志
pm2 logs exam-server

# 查看状态
pm2 status
```

### 方法 2：使用 pnpm（前台运行）

```bash
cd ~/examsplit

# 启动服务器（允许外部访问）
pnpm serve:public

# 或指定端口
node scripts/server.js --host 0.0.0.0 --port 8080
```

### 方法 3：使用不同端口

```bash
# 使用 8080 端口
pm2 start ecosystem.config.cjs --only exam-server -- --port 8080

# 使用 80 端口（需要 root 权限）
sudo pm2 start ecosystem.config.cjs --only exam-server -- --port 80

# 只允许本地访问（默认）
pm2 start scripts/server.js --name exam-server -- --host 127.0.0.1 --port 3000
```

---

## 5. 验证访问

### 在服务器上验证

```bash
# 检查服务是否监听
sudo ss -tlnp | grep :3000

# 或
sudo netstat -tlnp | grep :3000

# 测试本地访问
curl http://localhost:3000
```

### 从外部访问

1. **获取服务器公网 IP**

   ```bash
   curl ifconfig.me
   # 或
   curl icanhazip.com
   ```

2. **在浏览器访问**

   ```
   http://YOUR_SERVER_IP:3000
   ```

3. **使用 curl 测试**
   ```bash
   # 在你的本地电脑上运行
   curl http://YOUR_SERVER_IP:3000
   ```

### 故障排查

如果无法访问，按顺序检查：

1. **服务是否运行**

   ```bash
   pm2 status
   pm2 logs exam-server --lines 20
   ```

2. **端口是否监听**

   ```bash
   sudo ss -tlnp | grep :3000
   ```

3. **防火墙是否开放**

   ```bash
   # UFW
   sudo ufw status | grep 3000

   # Firewalld
   sudo firewall-cmd --list-ports | grep 3000

   # iptables
   sudo iptables -L -n | grep 3000
   ```

4. **云安全组是否配置**

   - 登录云控制台检查安全组规则

5. **测试端口连通性**
   ```bash
   # 在本地电脑测试（需要安装 telnet 或 nc）
   telnet YOUR_SERVER_IP 3000
   # 或
   nc -zv YOUR_SERVER_IP 3000
   ```

---

## 常见部署场景

### 场景 1：简单部署（开放给所有人）

```bash
# 1. 开放防火墙端口
sudo ufw allow 3000/tcp

# 2. 配置云安全组（允许 0.0.0.0/0）

# 3. 启动服务器
pm2 start ecosystem.config.cjs --only exam-server

# 4. 访问
# http://YOUR_SERVER_IP:3000
```

### 场景 2：安全部署（只允许特定 IP）

```bash
# 1. 只允许你的 IP 访问
sudo ufw allow from YOUR_IP to any port 3000

# 2. 在云安全组也限制为你的 IP

# 3. 启动服务器
pm2 start ecosystem.config.cjs --only exam-server
```

### 场景 3：使用 Nginx 反向代理（80/443 端口）

```bash
# 1. 安装 Nginx
sudo apt install nginx  # Ubuntu/Debian
# 或
sudo yum install nginx  # CentOS/RHEL

# 2. 配置 Nginx
sudo nano /etc/nginx/sites-available/examsplit
```

添加配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 或使用 IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用配置：

```bash
# 3. 启用站点
sudo ln -s /etc/nginx/sites-available/examsplit /etc/nginx/sites-enabled/

# 4. 测试配置
sudo nginx -t

# 5. 重启 Nginx
sudo systemctl restart nginx

# 6. 开放 80 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp  # 如果使用 HTTPS

# 7. 启动服务器（只监听本地）
pm2 start scripts/server.js --name exam-server -- --host 127.0.0.1 --port 3000

# 8. 访问
# http://your-domain.com 或 http://YOUR_SERVER_IP
```

---

## 安全建议 🔒

1. **不要将敏感数据暴露在公网**
2. **使用强密码或密钥认证 SSH**
3. **定期更新系统和软件包**
4. **考虑使用 HTTPS（Let's Encrypt 免费证书）**
5. **限制访问 IP 范围**
6. **使用防火墙规则限制访问**
7. **定期检查日志**
   ```bash
   pm2 logs exam-server --lines 100
   tail -f logs/server-output.log
   ```

---

## 快速命令参考

```bash
# 检查端口
./check-ports.sh

# 开放端口（UFW）
sudo ufw allow 3000/tcp && sudo ufw reload

# 启动服务器
pm2 start ecosystem.config.cjs --only exam-server

# 查看日志
pm2 logs exam-server

# 停止服务器
pm2 stop exam-server

# 重启服务器
pm2 restart exam-server

# 查看服务器公网 IP
curl ifconfig.me
```

---

## 总结

1. ✅ 选择一个端口（推荐 3000、8080 或 8000）
2. ✅ 配置服务器防火墙规则
3. ✅ 配置云服务商安全组（重要！）
4. ✅ 使用 `--host 0.0.0.0` 启动服务器
5. ✅ 验证可以从外部访问

Happy Deploying! 🚀
