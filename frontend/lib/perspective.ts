export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface QuadDetectionResult {
  quad: Quad;
  needsWarp: boolean;
  maxSkewAngle: number;
  widthRatio: number;
  heightRatio: number;
}

export interface HomographyCoefficients {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Validates whether 4 points form a strictly convex quadrilateral with sufficient area.
 */
export function isValidConvexQuad(quad: Quad, imgWidth: number, imgHeight: number): boolean {
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];

  // 1. Cross product check for convexity
  let sign: number | null = null;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const p3 = pts[(i + 2) % 4];
    const cp = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
    if (Math.abs(cp) < 1e-4) return false;
    const currentSign = cp > 0 ? 1 : -1;
    if (sign === null) {
      sign = currentSign;
    } else if (sign !== currentSign) {
      return false; // Non-convex or self-intersecting
    }
  }

  // 2. Minimum area check (at least 15% of total image canvas)
  const area =
    0.5 *
    Math.abs(
      pts[0].x * pts[1].y +
        pts[1].x * pts[2].y +
        pts[2].x * pts[3].y +
        pts[3].x * pts[0].y -
        (pts[0].y * pts[1].x +
          pts[1].y * pts[2].x +
          pts[2].y * pts[3].x +
          pts[3].y * pts[0].x)
    );
  const minArea = imgWidth * imgHeight * 0.15;
  return area >= minArea;
}

/**
 * Computes closed-form projective transformation coefficients mapping
 * normalized destination coordinates (u, v) in [0, 1]^2 to source coordinates.
 */
export function computeHomography(
  quad: Quad
): HomographyCoefficients | null {
  const x0 = quad.tl.x;
  const y0 = quad.tl.y;
  const x1 = quad.tr.x;
  const y1 = quad.tr.y;
  const x2 = quad.br.x;
  const y2 = quad.br.y;
  const x3 = quad.bl.x;
  const y3 = quad.bl.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  if (Math.abs(sx) < 1e-4 && Math.abs(sy) < 1e-4) {
    // Pure affine parallelogram
    return {
      a: x1 - x0,
      b: x3 - x0,
      c: x0,
      d: y1 - y0,
      e: y3 - y0,
      f: y0,
      g: 0,
      h: 0,
    };
  }

  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-7) {
    return null;
  }

  const g = (sx * dy2 - sy * dx2) / det;
  const h = (dx1 * sy - dy1 * sx) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  return { a, b, c, d, e, f, g, h };
}

/**
 * Lightweight JS document-edge and packaging contour detector.
 * Downscales canvas to a fast thumbnail, computes Sobel edge gradients,
 * and extracts bounding quadrilateral corners.
 */
export function detectDocumentQuad(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): QuadDetectionResult | null {
  if (width < 30 || height < 30) return null;

  const thumbW = Math.min(360, width);
  const thumbH = Math.max(30, Math.round((height / width) * thumbW));

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
  if (!thumbCtx) return null;

  thumbCtx.drawImage(ctx.canvas, 0, 0, thumbW, thumbH);
  const imgData = thumbCtx.getImageData(0, 0, thumbW, thumbH);
  const data = imgData.data;

  // 1. Grayscale luminance
  const gray = new Float32Array(thumbW * thumbH);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  // 2. Sobel edge gradient magnitude
  const grad = new Float32Array(thumbW * thumbH);
  let maxGrad = 0;
  for (let y = 1; y < thumbH - 1; y++) {
    const rowIdx = y * thumbW;
    for (let x = 1; x < thumbW - 1; x++) {
      const idx = rowIdx + x;
      const gx =
        -gray[idx - thumbW - 1] +
        gray[idx - thumbW + 1] -
        2 * gray[idx - 1] +
        2 * gray[idx + 1] -
        gray[idx + thumbW - 1] +
        gray[idx + thumbW + 1];
      const gy =
        -gray[idx - thumbW - 1] -
        2 * gray[idx - thumbW] -
        gray[idx - thumbW + 1] +
        gray[idx + thumbW - 1] +
        2 * gray[idx + thumbW] +
        gray[idx + thumbW + 1];
      const g = Math.abs(gx) + Math.abs(gy);
      grad[idx] = g;
      if (g > maxGrad) maxGrad = g;
    }
  }

  if (maxGrad < 15) return null;

  // 3. Threshold edge pixels (top 15% strongest edges)
  const hist = new Uint32Array(256);
  for (let i = 0; i < grad.length; i++) {
    const b = Math.min(255, Math.round((grad[i] / maxGrad) * 255));
    hist[b]++;
  }
  const targetCount = thumbW * thumbH * 0.15;
  let cum = 0;
  let threshVal = 40;
  for (let b = 255; b >= 0; b--) {
    cum += hist[b];
    if (cum >= targetCount) {
      threshVal = (b / 255) * maxGrad;
      break;
    }
  }

  const edgePoints: Point[] = [];
  for (let y = 2; y < thumbH - 2; y++) {
    const rowIdx = y * thumbW;
    for (let x = 2; x < thumbW - 2; x++) {
      if (grad[rowIdx + x] >= threshVal) {
        edgePoints.push({ x, y });
      }
    }
  }

  if (edgePoints.length < 50) return null;

  // 4. Find extreme corners:
  // TL: min(x + y), TR: max(x - y), BR: max(x + y), BL: min(x - y)
  let tl = edgePoints[0];
  let tr = edgePoints[0];
  let br = edgePoints[0];
  let bl = edgePoints[0];
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (const p of edgePoints) {
    const sum = p.x + p.y;
    const diff = p.x - p.y;
    if (sum < minSum) {
      minSum = sum;
      tl = p;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = p;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = p;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = p;
    }
  }

  const scaleX = width / thumbW;
  const scaleY = height / thumbH;
  const quad: Quad = {
    tl: { x: Math.round(tl.x * scaleX), y: Math.round(tl.y * scaleY) },
    tr: { x: Math.round(tr.x * scaleX), y: Math.round(tr.y * scaleY) },
    br: { x: Math.round(br.x * scaleX), y: Math.round(br.y * scaleY) },
    bl: { x: Math.round(bl.x * scaleX), y: Math.round(bl.y * scaleY) },
  };

  if (!isValidConvexQuad(quad, width, height)) {
    return null;
  }

  const topAngle =
    Math.atan2(quad.tr.y - quad.tl.y, quad.tr.x - quad.tl.x) * (180 / Math.PI);
  const botAngle =
    Math.atan2(quad.br.y - quad.bl.y, quad.br.x - quad.bl.x) * (180 / Math.PI);
  const maxSkewAngle = Math.max(Math.abs(topAngle), Math.abs(botAngle));

  const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
  const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
  const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
  const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);

  const maxW = Math.max(topW, botW);
  const maxH = Math.max(leftH, rightH);
  const widthRatio = maxW > 0 ? Math.abs(topW - botW) / maxW : 0;
  const heightRatio = maxH > 0 ? Math.abs(leftH - rightH) / maxH : 0;

  // Warp needed if significant angular skew (> 2.5 degrees) OR strong perspective trapezoid distortion (> 18%)
  const needsWarp =
    maxSkewAngle > 2.5 ||
    (maxSkewAngle > 1.5 && (widthRatio > 0.08 || heightRatio > 0.08)) ||
    widthRatio > 0.18 ||
    heightRatio > 0.18;

  return {
    quad,
    needsWarp,
    maxSkewAngle,
    widthRatio,
    heightRatio,
  };
}

export interface WarpPerspectiveResult {
  canvas: HTMLCanvasElement;
  targetWidth: number;
  targetHeight: number;
  mapBboxToOriginal: (bbox: [number, number, number, number]) => [number, number, number, number];
}

/**
 * Applies perspective warp to rectify an angled document quadrilateral to a flat rectangle.
 * Uses bilinear interpolation for high fidelity and provides coordinate back-mapping.
 */
export function warpPerspective(
  srcCtx: CanvasRenderingContext2D,
  origW: number,
  origH: number,
  quad: Quad,
  maxDimension = 1600
): WarpPerspectiveResult | null {
  const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
  const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
  const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
  const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);

  const targetW = Math.round(Math.max(topW, botW));
  const targetH = Math.round(Math.max(leftH, rightH));

  if (targetW < 50 || targetH < 30) return null;

  const homography = computeHomography(quad);
  if (!homography) return null;

  const { a, b, c, d, e, f, g, h } = homography;

  let scaleWarp = Math.min(1, maxDimension / Math.max(targetW, targetH));
  if (targetH < 500) {
    scaleWarp = Math.min(4, Math.max(scaleWarp, Math.ceil(600 / targetH)));
  }
  const outW = Math.round(targetW * scaleWarp);
  const outH = Math.round(targetH * scaleWarp);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return null;

  const srcImageData = srcCtx.getImageData(0, 0, origW, origH);
  const sData = srcImageData.data;

  const outImageData = outCtx.createImageData(outW, outH);
  const oData = outImageData.data;

  for (let y = 0; y < outH; y++) {
    const v = y / outH;
    const yRow = y * outW;
    for (let x = 0; x < outW; x++) {
      const u = x / outW;
      const denom = g * u + h * v + 1;
      const xs = (a * u + b * v + c) / denom;
      const ys = (d * u + e * v + f) / denom;

      if (xs >= 0 && xs < origW - 1 && ys >= 0 && ys < origH - 1) {
        const x0 = Math.floor(xs);
        const x1 = x0 + 1;
        const y0 = Math.floor(ys);
        const y1 = y0 + 1;
        const wx1 = xs - x0;
        const wx0 = 1 - wx1;
        const wy1 = ys - y0;
        const wy0 = 1 - wy1;

        const idx00 = (y0 * origW + x0) * 4;
        const idx10 = (y0 * origW + x1) * 4;
        const idx01 = (y1 * origW + x0) * 4;
        const idx11 = (y1 * origW + x1) * 4;

        const outIdx = (yRow + x) * 4;
        oData[outIdx] = Math.round(
          (sData[idx00] * wx0 + sData[idx10] * wx1) * wy0 +
            (sData[idx01] * wx0 + sData[idx11] * wx1) * wy1
        );
        oData[outIdx + 1] = Math.round(
          (sData[idx00 + 1] * wx0 + sData[idx10 + 1] * wx1) * wy0 +
            (sData[idx01 + 1] * wx0 + sData[idx11 + 1] * wx1) * wy1
        );
        oData[outIdx + 2] = Math.round(
          (sData[idx00 + 2] * wx0 + sData[idx10 + 2] * wx1) * wy0 +
            (sData[idx01 + 2] * wx0 + sData[idx11 + 2] * wx1) * wy1
        );
        oData[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outImageData, 0, 0);

  const mapPointToOriginal = (p: Point): Point => {
    const u = p.x / outW;
    const v = p.y / outH;
    const denom = g * u + h * v + 1;
    return {
      x: (a * u + b * v + c) / denom,
      y: (d * u + e * v + f) / denom,
    };
  };

  const mapBboxToOriginal = (
    bbox: [number, number, number, number]
  ): [number, number, number, number] => {
    const [bx, by, bw, bh] = bbox;
    const p1 = mapPointToOriginal({ x: bx, y: by });
    const p2 = mapPointToOriginal({ x: bx + bw, y: by });
    const p3 = mapPointToOriginal({ x: bx + bw, y: by + bh });
    const p4 = mapPointToOriginal({ x: bx, y: by + bh });

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

    return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
  };

  return {
    canvas: outCanvas,
    targetWidth: outW,
    targetHeight: outH,
    mapBboxToOriginal,
  };
}

/**
 * Applies Otsu global binarization to maximize foreground text separation on packaging.
 */
export function applyOtsuBinarization(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const total = width * height;
  if (total < 10) return;

  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[lum]++;
  }

  let sumAll = 0;
  for (let i = 0; i < 256; i++) {
    sumAll += i * hist[i];
  }

  let wB = 0;
  let sumB = 0;
  let maxVariance = 0;
  let otsuThresh = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;

    const betweenVariance = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      otsuThresh = t;
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const val = lum > otsuThresh ? 255 : 0;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }

  ctx.putImageData(imgData, 0, 0);
}
