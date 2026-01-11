#!/bin/bash

# PM2 管理脚本 - 便捷命令集合
# 使用方法: ./pm2-commands.sh [command]

case "$1" in
  # 启动批处理任务
  "start")
    echo "🚀 启动批处理任务..."
    pm2 start ecosystem.config.cjs --only exam-batch
    ;;

  # 启动批处理任务（自定义参数）
  "start-custom")
    echo "🚀 启动批处理任务（自定义参数）..."
    shift
    pm2 start ecosystem.config.cjs --only exam-batch -- "$@"
    ;;

  # 查看状态
  "status")
    pm2 status
    ;;

  # 查看日志（实时）
  "logs")
    pm2 logs exam-batch --lines 100
    ;;

  # 查看日志（显示所有）
  "logs-all")
    pm2 logs exam-batch --nostream --lines 1000
    ;;

  # 停止任务
  "stop")
    echo "⏸️ 停止批处理任务..."
    pm2 stop exam-batch
    ;;

  # 重启任务
  "restart")
    echo "🔄 重启批处理任务..."
    pm2 restart exam-batch
    ;;

  # 删除任务
  "delete")
    echo "🗑️ 删除批处理任务..."
    pm2 delete exam-batch
    ;;

  # 查看详细信息
  "info")
    pm2 info exam-batch
    ;;

  # 监控
  "monitor")
    pm2 monit
    ;;

  # 清理日志
  "flush")
    echo "🧹 清理日志..."
    pm2 flush
    ;;

  # 启动服务器
  "serve")
    echo "🌐 启动 Web 服务器..."
    pm2 start ecosystem.config.cjs --only exam-server
    ;;

  # 启动服务器（自定义端口）
  "serve-port")
    if [ -z "$2" ]; then
      echo "❌ 请指定端口号"
      echo "用法: ./pm2-commands.sh serve-port 8080"
      exit 1
    fi
    echo "🌐 启动 Web 服务器（端口 $2）..."
    pm2 start ecosystem.config.cjs --only exam-server -- --port "$2"
    ;;

  # 停止服务器
  "serve-stop")
    echo "⏸️ 停止 Web 服务器..."
    pm2 stop exam-server
    ;;

  # 测试服务器
  "test")
    echo "🧪 测试服务器配置..."
    ./test-server.sh
    ;;

  # 检查端口
  "check-ports")
    echo "🔍 检查端口配置..."
    ./check-ports.sh
    ;;

  # 停止所有
  "stop-all")
    echo "⏸️ 停止所有任务..."
    pm2 stop all
    ;;

  # 删除所有
  "delete-all")
    echo "🗑️ 删除所有任务..."
    pm2 delete all
    ;;

  *)
    echo "📖 PM2 管理命令使用说明"
    echo ""
    echo "📦 批处理任务:"
    echo "  ./pm2-commands.sh start          - 启动批处理任务"
    echo "  ./pm2-commands.sh start-custom <args> - 自定义参数启动"
    echo "  ./pm2-commands.sh stop           - 停止批处理任务"
    echo "  ./pm2-commands.sh restart        - 重启批处理任务"
    echo "  ./pm2-commands.sh delete         - 删除批处理任务"
    echo ""
    echo "🌐 Web 服务器:"
    echo "  ./pm2-commands.sh serve          - 启动 Web 服务器"
    echo "  ./pm2-commands.sh serve-port <port> - 指定端口启动服务器"
    echo "  ./pm2-commands.sh serve-stop     - 停止 Web 服务器"
    echo "  ./pm2-commands.sh test           - 测试服务器配置"
    echo "  ./pm2-commands.sh check-ports    - 检查端口配置"
    echo ""
    echo "📊 查看命令:"
    echo "  ./pm2-commands.sh status         - 查看任务状态"
    echo "  ./pm2-commands.sh logs           - 查看实时日志"
    echo "  ./pm2-commands.sh logs-all       - 查看所有日志"
    echo "  ./pm2-commands.sh info           - 查看详细信息"
    echo "  ./pm2-commands.sh monitor        - 监控面板"
    echo ""
    echo "🛠️ 其他命令:"
    echo "  ./pm2-commands.sh flush          - 清理日志"
    echo "  ./pm2-commands.sh stop-all       - 停止所有任务"
    echo "  ./pm2-commands.sh delete-all     - 删除所有任务"
    echo ""
    echo "💡 示例:"
    echo "  ./pm2-commands.sh start-custom --concurrency 10 --force"
    echo "  ./pm2-commands.sh serve-port 8080"
    echo ""
    echo "📚 或直接使用 PM2 命令:"
    echo "  pm2 start ecosystem.config.cjs --only exam-batch"
    echo "  pm2 start ecosystem.config.cjs --only exam-server"
    echo "  pm2 logs exam-batch"
    echo "  pm2 stop exam-batch"
    ;;
esac

