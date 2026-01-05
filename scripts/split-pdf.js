#!/usr/bin/env node

/**
 * Math Exam PDF Question Splitter - Node.js CLI Version
 *
 * Usage:
 *   node scripts/split-pdf.js <pdf-path> [options]
 *
 * Example:
 *   node scripts/split-pdf.js exam.pdf -o output.zip --crop-padding 25
 */

import { createCanvas, loadImage, Image } from 'canvas';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { GoogleGenAI, Type } from '@google/genai';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { program } from 'commander';

// Set globals for pdfjs
if (typeof global !== 'undefined') {
  global.Image = Image;
  global.Canvas = createCanvas(0, 0).constructor;
  global.HTMLCanvasElement = createCanvas(0, 0).constructor;
}

// Configure pdfjs for Node.js environment
const NodeCanvasFactory = class {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext('2d')
    };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
};

const NodeCanvasImageFactory = class {
  create(width, height) {
    const img = new Image(width, height);
    return img;
  }
};

// Import shared utilities and AI config
const { getTrimmedBounds, isContained } = await import('../shared/canvas-utils.js');
const { PROMPTS, SCHEMAS, MODEL_IDS } = await import('../shared/ai-config.js');

// Delay utility
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Initialize Gemini AI client
 */
function initializeAI(apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  return new GoogleGenAI({ apiKey });
}

/**
 * Render PDF page to JPEG image
 */
async function renderPageToImage(page, scale = 3) {
  const viewport = page.getViewport({ scale });
  const canvasFactory = new NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

  await page.render({
    canvasContext: canvasAndContext.context,
    viewport: viewport,
    canvasFactory: canvasFactory,
    imageFactory: new NodeCanvasImageFactory()
  }).promise;

  const buffer = canvasAndContext.canvas.toBuffer('image/jpeg', { quality: 0.9 });
  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

  return { dataUrl, width: canvasAndContext.canvas.width, height: canvasAndContext.canvas.height };
}

/**
 * Detect questions on a page using Gemini AI
 */
async function detectQuestionsOnPage(ai, image, modelId = MODEL_IDS.FLASH, maxRetries = 5) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image.split(',')[1]
                }
              },
              { text: PROMPTS.BASIC }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: SCHEMAS.BASIC
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");

      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Invalid response format: Expected Array");

      return parsed;
    } catch (error) {
      attempt++;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      const waitTime = isRateLimit ? Math.pow(2, attempt) * 1000 : 2000;

      console.warn(`Gemini detection attempt ${attempt} failed: ${error.message}. Retrying in ${waitTime}ms...`);

      if (attempt >= maxRetries) {
        throw new Error(`AI 识别在 ${maxRetries} 次重试后仍然失败: ${error.message}`);
      }

      await delay(waitTime);
    }
  }
  return [];
}

/**
 * Merges two base64 images vertically with an optional gap.
 * A negative gap allows for overlapping (removing internal paddings).
 */
async function mergeBase64Images(topBase64, bottomBase64, gap = 0) {
  const [imgTop, imgBottom] = await Promise.all([
    loadImage(topBase64),
    loadImage(bottomBase64)
  ]);

  const width = Math.max(imgTop.width, imgBottom.width);
  const height = Math.max(0, imgTop.height + imgBottom.height + gap);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Draw top image
  ctx.drawImage(imgTop, (width - imgTop.width) / 2, 0);

  // Draw bottom image starting after the top image plus the gap
  ctx.drawImage(imgBottom, (width - imgBottom.width) / 2, imgTop.height + gap);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/**
 * Crop and stitch image fragments based on detected bounding boxes
 */
async function cropAndStitchImage(sourceDataUrl, boxes, originalWidth, originalHeight, settings) {
  if (!boxes || boxes.length === 0) {
    return { final: null, original: null };
  }

  // Filter out contained boxes
  const indicesToDrop = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      if (isContained(boxes[i], boxes[j])) {
        if (isContained(boxes[j], boxes[i]) && i > j) {
          indicesToDrop.add(i);
          break;
        } else if (!isContained(boxes[j], boxes[i])) {
          indicesToDrop.add(i);
          break;
        }
      }
    }
  }

  const finalBoxes = boxes.filter((_, i) => !indicesToDrop.has(i));
  const img = await loadImage(sourceDataUrl);

  const CROP_PADDING = settings.cropPadding;
  const CANVAS_PADDING_LEFT = settings.canvasPaddingLeft;
  const CANVAS_PADDING_RIGHT = settings.canvasPaddingRight;
  const CANVAS_PADDING_Y = settings.canvasPaddingY;

  // Process fragments
  const processedFragments = finalBoxes.map((box) => {
    const [ymin, xmin, ymax, xmax] = box;
    const x = Math.max(0, (xmin / 1000) * originalWidth - CROP_PADDING);
    const y = Math.max(0, (ymin / 1000) * originalHeight - CROP_PADDING);
    const rawW = ((xmax - xmin) / 1000) * originalWidth + (CROP_PADDING * 2);
    const rawH = ((ymax - ymin) / 1000) * originalHeight + (CROP_PADDING * 2);
    const w = Math.min(originalWidth - x, rawW);
    const h = Math.min(originalHeight - y, rawH);

    const tempCanvas = createCanvas(Math.floor(w), Math.floor(h));
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, x, y, w, h, 0, 0, w, h);

    const trim = getTrimmedBounds(tempCtx, Math.floor(w), Math.floor(h));

    return {
      canvas: tempCanvas,
      trim: trim,
      absInkX: x + trim.x
    };
  }).filter(Boolean);

  if (processedFragments.length === 0) {
    return { final: null, original: null };
  }

  const minAbsInkX = Math.min(...processedFragments.map(f => f.absInkX));
  const maxRightEdge = Math.max(...processedFragments.map(f => (f.absInkX - minAbsInkX) + f.trim.w));
  const finalWidth = maxRightEdge + CANVAS_PADDING_LEFT + CANVAS_PADDING_RIGHT;
  const fragmentGap = 10;
  const totalContentHeight = processedFragments.reduce((acc, f) => acc + f.trim.h, 0) +
    (fragmentGap * Math.max(0, processedFragments.length - 1));
  const finalHeight = totalContentHeight + (CANVAS_PADDING_Y * 2);

  const canvas = createCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, finalWidth, finalHeight);

  let currentY = CANVAS_PADDING_Y;
  processedFragments.forEach((f) => {
    const relativeOffset = f.absInkX - minAbsInkX;
    const offsetX = CANVAS_PADDING_LEFT + relativeOffset;
    ctx.drawImage(
      f.canvas,
      f.trim.x, f.trim.y, f.trim.w, f.trim.h,
      offsetX, currentY, f.trim.w, f.trim.h
    );
    currentY += f.trim.h + fragmentGap;
  });

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  const finalDataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

  // Check if trimming occurred
  const wasTrimmed = processedFragments.some(f =>
    f.trim.w < f.canvas.width || f.trim.h < f.canvas.height
  );

  let originalDataUrl = null;
  if (wasTrimmed) {
    const maxRawWidth = Math.max(...processedFragments.map(f => f.canvas.width));
    const finalRawWidth = maxRawWidth + CANVAS_PADDING_LEFT + CANVAS_PADDING_RIGHT;
    const totalRawHeight = processedFragments.reduce((acc, f) => acc + f.canvas.height, 0) +
      (fragmentGap * Math.max(0, processedFragments.length - 1));
    const finalRawHeight = totalRawHeight + (CANVAS_PADDING_Y * 2);

    const rawCanvas = createCanvas(finalRawWidth, finalRawHeight);
    const rawCtx = rawCanvas.getContext('2d');
    rawCtx.fillStyle = '#ffffff';
    rawCtx.fillRect(0, 0, finalRawWidth, finalRawHeight);

    let currentRawY = CANVAS_PADDING_Y;
    processedFragments.forEach(f => {
      rawCtx.drawImage(f.canvas, CANVAS_PADDING_LEFT, currentRawY);
      currentRawY += f.canvas.height + fragmentGap;
    });

    const rawBuffer = rawCanvas.toBuffer('image/jpeg', { quality: 0.95 });
    originalDataUrl = `data:image/jpeg;base64,${rawBuffer.toString('base64')}`;
  }

  return { final: finalDataUrl, original: originalDataUrl };
}

/**
 * Main processing function
 */
async function processPdf(pdfPath, options) {
  console.log('📄 Loading PDF:', pdfPath);

  // Initialize API
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const ai = initializeAI(apiKey);

  // Crop settings
  const settings = {
    cropPadding: options.cropPadding,
    canvasPaddingLeft: options.canvasPaddingLeft,
    canvasPaddingRight: options.canvasPaddingRight,
    canvasPaddingY: options.canvasPaddingY,
    mergeOverlap: options.mergeOverlap
  };

  // Load PDF
  const pdfData = await fs.readFile(pdfPath);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
  const totalPages = pdf.numPages;

  console.log(`📊 Total pages: ${totalPages}`);
  console.log(`🤖 Using model: ${MODEL_IDS.FLASH}`);

  // Process pages
  const allQuestions = [];
  const debugData = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`\n📄 Processing page ${pageNum}/${totalPages}...`);

    try {
      // Render page
      const page = await pdf.getPage(pageNum);
      const { dataUrl, width, height } = await renderPageToImage(page, options.scale);

      // Detect questions
      console.log('  🔍 Detecting questions with AI...');
      const detections = await detectQuestionsOnPage(ai, dataUrl);
      console.log(`  ✅ Found ${detections.length} questions`);

      // Store debug data
      debugData.push({
        pageNumber: pageNum,
        dataUrl,
        width,
        height,
        detections
      });

      // Crop questions with continuation handling
      for (const detection of detections) {
        console.log(`  ✂️  Cropping question ${detection.id}...`);
        const { final, original } = await cropAndStitchImage(
          dataUrl,
          detection.boxes_2d,
          width,
          height,
          settings
        );

        if (final) {
          // Handle continuation logic: merge with previous question
          if (detection.id === 'continuation') {
            if (allQuestions.length > 0) {
              console.log(`  🔗  Merging continuation with previous question...`);
              const lastQ = allQuestions[allQuestions.length - 1];
              const stitchedImg = await mergeBase64Images(lastQ.dataUrl, final, -settings.mergeOverlap);
              lastQ.dataUrl = stitchedImg;
              // Also update originalDataUrl if exists
              if (lastQ.originalDataUrl && original) {
                lastQ.originalDataUrl = await mergeBase64Images(lastQ.originalDataUrl, original, -settings.mergeOverlap);
              }
            } else {
              console.warn(`  ⚠️  Continuation found but no previous question exists. Skipping.`);
            }
          } else {
            // Normal question: add to list
            allQuestions.push({
              id: detection.id,
              pageNumber: pageNum,
              dataUrl: final,
              originalDataUrl: original
            });
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error processing page ${pageNum}:`, error);
      throw error;
    }
  }

  console.log(`\n✨ Extracted ${allQuestions.length} questions in total`);

  // Create ZIP
  console.log('📦 Creating ZIP archive...');
  const zip = new JSZip();

  // Add metadata
  zip.file('analysis_data.json', JSON.stringify(debugData, null, 2));

  // Add full pages
  const pagesFolder = zip.folder('full_pages');
  for (const page of debugData) {
    const buffer = Buffer.from(page.dataUrl.split(',')[1], 'base64');
    pagesFolder.file(`Page_${page.pageNumber}.jpg`, buffer);
  }

  // Add extracted questions
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const questionCounts = {};

  for (const question of allQuestions) {
    const questionId = question.id;
    questionCounts[questionId] = (questionCounts[questionId] || 0) + 1;
    const count = questionCounts[questionId];

    const fileName = count > 1
      ? `${baseName}_Q${questionId}_${count}.jpg`
      : `${baseName}_Q${questionId}.jpg`;

    const buffer = Buffer.from(question.dataUrl.split(',')[1], 'base64');
    zip.file(fileName, buffer);
  }

  // Generate ZIP
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(options.output, zipBuffer);

  console.log(`\n✅ Success! Output saved to: ${options.output}`);
  console.log(`📊 Statistics:`);
  console.log(`   - Total pages: ${totalPages}`);
  console.log(`   - Questions extracted: ${allQuestions.length}`);
  console.log(`   - ZIP size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
}

// CLI setup
program
  .name('split-pdf')
  .description('Extract individual questions from math exam PDFs using AI')
  .argument('<pdf-path>', 'Path to the PDF file')
  .option('-o, --output <path>', 'Output ZIP file path', 'output.zip')
  .option('-k, --api-key <key>', 'Gemini API key (or use GEMINI_API_KEY env var)')
  .option('--scale <number>', 'PDF rendering scale', parseFloat, 3.0)
  .option('--crop-padding <number>', 'Crop padding in pixels (0-100)', parseFloat, 25)
  .option('--canvas-padding-left <number>', 'Left padding (0-100)', parseFloat, 10)
  .option('--canvas-padding-right <number>', 'Right padding (0-100)', parseFloat, 10)
  .option('--canvas-padding-y <number>', 'Top/bottom padding (0-100)', parseFloat, 10)
  .option('--merge-overlap <number>', 'Fragment merge overlap (0-100)', parseFloat, 20)
  .action(async (pdfPath, options) => {
    try {
      // If output is the default value, generate output path based on PDF path
      if (options.output === 'output.zip') {
        const pdfDir = path.dirname(pdfPath);
        const pdfBaseName = path.basename(pdfPath, path.extname(pdfPath));
        options.output = path.join(pdfDir, `${pdfBaseName}.zip`);
      }
      await processPdf(pdfPath, options);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
