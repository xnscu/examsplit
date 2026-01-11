#!/bin/bash

# 端口检查脚本
# 用于检查远程服务器上哪些端口可以从互联网访问

echo "🔍 检查服务器端口和防火墙配置"
echo "================================================"
echo ""

# 1. 检查防火墙状态（Ubuntu/Debian - ufw）
echo "1️⃣ UFW 防火墙状态："
if command -v ufw &> /dev/null; then
    sudo ufw status verbose
else
    echo "   ❌ UFW 未安装"
fi
echo ""

# 2. 检查防火墙状态（CentOS/RHEL - firewalld）
echo "2️⃣ Firewalld 防火墙状态："
if command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --list-all
else
    echo "   ❌ Firewalld 未安装"
fi
echo ""

# 3. 检查 iptables 规则
echo "3️⃣ iptables 规则："
if command -v iptables &> /dev/null; then
    echo "   入站规则 (INPUT):"
    sudo iptables -L INPUT -n --line-numbers | grep -E "(ACCEPT|REJECT|DROP)" | head -20
else
    echo "   ❌ iptables 未安装"
fi
echo ""

# 4. 检查当前监听的端口
echo "4️⃣ 当前监听的端口："
if command -v netstat &> /dev/null; then
    sudo netstat -tlnp | grep LISTEN
elif command -v ss &> /dev/null; then
    sudo ss -tlnp | grep LISTEN
else
    echo "   ❌ netstat 和 ss 都未安装"
fi
echo ""

# 5. 常用 Web 端口推荐
echo "5️⃣ 常用 Web 端口推荐："
echo "   ✅ 80   - HTTP（通常开放）"
echo "   ✅ 443  - HTTPS（通常开放）"
echo "   ✅ 3000 - Node.js 常用开发端口"
echo "   ✅ 8080 - 常用备用 HTTP 端口"
echo "   ✅ 8000 - 常用备用端口"
echo "   ✅ 8888 - 常用备用端口"
echo ""

# 6. 测试常用端口是否开放
echo "6️⃣ 测试端口是否可以绑定："
echo ""
test_ports=(3000 8080 8000 8888 9000)

for port in "${test_ports[@]}"; do
    # 检查端口是否已被占用
    if sudo ss -tlnp | grep -q ":$port "; then
        echo "   ⚠️  端口 $port 已被占用"
    else
        # 尝试临时监听该端口
        timeout 1 nc -l $port &> /dev/null &
        nc_pid=$!
        sleep 0.5

        if ps -p $nc_pid > /dev/null 2>&1; then
            echo "   ✅ 端口 $port 可用"
            kill $nc_pid 2>/dev/null
        else
            echo "   ❓ 端口 $port 状态未知"
        fi
    fi
done
echo ""

# 7. 云服务商安全组提示
echo "7️⃣ ⚠️  重要提示："
echo "================================================"
echo "如果你使用云服务器（阿里云、腾讯云、AWS等），"
echo "除了服务器本地防火墙外，还需要在云控制台配置："
echo ""
echo "   📌 安全组规则（Security Group）"
echo "   📌 开放相应的入站端口"
echo ""
echo "常见云服务商控制台："
echo "   • 阿里云：云服务器 ECS → 实例 → 安全组"
echo "   • 腾讯云：云服务器 → 实例 → 安全组"
echo "   • AWS：EC2 → Security Groups"
echo ""

# 8. 如何开放端口的建议
echo "8️⃣ 如何开放端口："
echo "================================================"
echo ""
echo "UFW (Ubuntu/Debian):"
echo "   sudo ufw allow 3000/tcp"
echo "   sudo ufw reload"
echo ""
echo "Firewalld (CentOS/RHEL):"
echo "   sudo firewall-cmd --permanent --add-port=3000/tcp"
echo "   sudo firewall-cmd --reload"
echo ""
echo "iptables:"
echo "   sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT"
echo "   sudo service iptables save"
echo ""

echo "检查完成！"

