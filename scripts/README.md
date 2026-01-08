# PDF Question Splitter - Node.js CLI

这是浏览器版本的 Node.js 命令行实现，使用 Google Gemini AI 自动识别并提取数学试卷中的题目。

## 功能特性

- 📄 加载 PDF 文件并渲染为高清图片
- 🤖 使用 Google Gemini AI 智能识别题目边界
- ✂️ 自动裁剪并处理题目图片（包括去边框算法）
- 📦 输出为 ZIP 文件，包含所有题目图片
- ⚙️ 支持所有 UI 参数的命令行配置

## 安装依赖

```bash
npm install
```

这将安装所需的依赖：
- `canvas` - Node.js 图像处理
- `commander` - CLI 参数解析
- `pdfjs-dist` - PDF 渲染
- `jszip` - ZIP 文件生成

## API 配置

脚本使用 Gemini API 代理，**无需配置 API Key**。

**API 配置：**
- 代理地址：`https://gproxy.xnscu.com/api/gemini`
- 模型名称：`gemini-2.0-flash-exp`
- 使用原生 fetch API 直接调用，无需 SDK

## 使用方法

### 基础用法

```bash
# 直接使用
node scripts/split-pdf.js exam.pdf

# 或使用 npm script
npm run split exam.pdf
```

### 指定输出路径

```bash
node scripts/split-pdf.js exam.pdf -o output/result.zip
```

### 完整参数示例

```bash
node scripts/split-pdf.js exam.pdf \
  -o output.zip \
  --scale 3.0 \
  --crop-padding 25 \
  --canvas-padding-left 10 \
  --canvas-padding-right 10 \
  --canvas-padding-y 10 \
  --merge-overlap 20
```

## 命令行参数

| 参数 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `<pdf-path>` | - | 必填 | PDF 文件路径 |
| `--output` | `-o` | `output.zip` | 输出 ZIP 文件路径 |
| `--scale` | - | `3.0` | PDF 渲染缩放比例（影响图片质量） |
| `--crop-padding` | - | `25` | 裁剪边距（0-100 像素） |
| `--canvas-padding-left` | - | `10` | 左侧内边距（0-100 像素） |
| `--canvas-padding-right` | - | `10` | 右侧内边距（0-100 像素） |
| `--canvas-padding-y` | - | `10` | 上下内边距（0-100 像素） |
| `--merge-overlap` | - | `20` | 多栏合并时的重叠量（0-100 像素） |

## 输出结构

生成的 ZIP 文件包含：

```
output.zip
├── analysis_data.json          # AI 识别的原始数据
├── full_pages/                 # 完整页面图片
│   ├── Page_1.jpg
│   ├── Page_2.jpg
│   └── ...
└── {filename}_Q{id}.jpg        # 提取的题目图片
    └── exam_Q1.jpg
    └── exam_Q2.jpg
    └── ...
```

## 参数调优建议

### cropPadding（裁剪边距）
- 增加此值可确保题目边界不被裁掉
- 建议范围：20-40 像素
- 默认值 25 适用于大多数情况

### canvasPaddingY（上下内边距）
- 控制题目图片上下的留白
- 增加可改善视觉效果
- 建议范围：5-20 像素

### canvasPaddingLeft/Right（左右内边距）
- 控制题目图片左右的留白
- 通常保持较小值以节省空间
- 建议范围：5-15 像素

### scale（渲染缩放）
- 影响输出图片的分辨率
- 值越大，图片越清晰，但处理速度越慢
- 建议范围：2.0-4.0
- 默认 3.0 在质量和速度间取得平衡

### mergeOverlap（合并重叠）
- 用于处理跨栏题目时的衔接
- 负值可去除内部留白，正值增加间距
- 建议范围：10-30 像素

## 示例场景

### 高质量输出

```bash
node scripts/split-pdf.js exam.pdf \
  --scale 4.0 \
  --crop-padding 30
```

### 快速处理

```bash
node scripts/split-pdf.js exam.pdf \
  --scale 2.0
```

### 紧凑裁剪

```bash
node scripts/split-pdf.js exam.pdf \
  --crop-padding 15 \
  --canvas-padding-left 5 \
  --canvas-padding-right 5 \
  --canvas-padding-y 5
```

## 常见问题

### 1. Canvas 安装失败

如果 `npm install` 时 canvas 安装失败，可能需要安装系统依赖：

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

### 2. 内存不足

处理大型 PDF 时可能需要增加 Node.js 内存限制：
```bash
NODE_OPTIONS="--max-old-space-size=4096" node scripts/split-pdf.js exam.pdf
```

## 技术细节

### 处理流程

1. **PDF 加载** - 使用 pdfjs-dist 加载 PDF
2. **页面渲染** - 每页渲染为高分辨率 JPEG（3x 缩放）
3. **AI 识别** - 通过 fetch API 直接调用 Gemini API 代理（gemini-2.0-flash-exp）分析图片并返回题目边界框
4. **智能裁剪** - 根据边界框裁剪，应用"Edge Peel"算法去除边框
5. **图片拼接** - 处理跨栏题目，合并多个片段
6. **ZIP 导出** - 打包所有结果到 ZIP 文件

### Edge Peel 算法

自动检测并移除图片边缘的伪影（如黑线、边框）：
- 从边缘向内扫描，寻找"干净"像素
- 使用阈值 200 区分墨迹和空白
- 包含安全限制（最多裁剪 30%）防止过度裁剪

### 并发与重试

- 自动重试机制（最多 5 次）
- 速率限制自动退避（指数延迟）
- 适配 Google API 限流策略

## 与浏览器版本的区别

| 特性 | 浏览器版本 | Node.js 版本 |
|------|-----------|-------------|
| 实时预览 | ✅ | ❌ |
| 调试视图 | ✅ | ❌ |
| 参数实时调整 | ✅ | ❌ |
| 批量处理 | ❌ | ✅ |
| 命令行自动化 | ❌ | ✅ |
| CI/CD 集成 | ❌ | ✅ |

## 许可证

与主项目相同
