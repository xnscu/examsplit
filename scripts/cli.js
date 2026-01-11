#!/usr/bin/env node

/**
 * Math Exam PDF Question Splitter - CLI Entry Point
 *
 * Usage:
 *   node scripts/cli.js <pdf-path> [options]
 *
 * Example:
 *   node scripts/cli.js exam.pdf -o output.zip --crop-padding 25
 */

import path from 'path';
import { program } from 'commander';
import { processPdf, DEFAULT_OPTIONS } from './split.js';

// CLI setup
program
  .name('split-pdf')
  .description('Extract individual questions from math exam PDFs using AI')
  .argument('<pdf-path>', 'Path to the PDF file')
  .option('-o, --output <path>', 'Output ZIP file path', DEFAULT_OPTIONS.output)
  .option('--scale <number>', 'PDF rendering scale', parseFloat, DEFAULT_OPTIONS.scale)
  .option('--crop-padding <number>', 'Crop padding in pixels (0-100)', parseFloat, DEFAULT_OPTIONS.cropPadding)
  .option('--canvas-padding-left <number>', 'Left padding (0-100)', parseFloat, DEFAULT_OPTIONS.canvasPaddingLeft)
  .option('--canvas-padding-right <number>', 'Right padding (0-100)', parseFloat, DEFAULT_OPTIONS.canvasPaddingRight)
  .option('--canvas-padding-y <number>', 'Top/bottom padding (0-100)', parseFloat, DEFAULT_OPTIONS.canvasPaddingY)
  .option('--merge-overlap <number>', 'Fragment merge overlap (0-100)', parseFloat, DEFAULT_OPTIONS.mergeOverlap)
  .action(async (pdfPath, options) => {
    try {
      // If output is the default value, generate output path based on PDF path
      if (options.output === DEFAULT_OPTIONS.output) {
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

