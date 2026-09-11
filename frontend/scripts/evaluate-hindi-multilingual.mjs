import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';

const LABELS_DIR = path.resolve('real_test_labels');

const TEST_CASES = [
  {
    file: 'tata_salt_1.jpg',
    product: 'Tata Salt (Vacuum Evaporated)',
    expectedHindi: ['देश का नमक', 'नमक', 'टाटा'],
    notes: 'Prominent Hindi brand slogan "देश का नमक" alongside English TATA branding',
  },
  {
    file: 'parle_g_1.jpg',
    product: 'Parle-G Glucose Biscuits',
    expectedHindi: ['पारले-जी', 'ग्लूकोज बिस्कुट', 'बिस्कुट'],
    notes: 'Prominent Devanagari brand name "पारले-जी" and category "ग्लूकोज बिस्कुट"',
  },
  {
    file: 'marie_gold_roll.jpg',
    product: 'Britannia Marie Gold Biscuit Roll',
    expectedHindi: ['मैरी गोल्ड', 'बिस्कुट'],
    notes: 'Bilingual statutory declaration panel with Hindi & English lines',
  },
];

function extractRegex(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] || match[0] : null;
}

function extractStatutoryFields(text) {
  const t = text.replace(/\s+/g, ' ');
  return {
    mrp: extractRegex(t, /(?:MRP|M\.R\.P|Rs\.?|₹)\s*[:.]?\s*(\d+(?:\.\d{1,2})?)/i),
    net_quantity: extractRegex(t, /(?:Net\s*(?:Qty|Quantity|Weight|Wt)|NET\s*WEIGHT)\s*[:.]?\s*(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|N|U)\b)/i),
    mfg_date: extractRegex(t, /(?:Mfg|Pkg|Packed|Mfd|Date of Mfg)\s*[:.]?\s*([A-Za-z0-9\/\.\-]+)/i),
    consumer_care: extractRegex(t, /([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+|1800\s*\d{3}\s*\d{3,4})/i),
  };
}

async function main() {
  console.log('======================================================================');
  console.log('  HINDI / DEVANAGARI MULTI-LANGUAGE EVALUATION (ENG vs ENG+HIN)      ');
  console.log('======================================================================\n');

  // 1. Asset payload measurements
  const engPath = path.resolve('public', 'tesseract', 'lang', 'eng.traineddata.gz');
  const hinPath = path.resolve('public', 'tesseract', 'lang', 'hin.traineddata.gz');
  const engSize = fs.existsSync(engPath) ? fs.statSync(engPath).size : 0;
  const hinSize = fs.existsSync(hinPath) ? fs.statSync(hinPath).size : 0;

  console.log('1. ASSET SIZE & CACHE OVERHEAD:');
  console.log(`   - eng.traineddata.gz: ${(engSize / (1024 * 1024)).toFixed(2)} MB (${engSize} bytes)`);
  console.log(`   - hin.traineddata.gz: ${(hinSize / (1024 * 1024)).toFixed(2)} MB (${hinSize} bytes)`);
  console.log(`   - Combined Payload:   ${((engSize + hinSize) / (1024 * 1024)).toFixed(2)} MB (+${((hinSize / engSize) * 100).toFixed(1)}% payload increase)\n`);

  // 2. Measure worker initialization
  console.log('2. WORKER INITIALIZATION SPEED:');
  const tEngInit0 = performance.now();
  const workerEng = await createWorker('eng');
  const engInitTime = performance.now() - tEngInit0;
  console.log(`   - English worker init:    ${engInitTime.toFixed(0)} ms`);

  const tHinInit0 = performance.now();
  const workerMulti = await createWorker(['eng', 'hin']);
  const multiInitTime = performance.now() - tHinInit0;
  console.log(`   - Dual [eng, hin] init:   ${multiInitTime.toFixed(0)} ms (+${(multiInitTime - engInitTime).toFixed(0)} ms overhead)\n`);

  // 3. Test on Real Products
  console.log('3. PRODUCT OCR ACCURACY & LATENCY BENCHMARK:');
  const benchmarkResults = [];

  for (const item of TEST_CASES) {
    const imgPath = path.join(LABELS_DIR, item.file);
    if (!fs.existsSync(imgPath)) {
      console.log(`[SKIP] Missing image: ${item.file}`);
      continue;
    }

    console.log(`\n------------------------------------------------------------`);
    console.log(`Testing: ${item.product} [${item.file}]`);
    console.log(`Target Hindi text: ${JSON.stringify(item.expectedHindi)}`);

    // A. English-only recognition
    const t0Eng = performance.now();
    const resEng = await workerEng.recognize(imgPath);
    const engDuration = performance.now() - t0Eng;
    const engText = resEng.data.text.trim();
    const engWords = resEng.data.words ?? [];
    const engConfs = engWords.map((w) => w.confidence);
    const engMeanConf = engConfs.length ? engConfs.reduce((a, b) => a + b, 0) / engConfs.length : 0;
    const engHasDevanagari = /[\u0900-\u097F]/.test(engText);
    const engFields = extractStatutoryFields(engText);

    // B. Dual-language (eng + hin) recognition
    const t0Multi = performance.now();
    const resMulti = await workerMulti.recognize(imgPath);
    const multiDuration = performance.now() - t0Multi;
    const multiText = resMulti.data.text.trim();
    const multiWords = resMulti.data.words ?? [];
    const multiConfs = multiWords.map((w) => w.confidence);
    const multiMeanConf = multiConfs.length ? multiConfs.reduce((a, b) => a + b, 0) / multiConfs.length : 0;
    const multiHasDevanagari = /[\u0900-\u097F]/.test(multiText);
    const multiDevanagariMatches = multiText.match(/[\u0900-\u097F]{2,}/g) || [];
    const multiFields = extractStatutoryFields(multiText);

    // Check which expected Hindi tokens were captured
    const foundHindi = item.expectedHindi.filter((phrase) =>
      multiText.includes(phrase) || multiDevanagariMatches.some((m) => phrase.includes(m) || m.includes(phrase))
    );

    console.log(`\n   [CURRENT: English-Only]`);
    console.log(`   - Latency:          ${engDuration.toFixed(0)} ms`);
    console.log(`   - Words:            ${engWords.length} (Mean confidence: ${engMeanConf.toFixed(1)}%)`);
    console.log(`   - Has Devanagari?   ${engHasDevanagari ? 'YES' : 'NO (Silent failure - mapped to Latin gibberish)'}`);
    console.log(`   - Sample Output:    "${engText.slice(0, 160).replace(/\s+/g, ' ')}"`);
    console.log(`   - Statutory Fields: ${JSON.stringify(engFields)}`);

    console.log(`\n   [NEW: Dual-Language ('eng' + 'hin')]`);
    console.log(`   - Latency:          ${multiDuration.toFixed(0)} ms (Slowdown: ${(multiDuration / engDuration).toFixed(1)}x)`);
    console.log(`   - Words:            ${multiWords.length} (Mean confidence: ${multiMeanConf.toFixed(1)}%)`);
    console.log(`   - Has Devanagari?   ${multiHasDevanagari ? `YES (Found tokens: ${JSON.stringify(multiDevanagariMatches.slice(0, 8))})` : 'NO'}`);
    console.log(`   - Matched Hindi:    ${JSON.stringify(foundHindi)}`);
    console.log(`   - Sample Output:    "${multiText.slice(0, 160).replace(/\s+/g, ' ')}"`);
    console.log(`   - Statutory Fields: ${JSON.stringify(multiFields)}`);

    benchmarkResults.push({
      file: item.file,
      product: item.product,
      expectedHindi: item.expectedHindi,
      eng: {
        latencyMs: Math.round(engDuration),
        wordCount: engWords.length,
        meanConf: +engMeanConf.toFixed(1),
        hasDevanagari: engHasDevanagari,
        sampleText: engText.slice(0, 140).replace(/\s+/g, ' '),
        fields: engFields,
      },
      multi: {
        latencyMs: Math.round(multiDuration),
        wordCount: multiWords.length,
        meanConf: +multiMeanConf.toFixed(1),
        hasDevanagari: multiHasDevanagari,
        devanagariTokens: multiDevanagariMatches.slice(0, 10),
        matchedExpected: foundHindi,
        sampleText: multiText.slice(0, 140).replace(/\s+/g, ' '),
        fields: multiFields,
      },
      latencyMultiplier: +(multiDuration / engDuration).toFixed(2),
    });
  }

  await workerEng.terminate();
  await workerMulti.terminate();

  const outReport = path.resolve('real_test_labels', 'hindi_multilingual_benchmark.json');
  fs.writeFileSync(outReport, JSON.stringify(benchmarkResults, null, 2));
  console.log(`\nBenchmark complete. Results written to: ${outReport}`);
}

main().catch(console.error);
