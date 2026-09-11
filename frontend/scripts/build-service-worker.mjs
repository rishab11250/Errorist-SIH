import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextRoot = join(projectRoot, '.next');
const nextStaticRoot = join(nextRoot, 'static');
const publicRoot = join(projectRoot, 'public');
const templatePath = join(projectRoot, 'service-worker', 'service-worker.js');
const outputPath = join(publicRoot, 'sw.js');
const offlineRuntimeSource = join(projectRoot, 'offline', 'idb.js');
const offlineRuntimeOutput = join(publicRoot, 'offline', 'idb.js');

const requiredOcrAssets = [
  'tesseract/worker.min.js',
  'tesseract/core/tesseract-core.wasm',
  'tesseract/core/tesseract-core-simd.wasm',
  'tesseract/core/tesseract-core-lstm.wasm',
  'tesseract/core/tesseract-core-simd-lstm.wasm',
  'tesseract/lang/eng.traineddata.gz',
  'tesseract/lang/hin.traineddata.gz',
];

function toUrlPath(path) {
  return path.split(sep).join('/');
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    })
  );
  return files.flat().sort();
}

async function publicUrls(directory) {
  const root = join(publicRoot, directory);
  const files = await walkFiles(root);
  return files.map((file) => `/${toUrlPath(relative(publicRoot, file))}`);
}

await Promise.all(requiredOcrAssets.map((asset) => access(join(publicRoot, asset))));
await mkdir(dirname(offlineRuntimeOutput), { recursive: true });
await copyFile(offlineRuntimeSource, offlineRuntimeOutput);

const [buildId, template, nextStaticFiles, tesseractUrls, iconUrls, offlineUrls] =
  await Promise.all([
    readFile(join(nextRoot, 'BUILD_ID'), 'utf8'),
    readFile(templatePath, 'utf8'),
    walkFiles(nextStaticRoot),
    publicUrls('tesseract'),
    publicUrls('icons'),
    publicUrls('offline'),
  ]);

const nextStaticUrls = nextStaticFiles.map(
  (file) => `/_next/static/${toUrlPath(relative(nextStaticRoot, file))}`
);
const precacheUrls = [
  '/manifest.webmanifest',
  ...iconUrls,
  ...offlineUrls,
  ...nextStaticUrls,
  ...tesseractUrls,
].sort();
const rendered = template
  .replace('__CACHE_VERSION__', JSON.stringify(buildId.trim()))
  .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls, null, 2));

if (rendered.includes('__CACHE_VERSION__') || rendered.includes('__PRECACHE_URLS__')) {
  throw new Error('Service worker template placeholders were not replaced.');
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, rendered);
console.log(
  `Generated public/sw.js with ${nextStaticUrls.length} Next.js files and ${tesseractUrls.length} Tesseract files.`
);
