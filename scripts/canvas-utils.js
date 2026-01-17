

/**
 * Shared Canvas Logic for "Edge Peel" algorithm.
 * Works in both Browser (DOM Canvas) and Node.js (node-canvas).
 */

/**
 * Intelligent "Edge Peel" Trimming.
 * Peels off artifacts (like black lines) from the edges until clean whitespace is found.
 *
 * @param {any} ctx
 * @param {number} width
 * @param {number} height
 * @param {function(string): void} [onStatus]
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export const getTrimmedBounds = (ctx, width, height, onStatus = null) => {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: 0, h: 0 };

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const threshold = 200;

  const rowHasInk = (y) => {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0 && (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold)) {
        return true;
      }
    }
    return false;
  };

  const colHasInk = (x) => {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 0 && (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold)) {
        return true;
      }
    }
    return false;
  };

  const SAFETY_Y = Math.floor(h * 0.3);
  const SAFETY_X = Math.floor(w * 0.3);

  let top = 0;
  let bottom = h;
  let left = 0;
  let right = w;

  if (onStatus) onStatus("Peeling Top...");
  while (top < SAFETY_Y && rowHasInk(top)) { top++; }

  if (onStatus) onStatus("Peeling Bottom...");
  while (bottom > h - SAFETY_Y && bottom > top && rowHasInk(bottom - 1)) { bottom--; }

  if (onStatus) onStatus("Peeling Left...");
  while (left < SAFETY_X && colHasInk(left)) { left++; }

  if (onStatus) onStatus("Peeling Right...");
  while (right > w - SAFETY_X && right > left && colHasInk(right - 1)) { right--; }

  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top)
  };
};

/**
 * Checks if box A is contained within or equal to box B.
 * Box format: [ymin, xmin, ymax, xmax] (0-1000)
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {boolean}
 */
export const isContained = (a, b) => {
  const [yminA, xminA, ymaxA, xmaxA] = a;
  const [yminB, xminB, ymaxB, xmaxB] = b;
  const tolerance = 5;

  return (
    xminA >= xminB - tolerance &&
    xmaxA <= xmaxB + tolerance &&
    yminA >= yminB - tolerance &&
    ymaxA <= ymaxB + tolerance
  );
};

/**
 * Trim whitespace from all sides of an image until non-white pixels are found.
 * Returns the bounding box of the content.
 *
 * @param {any} ctx - Canvas 2D context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export const trimWhitespace = (ctx, width, height) => {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: 0, h: 0 };

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const threshold = 250; // Consider pixels with RGB > 250 as white

  const isWhitePixel = (x, y) => {
    const i = (y * w + x) * 4;
    return data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold;
  };

  const rowIsAllWhite = (y) => {
    for (let x = 0; x < w; x++) {
      if (!isWhitePixel(x, y)) return false;
    }
    return true;
  };

  const colIsAllWhite = (x) => {
    for (let y = 0; y < h; y++) {
      if (!isWhitePixel(x, y)) return false;
    }
    return true;
  };

  // Find content bounds
  let top = 0;
  let bottom = h;
  let left = 0;
  let right = w;

  // Trim from top
  while (top < h && rowIsAllWhite(top)) {
    top++;
  }

  // Trim from bottom
  while (bottom > top && rowIsAllWhite(bottom - 1)) {
    bottom--;
  }

  // Trim from left
  while (left < w && colIsAllWhite(left)) {
    left++;
  }

  // Trim from right
  while (right > left && colIsAllWhite(right - 1)) {
    right--;
  }

  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top)
  };
};
