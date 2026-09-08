import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:3000';
const LABELS_DIR = path.resolve('..', 'real_test_labels');

const TEST_CASES = [
  {
    id: 'case_1_clean_balaji',
    name: 'Balaji Wafers Back Panel (Clean, flat)',
    file: 'balaji_1.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Clean flat back panel: Net Qty 25g, MRP Rs 5.00 incl taxes, USP Rs 0.20/g, Rajkot PIN 360024',
    expected: {
      r6_1_e_mrp: 'pass',
      r6_1_c_net_quantity: 'pass',
      r6_1_a_address: 'pass',
      r6_2_consumer_care: 'pass/warn',
      r6_1_d_mfg_date: 'na', // food exemption
      r6_1_b_common_name: 'pass',
      r6_1_aa_country_origin: 'na', // domestic
      r6_1_a_importer_address: 'na', // domestic
      r6_1_da_best_before: 'pass/warn',
      r6_1_f_dimensions: 'na', // food
      r6_11_unit_sale_price: 'pass',
      r6_10_ecommerce_declarations: 'na', // retail mode
      r7_font_size: 'manual_review/pass' // DPI fallback
    }
  },
  {
    id: 'case_2_clean_good_day',
    name: 'Britannia Good Day Label Strip (Clean, flat)',
    file: 'good_day_2.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Clean horizontal label strip: Britannia Industries Ltd, Kolkata 700 017, email, phone',
    expected: {
      r6_1_a_address: 'pass',
      r6_2_consumer_care: 'pass',
      r6_1_d_mfg_date: 'na',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_f_dimensions: 'na',
      r6_10_ecommerce_declarations: 'na'
    }
  },
  {
    id: 'case_3_angle_good_day',
    name: 'Britannia Good Day Packaging (Perspective angle / hand-held)',
    file: 'good_day_1.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Pack held at slight 3D perspective angle with partial lighting gradient',
    expected: {
      r6_1_d_mfg_date: 'na',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_f_dimensions: 'na',
      r6_10_ecommerce_declarations: 'na'
    }
  },
  {
    id: 'case_4_wrinkle_parle_g',
    name: 'Parle-G Wrapper (Wrinkled foil / finger occlusion)',
    file: 'parle_g_2.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Hand holding wrinkled foil pack with finger touch and barcode',
    expected: {
      r6_1_d_mfg_date: 'na',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_f_dimensions: 'na',
      r6_10_ecommerce_declarations: 'na'
    }
  },
  {
    id: 'case_5_glare_bourbon',
    name: 'Britannia Bourbon Foil Wrapper (Metallic glare)',
    file: 'bourbon_2.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Shiny reflective foil wrapper with bright specular glare spots',
    expected: {
      r6_1_d_mfg_date: 'na',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_f_dimensions: 'na',
      r6_10_ecommerce_declarations: 'na'
    }
  },
  {
    id: 'case_6_missing_maggi',
    name: 'Maggi Front/Side Panel (Missing MRP, PIN, Mfg Date)',
    file: 'maggi_2.jpg',
    mode: 'retail_image',
    category: 'food',
    imported: 'domestic',
    description: 'Panel with common name and FSSAI, but missing MRP, missing manufacturer address PIN code',
    expected: {
      r6_1_e_mrp: 'fail',
      r6_1_a_address: 'fail',
      r6_1_b_common_name: 'pass/fail',
      r6_1_d_mfg_date: 'na',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_f_dimensions: 'na',
      r6_10_ecommerce_declarations: 'na'
    }
  },
  {
    id: 'case_7_ecom_haldiram',
    name: 'Haldiram Aloo Bhujia (E-commerce product listing)',
    file: 'ecom_haldiram.png',
    mode: 'ecommerce_listing',
    category: 'food',
    imported: 'domestic',
    description: 'E-commerce product card with complete mandatory declarations',
    expected: {
      r6_1_e_mrp: 'pass',
      r6_1_c_net_quantity: 'pass',
      r6_1_a_address: 'pass',
      r6_2_consumer_care: 'pass',
      r6_1_d_mfg_date: 'na',
      r6_1_b_common_name: 'pass',
      r6_1_aa_country_origin: 'na',
      r6_1_a_importer_address: 'na',
      r6_1_da_best_before: 'pass',
      r6_1_f_dimensions: 'na',
      r6_11_unit_sale_price: 'pass',
      r7_font_size: 'na' // retail only
    }
  }
];

async function run() {
  console.log('=== Starting Real Label OCR + Rule Engine E2E Verification ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();

  // Handle page errors and logs
  page.on('pageerror', (err) => console.log('Browser PageError:', err.message));
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Reading label text') || text.includes('Tesseract') || text.includes('error') || text.includes('Error')) {
      console.log('   [Browser]', text.slice(0, 100));
    }
  });

  console.log('1. Authenticating as admin via /api/auth/login ...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin-password-123' })
  });
  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const sessionMatch = cookieHeader.match(/lmpc_session=([^;]+)/);
  if (!sessionMatch) {
    throw new Error('Failed to obtain lmpc_session cookie from login: ' + cookieHeader);
  }
  const sessionVal = sessionMatch[1];
  await page.setCookie({
    name: 'lmpc_session',
    value: sessionVal,
    domain: '127.0.0.1',
    path: '/'
  });
  console.log('   Authenticated. Session cookie set.');

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    const imagePath = path.join(LABELS_DIR, testCase.file);
    console.log(`\n------------------------------------------------------------`);
    console.log(`Test ${i + 1}/${TEST_CASES.length}: [${testCase.id}] ${testCase.name}`);
    console.log(`Image: ${testCase.file} (${(fs.statSync(imagePath).size / 1024).toFixed(1)} KB)`);
    console.log(`Context: mode=${testCase.mode}, category=${testCase.category}, imported=${testCase.imported}`);

    // Navigate to fresh homepage
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="scan-mode"]', { timeout: 15000 });

    // Set mode
    const modeSelector = `input[name="scan-mode"][value="${testCase.mode}"]`;
    await page.waitForSelector(modeSelector);
    await page.click(modeSelector);

    // Set category
    const categorySelects = await page.$$('select');
    if (categorySelects.length >= 2) {
      await categorySelects[0].select(testCase.category);
      await categorySelects[1].select(testCase.imported);
    }

    // Prepare interception for /api/scan
    let interceptedRequest = null;
    let interceptedResponse = null;
    let scanError = null;

    const scanPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for /api/scan response after 120s`));
      }, 120000);

      const responseHandler = async (response) => {
        if (response.url().includes('/api/scan') && response.request().method() === 'POST') {
          try {
            const req = response.request();
            interceptedRequest = JSON.parse(req.postData() || '{}');
            interceptedResponse = await response.json();
            clearTimeout(timeout);
            page.off('response', responseHandler);
            resolve();
          } catch (err) {
            clearTimeout(timeout);
            page.off('response', responseHandler);
            reject(err);
          }
        }
      };
      page.on('response', responseHandler);

      // Also watch for frontend error alert
      const checkErrorInterval = setInterval(async () => {
        try {
          const alert = await page.$('div[role="alert"]');
          if (alert) {
            const errText = await (await alert.getProperty('textContent')).jsonValue();
            clearInterval(checkErrorInterval);
            clearTimeout(timeout);
            page.off('response', responseHandler);
            scanError = errText;
            resolve();
          }
        } catch {
          // ignore
        }
      }, 1000);
    });

    // Upload file
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(imagePath);

    // Wait for preview or file selection
    await page.waitForSelector('img[alt="Selected evidence preview"]', { timeout: 10000 });

    // Wait for start button to be enabled
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent && (b.textContent.includes('Start inspection') || b.textContent.includes('Retry inspection')));
      return btn && !btn.disabled;
    }, { timeout: 10000 });

    const buttons = await page.$$('button');
    let startBtn = null;
    for (const btn of buttons) {
      const text = await (await btn.getProperty('textContent')).jsonValue();
      if (text.includes('Start inspection') || text.includes('Retry inspection')) {
        startBtn = btn;
        break;
      }
    }

    if (!startBtn) {
      throw new Error('Start inspection button not found');
    }

    console.log('   Starting inspection (In-browser Tesseract.js OCR running)...');
    const startTime = Date.now();
    await startBtn.click();

    // Wait for scan network request
    await scanPromise;
    const durationMs = Date.now() - startTime;
    console.log(`   Scan completed in ${(durationMs / 1000).toFixed(1)}s`);

    if (scanError) {
      console.log(`   Frontend UI Alert: ${scanError}`);
      results.push({
        testCase,
        durationMs,
        error: scanError,
        overallStatus: 'ui_error'
      });
      continue;
    }

    // Parse data
    const wordCount = interceptedRequest?.ocr_payload?.length || 0;
    const lineCount = interceptedRequest?.ocr_lines?.length || 0;
    const rawText = (interceptedRequest?.ocr_payload || []).map(w => w.text).join(' ');
    const quality = interceptedResponse?.quality || {};
    const overallStatus = interceptedResponse?.overall_status || 'unknown';
    const verdicts = interceptedResponse?.verdicts || [];

    console.log(`   OCR Extracted: ${wordCount} words, ${lineCount} lines`);
    console.log(`   Quality Status: ${quality.status} (score: ${quality.score})`);
    console.log(`   Overall Status: ${overallStatus}`);
    console.log(`   Verdicts Count: ${verdicts.length}`);

    // Map verdicts
    const verdictMap = {};
    for (const v of verdicts) {
      verdictMap[v.rule_id] = {
        status: v.status,
        confidence: v.confidence,
        evidence: v.evidence,
        bbox_count: (v.evidence_bboxes || []).length,
        evidence_bboxes: v.evidence_bboxes || [],
        reasoning: v.reasoning,
        failure_message: v.failure_message
      };
      console.log(`     - [${v.status.toUpperCase()}] ${v.rule_id}: ${v.evidence ? `"${v.evidence.slice(0, 60)}..."` : v.reasoning.slice(0, 60)}`);
    }

    results.push({
      testCase,
      durationMs,
      ocr: {
        wordCount,
        lineCount,
        rawTextPreview: rawText.slice(0, 300),
        rawTextFull: rawText
      },
      quality,
      overallStatus,
      verdictMap,
      verdictsRaw: verdicts
    });
  }

  await browser.close();

  // Save all results
  const outPath = path.resolve('..', 'real_test_labels', 'e2e_real_test_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n============================================================`);
  console.log(`All tests finished! Detailed results saved to: ${outPath}`);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
