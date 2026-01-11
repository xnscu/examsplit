# PM2 快速启动 - 30 秒上手 🚀

## 在远程服务器上操作

### 1️⃣ 首次使用 - 安装 PM2

```bash
npm install -g pm2
```

### 2️⃣ 启动批处理任务

```bash
cd ~/examsplit
pm2 start ecosystem.config.cjs --only exam-batch
```

### 3️⃣ 查看运行状态和日志

```bash
# 查看状态
pm2 status

# 查看实时日志（看进度）
pm2 logs exam-batch
```

### 4️⃣ 现在可以断开 SSH 了！

任务会在后台继续运行。输入 `exit` 或关闭终端都没问题。

---

## 稍后回来查看

重新连接服务器：

```bash
ssh web@foo.com
cd ~/examsplit

# 查看状态
pm2 status

# 查看日志
pm2 logs exam-batch --lines 100
```

---

## 停止或删除任务

```bash
# 停止（但保留在 PM2 列表中）
pm2 stop exam-batch

# 删除（完全移除）
pm2 delete exam-batch
```

---

## 使用 pnpm 命令（更简单）

```bash
# 启动
pnpm pm2:start

# 查看日志
pnpm pm2:logs

# 查看状态
pnpm pm2:status

# 停止
pnpm pm2:stop

# 删除
pnpm pm2:delete
```

---

## 自定义参数

### 增加并发数（处理更快）

```bash
pm2 start ecosystem.config.cjs --only exam-batch -- --concurrency 10
```

### 强制重新处理所有文件

```bash
pm2 start ecosystem.config.cjs --only exam-batch -- --force
```

---

## 完整工作流示例

```bash
# 1. SSH 连接到服务器
ssh web@foo.com

# 2. 进入项目目录
cd ~/examsplit

# 3. 启动批处理（10个并发）
pm2 start ecosystem.config.cjs --only exam-batch -- --concurrency 10

# 4. 查看日志确认启动成功
pm2 logs exam-batch --lines 20

# 5. 按 Ctrl+C 停止查看日志（任务继续运行）

# 6. 断开 SSH
exit

# ... 几小时后 ...

# 7. 重新连接查看结果
ssh web@foo.com
cd ~/examsplit
pm2 logs exam-batch --lines 50

# 8. 查看输出文件
ls -lh output/

# 9. 任务完成后删除
pm2 delete exam-batch
```

---

## 常见问题

**Q: 如何知道任务是否完成？**

```bash
pm2 status  # 看 status 列，如果是 stopped 说明已完成
pm2 logs exam-batch --lines 50  # 看最后的日志
```

**Q: 任务失败了怎么办？**

```bash
pm2 logs exam-batch --err  # 查看错误日志
```

**Q: 如何重新开始？**

```bash
pm2 delete exam-batch
pm2 start ecosystem.config.js --only exam-batch
```

---

## 📖 详细文档

查看 `PM2-USAGE.md` 获取完整使用说明。

---

**就这么简单！现在开始处理你的 PDF 文件吧！** 🎉
