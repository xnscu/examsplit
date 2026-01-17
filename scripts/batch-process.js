#!/usr/bin/env node

/**
 * Batch PDF Processor
 *
 * Concurrently processes all PDF files in the exams folder
 * with automatic retry on failure and resume support.
 *
 * Usage:
 *   node scripts/batch-process.js [options]
 *
 * Options:
 *   -c, --concurrency <number>  Concurrent processing limit (default: 5)
 *   -r, --retries <number>      Max retries on failure (default: 3)
 *   -i, --input <path>          Input folder path (default: exams)
 *   -o, --output <path>         Output folder path (default: output)
 *   --force                     Reprocess existing files
 */

import fs from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import { processPdf, DEFAULT_OPTIONS } from './split.js';

// Progress state file
const STATE_FILE = '.batch-state.json';

/**
 * Get all PDF files from a directory
 */
async function getPdfFiles(inputDir) {
  try {
    const files = await fs.readdir(inputDir);
    return files
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(inputDir, f));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Input directory not found: ${inputDir}`);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Check if a PDF has already been processed
 */
async function isProcessed(pdfPath, outputDir) {
  const baseName = path.basename(pdfPath, '.pdf');
  const zipPath = path.join(outputDir, `${baseName}.zip`);
  try {
    await fs.access(zipPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load processing state from file
 */
async function loadState() {
  try {
    const content = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { failed: {}, completed: [] };
  }
}

/**
 * Save processing state to file
 */
async function saveState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Process a single PDF with retry logic
 */
async function processWithRetry(pdfPath, outputDir, maxRetries, state) {
  const baseName = path.basename(pdfPath, '.pdf');
  const outputPath = path.join(outputDir, `${baseName}.zip`);

  const options = {
    ...DEFAULT_OPTIONS,
    output: outputPath
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📄 [${baseName}] Attempt ${attempt}/${maxRetries}...`);
      await processPdf(pdfPath, options);

      // Mark as completed
      state.completed.push(pdfPath);
      delete state.failed[pdfPath];
      await saveState(state);

      return { success: true, pdfPath };
    } catch (error) {
      lastError = error;
      console.error(`❌ [${baseName}] Attempt ${attempt} failed: ${error.message}`);

      // Update failed state
      state.failed[pdfPath] = {
        attempts: attempt,
        lastError: error.message,
        lastAttempt: new Date().toISOString()
      };
      await saveState(state);

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [${baseName}] Waiting ${waitTime / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }

  return { success: false, pdfPath, error: lastError };
}

/**
 * Process PDFs with concurrency limit
 */
async function processBatch(pdfFiles, outputDir, concurrency, maxRetries, state) {
  const results = { success: [], failed: [] };
  let activeCount = 0;
  let index = 0;
  const total = pdfFiles.length;

  return new Promise((resolve) => {
    const processNext = async () => {
      if (index >= total && activeCount === 0) {
        resolve(results);
        return;
      }

      while (activeCount < concurrency && index < total) {
        const pdfPath = pdfFiles[index];
        index++;
        activeCount++;

        const currentIndex = index;
        console.log(`\n🚀 Starting [${currentIndex}/${total}]: ${path.basename(pdfPath)}`);

        processWithRetry(pdfPath, outputDir, maxRetries, state)
          .then((result) => {
            if (result.success) {
              results.success.push(result.pdfPath);
              console.log(`✅ Completed [${currentIndex}/${total}]: ${path.basename(result.pdfPath)}`);
            } else {
              results.failed.push({ path: result.pdfPath, error: result.error?.message });
              console.error(`❌ Failed [${currentIndex}/${total}]: ${path.basename(result.pdfPath)}`);
            }
          })
          .finally(() => {
            activeCount--;
            processNext();
          });
      }
    };

    processNext();
  });
}

/**
 * Main function
 */
async function main(options) {
  const inputDir = path.resolve(options.input);
  const outputDir = path.resolve(options.output);

  console.log('🔧 Batch PDF Processor');
  console.log(`📁 Input:  ${inputDir}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`🔄 Concurrency: ${options.concurrency}`);
  console.log(`🔁 Max retries: ${options.retries}`);

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Handle interruption
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) {
      console.log('\n⚡ Force exit...');
      process.exit(1);
    }
    interrupted = true;
    console.log('\n\n⏸️ Gracefully stopping... (press Ctrl+C again to force exit)');
    console.log('💾 Current progress has been saved. Run again to resume.');
  });

  // Auto-retry loop
  let roundNumber = 1;
  let previousFailedCount = -1;
  const maxRounds = 10; // 防止无限循环
  const totalStartTime = Date.now();
  let allSuccessful = [];

  while (roundNumber <= maxRounds && !interrupted) {
    console.log('\n' + '='.repeat(50));
    console.log(`🔄 Round ${roundNumber}`);
    console.log('='.repeat(50));

    // Get all PDF files
    const allPdfFiles = await getPdfFiles(inputDir);
    console.log(`\n📊 Found ${allPdfFiles.length} PDF files in total`);

    if (allPdfFiles.length === 0) {
      console.log('⚠️ No PDF files found. Exiting.');
      return;
    }

    // Load state for resume support
    const state = await loadState();

    // Filter out already processed files (unless --force)
    let pdfFiles = allPdfFiles;
    if (!options.force) {
      const pendingFiles = [];
      for (const pdfPath of allPdfFiles) {
        const processed = await isProcessed(pdfPath, outputDir);
        if (!processed) {
          pendingFiles.push(pdfPath);
        } else if (roundNumber === 1) {
          console.log(`⏭️ Skipping (already exists): ${path.basename(pdfPath)}`);
        }
      }
      pdfFiles = pendingFiles;
    }

    console.log(`\n📋 Files to process: ${pdfFiles.length}`);

    if (pdfFiles.length === 0) {
      console.log('✨ All files already processed!');
      break;
    }

    // Start processing
    console.log('\n🚀 Starting batch processing...\n');
    const roundStartTime = Date.now();

    const results = await processBatch(
      pdfFiles,
      outputDir,
      options.concurrency,
      options.retries,
      state
    );

    const duration = ((Date.now() - roundStartTime) / 1000 / 60).toFixed(2);

    // Keep track of all successful files
    allSuccessful.push(...results.success);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Round ${roundNumber} Summary`);
    console.log('='.repeat(50));
    console.log(`⏱️ Round time: ${duration} minutes`);
    console.log(`✅ Successful: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);

    if (results.failed.length > 0) {
      console.log('\n❌ Failed files:');
      for (const item of results.failed) {
        console.log(`   - ${path.basename(item.path)}: ${item.error}`);
      }

      // Check if we're stuck (same number of failures as previous round)
      if (results.failed.length === previousFailedCount) {
        console.log('\n⚠️ No progress made. Same files keep failing.');
        console.log('💡 These files may have persistent issues. Stopping auto-retry.');
        break;
      }

      previousFailedCount = results.failed.length;

      // Check if interrupted
      if (interrupted) {
        console.log('\n⏸️ Process interrupted. Stopping auto-retry.');
        break;
      }

      // Continue to next round
      console.log(`\n🔄 ${results.failed.length} files failed. Starting next round...\n`);
      roundNumber++;

      // Add a small delay before next round
      await new Promise(r => setTimeout(r, 2000));
    } else {
      // All successful!
      console.log('\n🎉 All files processed successfully!');

      // Clean up state file
      try {
        await fs.unlink(STATE_FILE);
      } catch {
        // Ignore if file doesn't exist
      }
      break;
    }

    // Safety check for max rounds
    if (roundNumber > maxRounds) {
      console.log(`\n⚠️ Reached maximum rounds (${maxRounds}). Stopping.`);
      break;
    }
  }

  // Final summary
  const totalDuration = ((Date.now() - totalStartTime) / 1000 / 60).toFixed(2);
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Final Summary');
  console.log('='.repeat(50));
  console.log(`⏱️ Total time: ${totalDuration} minutes`);
  console.log(`🔄 Total rounds: ${roundNumber}`);
  console.log(`✅ Total successful: ${allSuccessful.length}`);
}

// CLI setup
program
  .name('batch-process')
  .description('Batch process PDF files with concurrency and retry support')
  .option('-c, --concurrency <number>', 'Concurrent processing limit', (val) => parseInt(val, 10), 5)
  .option('-r, --retries <number>', 'Max retries on failure', (val) => parseInt(val, 10), 3)
  .option('-i, --input <path>', 'Input folder path', 'test')
  .option('-o, --output <path>', 'Output folder path', 'test-output')
  .option('--force', 'Reprocess existing files', false)
  .action(async (options) => {
    try {
      await main(options);
    } catch (error) {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    }
  });

program.parse();

