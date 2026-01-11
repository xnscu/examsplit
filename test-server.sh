#!/bin/bash

# Web 服务器测试脚本
# 用于快速测试服务器配置和网络连通性

echo "🧪 Web 服务器测试工具"
echo "================================================"
echo ""

# 检查服务器状态
echo "1️⃣ 检查 PM2 服务状态："
if command -v pm2 &> /dev/null; then
    pm2 list | grep exam-server

    if pm2 list | grep -q exam-server; then
        echo "   ✅ exam-server 已在 PM2 中注册"
    else
        echo "   ⚠️  exam-server 未运行"
        echo "   运行: pm2 start ecosystem.config.cjs --only exam-server"
    fi
else
    echo "   ❌ PM2 未安装"
fi
echo ""

# 检查端口监听
echo "2️⃣ 检查端口监听状态："
echo ""

check_port() {
    local port=$1
    if command -v ss &> /dev/null; then
        if sudo ss -tlnp | grep -q ":$port "; then
            echo "   ✅ 端口 $port 正在监听"
            sudo ss -tlnp | grep ":$port " | head -1
            return 0
        else
            echo "   ❌ 端口 $port 未监听"
            return 1
        fi
    elif command -v netstat &> /dev/null; then
        if sudo netstat -tlnp | grep -q ":$port "; then
            echo "   ✅ 端口 $port 正在监听"
            sudo netstat -tlnp | grep ":$port " | head -1
            return 0
        else
            echo "   ❌ 端口 $port 未监听"
            return 1
        fi
    else
        echo "   ⚠️  无法检查（需要 ss 或 netstat）"
        return 2
    fi
}

# 检查常用端口
ports=(3000 8080 8000 8888)
listening_port=""

for port in "${ports[@]}"; do
    if check_port $port; then
        listening_port=$port
        break
    fi
done

echo ""

# 测试本地连接
if [ -n "$listening_port" ]; then
    echo "3️⃣ 测试本地连接（端口 $listening_port）："

    if command -v curl &> /dev/null; then
        response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$listening_port 2>/dev/null)

        if [ "$response" = "200" ]; then
            echo "   ✅ 本地连接成功 (HTTP $response)"
            echo "   测试命令: curl http://localhost:$listening_port"
        else
            echo "   ⚠️  本地连接返回 HTTP $response"
        fi
    else
        echo "   ⚠️  curl 未安装，无法测试"
    fi
else
    echo "3️⃣ 测试本地连接："
    echo "   ⚠️  未发现监听的服务器端口"
fi
echo ""

# 获取 IP 地址
echo "4️⃣ 获取服务器 IP 地址："

# 公网 IP
if command -v curl &> /dev/null; then
    public_ip=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null)
    if [ -n "$public_ip" ]; then
        echo "   🌐 公网 IP: $public_ip"
    else
        echo "   ⚠️  无法获取公网 IP（可能没有网络连接）"
    fi
else
    echo "   ⚠️  curl 未安装，无法获取公网 IP"
fi

# 本地 IP
if command -v hostname &> /dev/null; then
    local_ips=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | head -3)
    if [ -n "$local_ips" ]; then
        echo "   🏠 本地 IP:"
        while IFS= read -r ip; do
            echo "      - $ip"
        done <<< "$local_ips"
    fi
fi
echo ""

# 检查防火墙
echo "5️⃣ 检查防火墙规则："

if command -v ufw &> /dev/null; then
    echo "   UFW 状态:"
    sudo ufw status | grep -E "(Status|$listening_port)" || echo "      未配置端口 $listening_port"
elif command -v firewall-cmd &> /dev/null; then
    echo "   Firewalld 状态:"
    sudo firewall-cmd --list-ports | grep -q "$listening_port" && echo "      ✅ 端口 $listening_port 已开放" || echo "      ⚠️  端口 $listening_port 未开放"
else
    echo "   ⚠️  未检测到常见防火墙工具"
fi
echo ""

# 生成访问 URL
if [ -n "$listening_port" ]; then
    echo "6️⃣ 访问地址："
    echo "   📍 本地访问:"
    echo "      http://localhost:$listening_port"
    echo "      http://127.0.0.1:$listening_port"
    echo ""

    if [ -n "$public_ip" ]; then
        echo "   📍 远程访问 (需要开放防火墙和云安全组):"
        echo "      http://$public_ip:$listening_port"
        echo ""

        echo "   🧪 测试远程连通性（在本地电脑运行）:"
        echo "      curl http://$public_ip:$listening_port"
        echo "      telnet $public_ip $listening_port"
        echo "      nc -zv $public_ip $listening_port"
    fi
fi
echo ""

# 检查清单
echo "7️⃣ 远程访问检查清单："
echo "================================================"
echo ""
echo "   ☐ 1. 服务器正在运行 (pm2 status)"
if [ -n "$listening_port" ]; then
    echo "   ✅ 2. 端口正在监听 ($listening_port)"
else
    echo "   ☐ 2. 端口正在监听"
fi
echo "   ☐ 3. 服务器使用 --host 0.0.0.0 启动"
echo "   ☐ 4. 本地防火墙已开放端口"
echo "   ☐ 5. 云安全组已配置（如使用云服务器）"
echo "   ☐ 6. 可以从外部访问"
echo ""

# 快速修复建议
echo "8️⃣ 快速修复建议："
echo "================================================"
echo ""

if ! pm2 list 2>/dev/null | grep -q exam-server; then
    echo "   🔧 启动服务器:"
    echo "      pm2 start ecosystem.config.cjs --only exam-server"
    echo ""
fi

if [ -n "$listening_port" ]; then
    echo "   🔧 开放防火墙端口 $listening_port:"
    if command -v ufw &> /dev/null; then
        echo "      sudo ufw allow $listening_port/tcp"
        echo "      sudo ufw reload"
    elif command -v firewall-cmd &> /dev/null; then
        echo "      sudo firewall-cmd --permanent --add-port=$listening_port/tcp"
        echo "      sudo firewall-cmd --reload"
    else
        echo "      sudo iptables -A INPUT -p tcp --dport $listening_port -j ACCEPT"
    fi
    echo ""
fi

echo "   🔧 配置云安全组（重要！）:"
echo "      登录云控制台 → 安全组 → 添加入站规则"
echo "      协议: TCP, 端口: $listening_port, 来源: 0.0.0.0/0"
echo ""

echo "================================================"
echo "测试完成！"
echo ""
echo "📚 查看详细文档:"
echo "   • 快速参考: cat SERVER-QUICK-REF.md"
echo "   • 部署指南: cat REMOTE-DEPLOY.md"
echo "   • 端口检查: ./check-ports.sh"

