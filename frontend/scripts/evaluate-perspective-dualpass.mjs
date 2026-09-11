import { createWorker } from 'tesseract.js';
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LABELS_DIR = path.resolve('real_test_labels');
const OUTPUT_FILE = path.resolve('real_test_labels', 'perspective_dualpass_evaluation.json');

const TEST_IMAGES = [
  { file: 'good_day_1.jpg', desc: 'Britannia Good Day (severe perspective roll -8.8°)' },
  { file: 'good_day_2.jpg', desc: 'Britannia Good Day (flat strip)' },
  { file: 'balaji_1.jpg', desc: 'Balaji Wafers back panel' },
  { file: 'bourbon_1.jpg', desc: 'Britannia Bourbon (perspective angle)' },
  { file: 'bourbon_2.jpg', desc: 'Britannia Bourbon (foil wrapper, glare & angle)' },
  { file: 'lays_1.jpg', desc: 'Lays Spanish Tomato Tango' },
  { file: 'maggi_1.jpg', desc: 'Maggi 2-Minute Noodles' },
  { file: 'maggi_2.jpg', desc: 'Maggi side panel (angled)' },
  { file: 'parle_g_1.jpg', desc: 'Parle-G wrapper' },
  { file: 'tata_salt_1.jpg', desc: 'Tata Salt vacuum evaporated' },
];

function extractRegex(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] || match[0] : null;
}

function extractFieldsFromText(text) {
  const t = text.replace(/\s+/g, ' ');
  return {
    mrp: extractRegex(t, /(?:MRP|M\.R\.P|Rs\.?|₹)\s*[:.]?\s*(\d+(?:\.\d{1,2})?)/i),
    net_quantity: extractRegex(t, /(?:Net\s*(?:Qty|Quantity|Weight|Wt)|NET\s*WEIGHT)\s*[:.]?\s*(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|N|U)\b)/i),
    mfg_date: extractRegex(t, /(?:Mfg|Pkg|Packed|Mfd|Date of Mfg)\s*[:.]?\s*([A-Za-z0-9\/\.\-]+)/i),
    consumer_care: extractRegex(t, /([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+|1800\s*\d{3}\s*\d{3,4})/i),
    fssai: extractRegex(t, /(?:fssai|Lic\.?\s*No\.?)\s*[:.]?\s*(\d{14})/i),
  };
}

async function main() {
  console.log('================================================================');
  console.log('  OCR EVALUATION: Document-Edge Perspective Warp + Dual-Pass   ');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  console.log('Initializing Tesseract worker...');
  const worker = await createWorker('eng');

  const results = [];

  for (let i = 0; i < TEST_IMAGES.length; i++) {
    const item = TEST_IMAGES[i];
    const filePath = path.join(LABELS_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] Missing file: ${item.file}`);
      continue;
    }

    console.log(`\n[${i + 1}/${TEST_IMAGES.length}] Processing ${item.file} (${item.desc})...`);
    const imgBase64 = fs.readFileSync(filePath).toString('base64');
    const mime = item.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${imgBase64}`;

    // Run canvas preprocessing inside headless Chrome
    const prep = await page.evaluate(async (src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const origW = img.naturalWidth;
          const origH = img.naturalHeight;

          // Thumbnail for edge detection
          const thumbW = 360;
          const thumbH = Math.max(30, Math.round((origH / origW) * thumbW));
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = thumbW;
          thumbCanvas.height = thumbH;
          const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
          thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);

          const imgData = thumbCtx.getImageData(0, 0, thumbW, thumbH);
          const data = imgData.data;

          // Grayscale
          const gray = new Float32Array(thumbW * thumbH);
          for (let i = 0; i < gray.length; i++) {
            const idx = i * 4;
            gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          }

          // Sobel
          const grad = new Float32Array(thumbW * thumbH);
          let maxGrad = 0;
          for (let y = 1; y < thumbH - 1; y++) {
            for (let x = 1; x < thumbW - 1; x++) {
              const idx = y * thumbW + x;
              const gx =
                -gray[idx - thumbW - 1] + gray[idx - thumbW + 1] -
                2 * gray[idx - 1] + 2 * gray[idx + 1] -
                gray[idx + thumbW - 1] + gray[idx + thumbW + 1];
              const gy =
                -gray[idx - thumbW - 1] - 2 * gray[idx - thumbW] - gray[idx - thumbW + 1] +
                gray[idx + thumbW - 1] + 2 * gray[idx + thumbW] + gray[idx + thumbW + 1];
              const g = Math.abs(gx) + Math.abs(gy);
              grad[idx] = g;
              if (g > maxGrad) maxGrad = g;
            }
          }

          // Threshold edge points
          const hist = new Uint32Array(256);
          for (let i = 0; i < grad.length; i++) {
            const b = Math.min(255, Math.round((grad[i] / (maxGrad || 1)) * 255));
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

          const edgePoints = [];
          for (let y = 2; y < thumbH - 2; y++) {
            for (let x = 2; x < thumbW - 2; x++) {
              if (grad[y * thumbW + x] >= threshVal) {
                edgePoints.push({ x, y });
              }
            }
          }

          let tl = edgePoints[0] || { x: 0, y: 0 };
          let tr = edgePoints[0] || { x: thumbW, y: 0 };
          let br = edgePoints[0] || { x: thumbW, y: thumbH };
          let bl = edgePoints[0] || { x: 0, y: thumbH };
          let minSum = Infinity, maxSum = -Infinity;
          let minDiff = Infinity, maxDiff = -Infinity;

          for (const p of edgePoints) {
            const sum = p.x + p.y;
            const diff = p.x - p.y;
            if (sum < minSum) { minSum = sum; tl = p; }
            if (sum > maxSum) { maxSum = sum; br = p; }
            if (diff > maxDiff) { maxDiff = diff; tr = p; }
            if (diff < minDiff) { minDiff = diff; bl = p; }
          }

          const scaleX = origW / thumbW;
          const scaleY = origH / thumbH;
          const quad = {
            tl: { x: Math.round(tl.x * scaleX), y: Math.round(tl.y * scaleY) },
            tr: { x: Math.round(tr.x * scaleX), y: Math.round(tr.y * scaleY) },
            br: { x: Math.round(br.x * scaleX), y: Math.round(br.y * scaleY) },
            bl: { x: Math.round(bl.x * scaleX), y: Math.round(bl.y * scaleY) },
          };

          const topAngle = Math.atan2(quad.tr.y - quad.tl.y, quad.tr.x - quad.tl.x) * (180 / Math.PI);
          const botAngle = Math.atan2(quad.br.y - quad.bl.y, quad.br.x - quad.bl.x) * (180 / Math.PI);
          const maxSkew = Math.max(Math.abs(topAngle), Math.abs(botAngle));

          const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
          const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
          const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
          const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);
          const wRatio = Math.abs(topW - botW) / Math.max(topW, botW);
          const hRatio = Math.abs(leftH - rightH) / Math.max(leftH, rightH);

          const needsWarp = maxSkew > 2.5 || wRatio > 0.06 || hRatio > 0.06;

          // Target dimensions
          const targetW = Math.round(Math.max(topW, botW));
          const targetH = Math.round(Math.max(leftH, rightH));

          // Draw full original to source canvas
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = origW;
          srcCanvas.height = origH;
          const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
          srcCtx.drawImage(img, 0, 0);

          // 1. Baseline canvas (Unwarped + standard crop/scale + adaptive contrast)
          const baseScale = Math.min(1, 1600 / Math.max(origW, origH));
          const baseW = Math.round(origW * baseScale);
          const baseH = Math.round(origH * baseScale);
          const baseCanvas = document.createElement('canvas');
          baseCanvas.width = baseW;
          baseCanvas.height = baseH;
          const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
          baseCtx.drawImage(img, 0, 0, baseW, baseH);

          // Contrast stretch helper
          function stretchContrast(ctx, w, h) {
            const id = ctx.getImageData(0, 0, w, h);
            const d = id.data;
            const hst = new Uint32Array(256);
            let sc = 0;
            for (let i = 0; i < d.length; i += 16) {
              const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
              hst[l]++;
              sc++;
            }
            let c = 0, pLow = 0, pHigh = 255;
            for (let i = 0; i < 256; i++) {
              c += hst[i];
              if (c >= sc * 0.02 && pLow === 0) pLow = i;
              if (c >= sc * 0.98) { pHigh = i; break; }
            }
            const r = pHigh - pLow;
            if (r > 15 && r < 180) {
              const f = 255 / r;
              for (let i = 0; i < d.length; i += 4) {
                d[i] = Math.min(255, Math.max(0, (d[i] - pLow) * f));
                d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - pLow) * f));
                d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - pLow) * f));
              }
              ctx.putImageData(id, 0, 0);
            }
          }

          stretchContrast(baseCtx, baseW, baseH);
          const baselineDataUrl = baseCanvas.toDataURL('image/jpeg', 0.90);

          // 2. New Pipeline Warped / Pass 1 canvas
          let pass1Canvas;
          if (needsWarp) {
            const x0 = quad.tl.x, y0 = quad.tl.y;
            const x1 = quad.tr.x, y1 = quad.tr.y;
            const x2 = quad.br.x, y2 = quad.br.y;
            const x3 = quad.bl.x, y3 = quad.bl.y;
            const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
            const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
            const det = dx1 * dy2 - dx2 * dy1;
            const g = (sx * dy2 - sy * dx2) / det;
            const h = (dx1 * sy - dy1 * sx) / det;
            const a = x1 - x0 + g * x1;
            const b = x3 - x0 + h * x3;
            const c = x0;
            const d = y1 - y0 + g * y1;
            const e = y3 - y0 + h * y3;
            const f = y0;

            const scaleWarp = Math.min(1, 1600 / Math.max(targetW, targetH));
            const outW = Math.round(targetW * scaleWarp);
            const outH = Math.round(targetH * scaleWarp);
            pass1Canvas = document.createElement('canvas');
            pass1Canvas.width = outW;
            pass1Canvas.height = outH;
            const outCtx = pass1Canvas.getContext('2d', { willReadFrequently: true });
            const sData = srcCtx.getImageData(0, 0, origW, origH).data;
            const outImgData = outCtx.createImageData(outW, outH);
            const oData = outImgData.data;

            for (let y = 0; y < outH; y++) {
              const v = y / outH;
              const yRow = y * outW;
              for (let x = 0; x < outW; x++) {
                const u = x / outW;
                const denom = g * u + h * v + 1;
                const xs = (a * u + b * v + c) / denom;
                const ys = (d * u + e * v + f) / denom;
                if (xs >= 0 && xs < origW - 1 && ys >= 0 && ys < origH - 1) {
                  const x0_ = Math.floor(xs), x1_ = x0_ + 1;
                  const y0_ = Math.floor(ys), y1_ = y0_ + 1;
                  const wx1 = xs - x0_, wx0 = 1 - wx1;
                  const wy1 = ys - y0_, wy0 = 1 - wy1;
                  const i00 = (y0_ * origW + x0_) * 4;
                  const i10 = (y0_ * origW + x1_) * 4;
                  const i01 = (y1_ * origW + x0_) * 4;
                  const i11 = (y1_ * origW + x1_) * 4;
                  const oIdx = (yRow + x) * 4;
                  oData[oIdx] = Math.round((sData[i00] * wx0 + sData[i10] * wx1) * wy0 + (sData[i01] * wx0 + sData[i11] * wx1) * wy1);
                  oData[oIdx + 1] = Math.round((sData[i00 + 1] * wx0 + sData[i10 + 1] * wx1) * wy0 + (sData[i01 + 1] * wx0 + sData[i11 + 1] * wx1) * wy1);
                  oData[oIdx + 2] = Math.round((sData[i00 + 2] * wx0 + sData[i10 + 2] * wx1) * wy0 + (sData[i01 + 2] * wx0 + sData[i11 + 2] * wx1) * wy1);
                  oData[oIdx + 3] = 255;
                }
              }
            }
            outCtx.putImageData(outImgData, 0, 0);
          } else {
            pass1Canvas = baseCanvas;
          }

          const p1W = pass1Canvas.width;
          const p1H = pass1Canvas.height;
          const p1Ctx = pass1Canvas.getContext('2d', { willReadFrequently: true });
          stretchContrast(p1Ctx, p1W, p1H);
          const pass1DataUrl = pass1Canvas.toDataURL('image/jpeg', 0.90);

          // 3. New Pipeline Pass 2 (Otsu binarization)
          const pass2Canvas = document.createElement('canvas');
          pass2Canvas.width = p1W;
          pass2Canvas.height = p1H;
          const pass2Ctx = pass2Canvas.getContext('2d', { willReadFrequently: true });
          pass2Ctx.drawImage(pass1Canvas, 0, 0);
          const p2Data = pass2Ctx.getImageData(0, 0, p1W, p1H);
          const pd = p2Data.data;

          const bHist = new Uint32Array(256);
          for (let i = 0; i < pd.length; i += 4) {
            const l = Math.round(0.299 * pd[i] + 0.587 * pd[i + 1] + 0.114 * pd[i + 2]);
            bHist[l]++;
          }
          let sumAll = 0;
          for (let i = 0; i < 256; i++) sumAll += i * bHist[i];
          let wB = 0, sumB = 0, maxVar = 0, otsuT = 128;
          const totalPix = p1W * p1H;
          for (let t = 0; t < 256; t++) {
            wB += bHist[t];
            if (wB === 0) continue;
            const wF = totalPix - wB;
            if (wF === 0) break;
            sumB += t * bHist[t];
            const mB = sumB / wB;
            const mF = (sumAll - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxVar) { maxVar = between; otsuT = t; }
          }
          for (let i = 0; i < pd.length; i += 4) {
            const l = 0.299 * pd[i] + 0.587 * pd[i + 1] + 0.114 * pd[i + 2];
            const v = l > otsuT ? 255 : 0;
            pd[i] = v; pd[i + 1] = v; pd[i + 2] = v;
          }
          pass2Ctx.putImageData(p2Data, 0, 0);
          const pass2DataUrl = pass2Canvas.toDataURL('image/png');

          resolve({
            origW,
            origH,
            needsWarp,
            maxSkew: +maxSkew.toFixed(2),
            baselineDataUrl,
            pass1DataUrl,
            pass2DataUrl,
          });
        };
        img.src = src;
      });
    }, dataUrl);

    // Run Tesseract recognitions in Node
    // 1. Baseline
    const rBase = await worker.recognize(prep.baselineDataUrl);
    const baseWords = rBase.data.words ?? [];
    const baseConfs = baseWords.map((w) => w.confidence);
    const baseMeanConf = baseConfs.length ? baseConfs.reduce((a, b) => a + b, 0) / baseConfs.length : 0;
    const baseMedianConf = baseConfs.length ? baseConfs.sort((a, b) => a - b)[Math.floor(baseConfs.length / 2)] : 0;
    const baseFields = extractFieldsFromText(rBase.data.text);

    // 2. Pass 1 (Perspective warped + Adaptive Contrast)
    const rPass1 = await worker.recognize(prep.pass1DataUrl);
    const p1Words = rPass1.data.words ?? [];
    const p1Fields = extractFieldsFromText(rPass1.data.text);

    // 3. Pass 2 (Perspective warped + Otsu Binarization)
    const rPass2 = await worker.recognize(prep.pass2DataUrl);
    const p2Words = rPass2.data.words ?? [];
    const p2Fields = extractFieldsFromText(rPass2.data.text);

    // Dual-Pass Field Disagreement Resolution
    const allFieldNames = ['mrp', 'net_quantity', 'mfg_date', 'consumer_care', 'fssai'];
    const resolvedFields = {};
    const disagreements = [];

    for (const field of allFieldNames) {
      const v1 = p1Fields[field];
      const v2 = p2Fields[field];

      if (v1 === v2) {
        resolvedFields[field] = v1;
      } else {
        // Disagreement!
        let chosen = 1;
        if (!v1 && v2) chosen = 2;
        else if (v1 && !v2) chosen = 1;
        else chosen = 2; // For binarization, if both extracted differing values, prefer high contrast

        resolvedFields[field] = chosen === 2 ? v2 : v1;
        disagreements.push({
          field,
          pass1: v1,
          pass2: v2,
          chosen: chosen === 2 ? 'Pass 2 (Otsu)' : 'Pass 1 (Adaptive)',
          resolved: resolvedFields[field],
        });
      }
    }

    const winningWords = (p1Words.length >= p2Words.length) ? p1Words : p2Words;
    const winConfs = winningWords.map((w) => w.confidence);
    const newMeanConf = winConfs.length ? winConfs.reduce((a, b) => a + b, 0) / winConfs.length : 0;
    const newMedianConf = winConfs.length ? winConfs.sort((a, b) => a - b)[Math.floor(winConfs.length / 2)] : 0;

    console.log(`   Perspective: ${prep.needsWarp ? `WARPED (skew=${prep.maxSkew}°)` : 'Bypassed (Flat)'}`);
    console.log(`   Words: Baseline=${baseWords.length} -> New=${winningWords.length} (delta: ${winningWords.length - baseWords.length})`);
    console.log(`   Mean Conf: Baseline=${baseMeanConf.toFixed(1)}% -> New=${newMeanConf.toFixed(1)}%`);
    console.log(`   Disagreements resolved: ${disagreements.length}`);
    if (disagreements.length > 0) {
      disagreements.forEach((d) => console.log(`      * [${d.field}] P1="${d.pass1}" vs P2="${d.pass2}" -> Chose: ${d.chosen} ("${d.resolved}")`));
    }
    console.log(`   Fields extracted: ${JSON.stringify(resolvedFields)}`);

    results.push({
      file: item.file,
      desc: item.desc,
      perspectiveWarpApplied: prep.needsWarp,
      skewAngle: prep.maxSkew,
      baseline: {
        wordCount: baseWords.length,
        meanConfidence: +baseMeanConf.toFixed(1),
        medianConfidence: +baseMedianConf.toFixed(1),
        fields: baseFields,
        textPreview: rBase.data.text.slice(0, 160).replace(/\s+/g, ' '),
      },
      newPipeline: {
        wordCount: winningWords.length,
        meanConfidence: +newMeanConf.toFixed(1),
        medianConfidence: +newMedianConf.toFixed(1),
        fields: resolvedFields,
        textPreview: (p1Words.length >= p2Words.length ? rPass1.data.text : rPass2.data.text).slice(0, 160).replace(/\s+/g, ' '),
        disagreements,
      },
      deltas: {
        wordDelta: winningWords.length - baseWords.length,
        confDelta: +(newMeanConf - baseMeanConf).toFixed(1),
      },
    });
  }

  await worker.terminate();
  await browser.close();

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nEvaluation complete. Full report written to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
