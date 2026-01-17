#!/usr/bin/env node

/**
 * Post-process existing question images for alignment
 *
 * This script takes images from an existing ZIP file and applies:
 * 1. Auto-trim whitespace from all sides
 * 2. Add uniform padding
 * 3. Align all images to same width
 *
 * Usage:
 *   node scripts/post-process-alignment.js <input-zip> [options]
 *
 * Options:
 *   -o, --output <path>        Output ZIP file path (default: input_aligned.zip)
 *   -p, --padding <number>     Padding to add after trimming (default: 10)
 *   --no-alignment             Skip width alignment (only trim and pad)
 */

import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { program } from 'commander';
import { trimWhitespace } from './canvas-utils.js';

/**
 * Trim whitespace from image and add uniform padding
 */
async function trimAndPadImage(imageBase64, padding = 10) {
  const img = await loadImage(imageBase64);

  const tempCanvas = createCanvas(img.width, img.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);

  const bounds = trimWhitespace(tempCtx, img.width, img.height);

  if (bounds.w === 0 || bounds.h === 0) {
    return {
      dataUrl: imageBase64,
      width: img.width,
      height: img.height
    };
  }

  const newWidth = bounds.w + (padding * 2);
  const newHeight = bounds.h + (padding * 2);
  const newCanvas = createCanvas(newWidth, newHeight);
  const newCtx = newCanvas.getContext('2d');

  newCtx.fillStyle = '#ffffff';
  newCtx.fillRect(0, 0, newWidth, newHeight);

  newCtx.drawImage(
    tempCanvas,
    bounds.x, bounds.y, bounds.w, bounds.h,
    padding, padding, bounds.w, bounds.h
  );

  const buffer = newCanvas.toBuffer('image/jpeg', { quality: 0.95 });
  return {
    dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
    width: newWidth,
    height: newHeight
  };
}

/**
 * Align all images to the same width
 */
async function alignImageWidths(images, targetWidth) {
  const aligned = [];

  for (const img of images) {
    const image = await loadImage(img.dataUrl);

    if (image.width === targetWidth) {
      aligned.push(img);
      continue;
    }

    const canvas = createCanvas(targetWidth, image.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, image.height);
    ctx.drawImage(image, 0, 0);

    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
    aligned.push({
      ...img,
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`
    });
  }

  return aligned;
}

/**
 * Process a ZIP file
 */
async function processZip(inputPath, outputPath, options) {
  console.log('📦 Loading ZIP file:', inputPath);

  const zipData = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(zipData);

  // Extract question images (not in full_pages folder)
  const questionFiles = Object.keys(zip.files).filter(name =>
    name.endsWith('.jpg') && !name.startsWith('full_pages/')
  );

  console.log(`📊 Found ${questionFiles.length} question images`);

  if (questionFiles.length === 0) {
    console.error('❌ No question images found in ZIP');
    process.exit(1);
  }

  // Load images
  console.log('\n📥 Loading images...');
  const images = [];
  for (const filename of questionFiles) {
    const buffer = await zip.files[filename].async('nodebuffer');
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    images.push({ filename, dataUrl });
  }

  // Step 1: Trim and pad
  console.log(`\n✂️  Trimming whitespace and adding ${options.padding}px padding...`);
  for (let i = 0; i < images.length; i++) {
    const result = await trimAndPadImage(images[i].dataUrl, options.padding);
    images[i].dataUrl = result.dataUrl;
    images[i].width = result.width;
    images[i].height = result.height;
    process.stdout.write(`  Progress: ${i + 1}/${images.length}\r`);
  }
  console.log(`  Progress: ${images.length}/${images.length} ✅`);

  // Step 2: Align widths
  let processedImages = images;
  if (options.alignment !== false) {
    const maxWidth = Math.max(...images.map(img => img.width));
    console.log(`\n📏 Maximum width: ${maxWidth}px`);
    console.log('↔️  Aligning widths...');
    processedImages = await alignImageWidths(images, maxWidth);
    console.log('  ✅ Width alignment complete');
  }

  // Create new ZIP
  console.log('\n📦 Creating output ZIP...');
  const outputZip = new JSZip();

  // Copy metadata and full_pages
  for (const [filename, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (filename === 'analysis_data.json' || filename.startsWith('full_pages/')) {
      const content = await file.async('nodebuffer');
      outputZip.file(filename, content);
    }
  }

  // Add processed images
  for (const img of processedImages) {
    const buffer = Buffer.from(img.dataUrl.split(',')[1], 'base64');
    outputZip.file(img.filename, buffer);
  }

  // Write output
  const outputBuffer = await outputZip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputPath, outputBuffer);

  console.log(`\n✅ Success! Output saved to: ${outputPath}`);
  console.log(`📊 Statistics:`);
  console.log(`   - Images processed: ${processedImages.length}`);
  console.log(`   - Output size: ${(outputBuffer.length / 1024 / 1024).toFixed(2)} MB`);
}

// CLI setup
program
  .name('post-process-alignment')
  .description('Post-process question images for alignment')
  .argument('<input-zip>', 'Input ZIP file path')
  .option('-o, --output <path>', 'Output ZIP file path')
  .option('-p, --padding <number>', 'Padding to add after trimming', parseFloat, 10)
  .option('--no-alignment', 'Skip width alignment')
  .action(async (inputZip, options) => {
    try {
      // Generate output path if not provided
      if (!options.output) {
        const dir = path.dirname(inputZip);
        const basename = path.basename(inputZip, '.zip');
        options.output = path.join(dir, `${basename}_aligned.zip`);
      }

      await processZip(inputZip, options.output, options);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });

program.parse();

