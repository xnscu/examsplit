#!/usr/bin/env node

/**
 * Test script for image alignment feature
 *
 * This script demonstrates the new alignment features:
 * 1. Auto-trim whitespace from all sides
 * 2. Add uniform padding
 * 3. Align all images to same width
 *
 * Usage:
 *   node test-alignment.js <pdf-path>
 */

import { processPdf, DEFAULT_OPTIONS } from './scripts/split.js';
import path from 'path';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node test-alignment.js <pdf-path>');
  process.exit(1);
}

const baseName = path.basename(pdfPath, '.pdf');
const outputPath = path.join('output2', `${baseName}_aligned.zip`);

console.log('🧪 Testing image alignment feature...\n');
console.log('Configuration:');
console.log(`  - Enable alignment: ${DEFAULT_OPTIONS.enableAlignment}`);
console.log(`  - Final padding: ${DEFAULT_OPTIONS.finalPadding}px`);
console.log(`  - Input: ${pdfPath}`);
console.log(`  - Output: ${outputPath}\n`);

const options = {
  ...DEFAULT_OPTIONS,
  output: outputPath,
  enableAlignment: true,
  finalPadding: 10
};

try {
  await processPdf(pdfPath, options);
  console.log('\n✅ Test completed successfully!');
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}

