import puppeteer from 'puppeteer-core';
import path from 'path';

const outputPath = path.resolve('..', 'real_test_labels', 'ecom_haldiram.png');

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { background: #f1f3f6; padding: 30px; display: flex; justify-content: center; }
  .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); width: 850px; padding: 32px; }
  .header { border-bottom: 1px solid #e0e0e0; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 14px; font-weight: 600; color: #878787; text-transform: uppercase; letter-spacing: 0.5px; }
  .title { font-size: 22px; font-weight: 600; color: #212121; margin-top: 4px; }
  .pricing-box { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
  .mrp-row { display: flex; align-items: baseline; gap: 12px; }
  .price { font-size: 26px; font-weight: bold; color: #212121; }
  .tax-inclusive { font-size: 14px; color: #555; font-weight: 500; }
  .unit-price { font-size: 15px; color: #2874f0; font-weight: 600; margin-top: 4px; }
  .section-title { font-size: 16px; font-weight: 700; color: #212121; margin-bottom: 12px; border-left: 4px solid #2874f0; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { text-align: left; padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
  th { width: 32%; color: #878787; font-weight: 500; }
  td { color: #212121; font-weight: 500; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="brand">Haldiram's Nagpur</div>
    <div class="title">Haldiram's Nagpur Bhujia Sev - Crispy Savoury Noodles</div>
  </div>

  <div class="pricing-box">
    <div class="mrp-row">
      <span class="price">MRP ₹55.00</span>
      <span class="tax-inclusive">(Inclusive of all taxes)</span>
    </div>
    <div class="unit-price">Unit Sale Price: ₹0.28 / 1 g</div>
  </div>

  <div class="section-title">Mandatory Product Information</div>
  <table>
    <tr><th>Generic / Common Name</th><td>Spiced Tepary Bean and Gram Flour Noodles (Bhujia Namkeen)</td></tr>
    <tr><th>Net Quantity</th><td>200 g</td></tr>
    <tr><th>Country of Origin</th><td>India</td></tr>
    <tr><th>Manufacturer / Packer Name & Address</th><td>Haldiram Foods International Pvt. Ltd., 20 Km Stone, Vill. Gumthala, Bhandara Road, Nagpur - 441104, Maharashtra, India</td></tr>
    <tr><th>Consumer Care Details</th><td>Executive, Customer Care Cell, Haldiram Foods International Pvt. Ltd., Nagpur - 441104. Email: customercare@haldirams.com | Tel: +91 712 2779451</td></tr>
    <tr><th>Best Before / Expiry</th><td>Best Before 6 Months from Date of Packaging</td></tr>
    <tr><th>Date of Manufacture / Packaging</th><td>Pkg Date: 08/2026</td></tr>
  </table>
</div>
</body>
</html>
`;

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--window-size=950,900']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  console.log('Successfully generated ' + outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
