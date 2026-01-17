/**
 * Math Exam PDF Question Splitter - Core Processing Module
 *
 * This module exports the main PDF processing function.
 * For CLI usage, see cli.js
 */

import { createCanvas, loadImage, Image } from 'canvas';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
// Import shared utilities and AI config
import { getTrimmedBounds, isContained, trimWhitespace } from './canvas-utils.js';
import { PROMPTS, SCHEMAS } from './ai-config.js';
import { createLogger } from './logger.js';

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



// Delay utility
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gemini API proxy configuration
const GEMINI_PROXY_URL = 'https://gproxy.xnscu.com/v1beta/models/gemini-3-flash-preview:generateContent?key='+process.env.GEMINI_API_KEY;

/**
 * Call Gemini API via proxy (no API key required)
 */
async function callGeminiAPI(imageBase64, prompt, schema) {
  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization':'Bearer '+process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: schema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid API response format');
  }

  const textPart = data.candidates[0].content.parts.find(p => p.text);
  if (!textPart) {
    throw new Error('No text content in API response');
  }

  return JSON.parse(textPart.text);
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
 * Detect questions on a page using Gemini API proxy
 */
async function detectQuestionsOnPage(image, pageNumber, logger, maxRetries = 5) {
  let attempt = 0;
  const imageBase64 = image.split(',')[1]; // Remove data:image/jpeg;base64, prefix

  while (attempt < maxRetries) {
    const startTime = Date.now();
    try {
      const result = await callGeminiAPI(imageBase64, PROMPTS.BASIC, {
        type: 'ARRAY',
        items: SCHEMAS.BASIC
      });

      if (!Array.isArray(result)) {
        throw new Error("Invalid response format: Expected Array");
      }

      const duration = Date.now() - startTime;
      // Log success
      if (logger) {
        await logger.logSuccess(pageNumber, result.length, duration, attempt + 1);
      }

      return result;
    } catch (error) {
      attempt++;
      const duration = Date.now() - startTime;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      const waitTime = isRateLimit ? Math.pow(2, attempt) * 1000 : 2000;

      // Log failure
      if (logger) {
        await logger.logFailure(pageNumber, error, duration, attempt);
      }

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
 * Before merging, trims all whitespace from both images to avoid double spacing.
 */
async function mergeBase64Images(topBase64, bottomBase64, gap = 0) {
  const [imgTop, imgBottom] = await Promise.all([
    loadImage(topBase64),
    loadImage(bottomBase64)
  ]);

  // Trim whitespace from both images using existing trimWhitespace function
  const topCanvas = createCanvas(imgTop.width, imgTop.height);
  const topCtx = topCanvas.getContext('2d');
  topCtx.drawImage(imgTop, 0, 0);
  const topBounds = trimWhitespace(topCtx, imgTop.width, imgTop.height);

  const bottomCanvas = createCanvas(imgBottom.width, imgBottom.height);
  const bottomCtx = bottomCanvas.getContext('2d');
  bottomCtx.drawImage(imgBottom, 0, 0);
  const bottomBounds = trimWhitespace(bottomCtx, imgBottom.width, imgBottom.height);

  // Calculate final dimensions using trimmed bounds
  const width = Math.max(topBounds.w, bottomBounds.w);
  const height = Math.max(0, topBounds.h + bottomBounds.h + gap);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Draw trimmed top image (left-aligned)
  ctx.drawImage(
    topCanvas,
    topBounds.x, topBounds.y, topBounds.w, topBounds.h,
    0, 0, topBounds.w, topBounds.h
  );

  // Draw trimmed bottom image starting after the top image plus the gap (left-aligned)
  ctx.drawImage(
    bottomCanvas,
    bottomBounds.x, bottomBounds.y, bottomBounds.w, bottomBounds.h,
    0, topBounds.h + gap, bottomBounds.w, bottomBounds.h
  );

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/**
 * Trim whitespace from image and add uniform padding
 * @param {string} imageBase64 - Base64 encoded image
 * @param {number} padding - Padding to add after trimming
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
async function trimAndPadImage(imageBase64, padding = 10) {
  const img = await loadImage(imageBase64);

  // Create temporary canvas to analyze the image
  const tempCanvas = createCanvas(img.width, img.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);

  // Find content bounds by trimming whitespace
  const bounds = trimWhitespace(tempCtx, img.width, img.height);

  // If no content found, return original
  if (bounds.w === 0 || bounds.h === 0) {
    return {
      dataUrl: imageBase64,
      width: img.width,
      height: img.height
    };
  }

  // Create new canvas with trimmed content plus padding
  const newWidth = bounds.w + (padding * 2);
  const newHeight = bounds.h + (padding * 2);
  const newCanvas = createCanvas(newWidth, newHeight);
  const newCtx = newCanvas.getContext('2d');

  // Fill with white background
  newCtx.fillStyle = '#ffffff';
  newCtx.fillRect(0, 0, newWidth, newHeight);

  // Draw trimmed content with padding
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
 * Align all images to the same width by adding right padding
 * @param {Array<{id: string, dataUrl: string}>} questions - Array of question images
 * @param {number} targetWidth - Target width for all images
 * @returns {Promise<Array<{id: string, dataUrl: string}>>}
 */
async function alignImageWidths(questions, targetWidth) {
  const aligned = [];

  for (const question of questions) {
    const img = await loadImage(question.dataUrl);

    // If already at target width, keep as is
    if (img.width === targetWidth) {
      aligned.push(question);
      continue;
    }

    // Create new canvas with target width
    const canvas = createCanvas(targetWidth, img.height);
    const ctx = canvas.getContext('2d');

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, img.height);

    // Draw original image (left-aligned)
    ctx.drawImage(img, 0, 0);

    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
    aligned.push({
      ...question,
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`
    });
  }

  return aligned;
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

  // Create logger for this PDF
  const logger = createLogger(pdfPath);

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
  console.log(`🤖 Using Gemini API proxy (no key required)`);

  // Process pages
  let allQuestions = [];
  const debugData = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    console.log(`\n📄 Processing page ${pageNum}/${totalPages}...`);

    try {
      // Render page
      const page = await pdf.getPage(pageNum);
      const { dataUrl, width, height } = await renderPageToImage(page, options.scale);

      // Detect questions
      console.log('  🔍 Detecting questions with AI...');
      const detections = await detectQuestionsOnPage(dataUrl, pageNum, logger);
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
        // boxes_2d is now a single array [ymin, xmin, ymax, xmax], wrap it in array for cropAndStitchImage
        const { final, original } = await cropAndStitchImage(
          dataUrl,
          [detection.boxes_2d],
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

  // Post-process images: trim, pad, and align widths
  if (allQuestions.length > 0 && options.enableAlignment) {
    console.log('\n🔧 Post-processing images...');

    // Step 1: Trim whitespace and add uniform padding
    console.log(`  ✂️  Trimming whitespace and adding ${options.finalPadding}px padding...`);
    for (let i = 0; i < allQuestions.length; i++) {
      const q = allQuestions[i];
      const result = await trimAndPadImage(q.dataUrl, options.finalPadding);
      q.dataUrl = result.dataUrl;
      q.processedWidth = result.width;
      q.processedHeight = result.height;

      // Also process originalDataUrl if exists
      if (q.originalDataUrl) {
        const originalResult = await trimAndPadImage(q.originalDataUrl, options.finalPadding);
        q.originalDataUrl = originalResult.dataUrl;
      }
    }

    // Step 2: Find maximum width
    const maxWidth = Math.max(...allQuestions.map(q => q.processedWidth));
    console.log(`  📏 Maximum width: ${maxWidth}px`);

    // Step 3: Align all images to max width
    console.log('  ↔️  Aligning widths...');
    allQuestions = await alignImageWidths(allQuestions, maxWidth);

    console.log('  ✅ Post-processing complete');
  }

  // Create ZIP
  console.log('📦 Creating ZIP archive...');
  const zip = new JSZip();

  // Add metadata (remove dataUrl to reduce file size)
  const debugDataWithoutImages = debugData.map(page => ({
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    detections: page.detections
  }));
  zip.file('analysis_data.json', JSON.stringify(debugDataWithoutImages, null, 2));

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

// Default options
export const DEFAULT_OPTIONS = {
  output: 'output.zip',
  scale: 3.0,
  cropPadding: 25,
  canvasPaddingLeft: 0,
  canvasPaddingRight: 0,
  canvasPaddingY: 0,
  mergeOverlap: 0,
  enableAlignment: true,  // Enable post-processing alignment
  finalPadding: 10        // Padding to add after trimming whitespace
};

// Export the main processing function
export { processPdf };