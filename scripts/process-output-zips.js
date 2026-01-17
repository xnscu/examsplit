import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, '../output');
const tempDir = path.join(__dirname, '../temp_unzip');

// 确保临时目录存在
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 获取所有zip文件
const zipFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.zip'));

console.log(`找到 ${zipFiles.length} 个zip文件`);

zipFiles.forEach(zipFile => {
  const zipPath = path.join(outputDir, zipFile);
  const extractDir = path.join(tempDir, zipFile.replace('.zip', ''));

  // 清理并创建解压目录
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  console.log(`\n处理: ${zipFile}`);

  try {
    // 解压zip文件
    execSync(`unzip -q "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });

    // 读取analysis_data.json
    const jsonPath = path.join(extractDir, 'analysis_data.json');
    if (!fs.existsSync(jsonPath)) {
      console.log(`  警告: 未找到 analysis_data.json`);
      return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let modified = false;
    let hasNonFlattenableBoxes = false;

    // 遍历所有页(键为 '0', '1', '2', ...)
    Object.keys(data).forEach(pageKey => {
      const page = data[pageKey];

      // 删除每一页的dataUrl字段
      if (page.dataUrl !== undefined) {
        delete page.dataUrl;
        modified = true;
      }

      // 处理每一页的detections中的boxes_2d
      if (page.detections && Array.isArray(page.detections)) {
        page.detections.forEach((detection, index) => {
          if (detection.boxes_2d && Array.isArray(detection.boxes_2d)) {
            // 检查是否是嵌套数组且只有一个元素
            if (detection.boxes_2d.length === 1 && Array.isArray(detection.boxes_2d[0])) {
              // 拍平
              detection.boxes_2d = detection.boxes_2d[0];
              modified = true;
            } else if (detection.boxes_2d.length > 1 && Array.isArray(detection.boxes_2d[0])) {
              // 嵌套数组但有多个元素，不拍平
              hasNonFlattenableBoxes = true;
            }
          }
        });
      }
    });

    if (hasNonFlattenableBoxes) {
      console.log(`  ⚠️  发现不可拍平的boxes_2d: ${zipFile}`);
    }

    if (modified) {
      // 写回json文件
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

      // 删除原zip文件
      fs.unlinkSync(zipPath);

      // 重新打包
      execSync(`cd "${extractDir}" && zip -q -r "${zipPath}" .`, { stdio: 'inherit' });

      console.log(`  ✓ 已更新`);
    } else {
      console.log(`  - 无需修改`);
    }

    // 清理解压目录
    fs.rmSync(extractDir, { recursive: true, force: true });

  } catch (error) {
    console.error(`  错误: ${error.message}`);
  }
});

// 清理临时目录
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('\n处理完成！');

