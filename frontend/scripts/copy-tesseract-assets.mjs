import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerRoot = dirname(require.resolve('tesseract.js'));
const packageRoot = join(workerRoot, '..');
const packageRequire = createRequire(join(packageRoot, 'package.json'));
const coreRoot = dirname(packageRequire.resolve('tesseract.js-core'));
const languageRoot = dirname(require.resolve('@tesseract.js-data/eng'));
const publicRoot = join(projectRoot, 'public', 'tesseract');
const coreDestination = join(publicRoot, 'core');
const languageDestination = join(publicRoot, 'lang');
const licenseDestination = join(publicRoot, 'licenses');

const coreFiles = [
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
];

await mkdir(coreDestination, { recursive: true });
await mkdir(languageDestination, { recursive: true });
await mkdir(licenseDestination, { recursive: true });
await copyFile(join(packageRoot, 'dist', 'worker.min.js'), join(publicRoot, 'worker.min.js'));
await Promise.all(
  coreFiles.map((file) => copyFile(join(coreRoot, file), join(coreDestination, file)))
);
await copyFile(
  join(languageRoot, '4.0.0', 'eng.traineddata.gz'),
  join(languageDestination, 'eng.traineddata.gz')
);
const licenseFiles = [
  [join(packageRoot, 'LICENSE.md'), 'tesseract-js.txt'],
  [join(coreRoot, 'LICENSE'), 'tesseract-core.txt'],
  [join(packageRoot, 'dist', 'worker.min.js.LICENSE.txt'), 'worker-bundle.txt'],
];
await Promise.all(
  licenseFiles.map(async ([source, name]) => {
    const content = await readFile(source, 'utf8');
    await writeFile(join(licenseDestination, name), `${content.trimEnd()}\n`);
  })
);

console.log('Copied local Tesseract worker, core, and English language assets.');
