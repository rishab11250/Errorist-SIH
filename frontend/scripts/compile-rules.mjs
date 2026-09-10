import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(scriptDir, '..');
const repoRoot = join(frontendDir, '..');
const yamlPath = join(repoRoot, 'backend', 'app', 'rules.yaml');
const destinationDir = join(frontendDir, 'lib', 'rules');
const jsonDestination = join(destinationDir, 'rules.json');

const isCheck = process.argv.includes('--check');

const yamlContent = await readFile(yamlPath, 'utf8');
const parsed = YAML.parse(yamlContent);
const compiledJson = JSON.stringify(parsed, null, 2) + '\n';

if (isCheck) {
  if (!existsSync(jsonDestination)) {
    console.error(`Missing compiled rules: ${jsonDestination}`);
    console.error('Run "pnpm rules:compile" to generate it.');
    process.exit(1);
  }
  const existingJson = await readFile(jsonDestination, 'utf8');
  // Normalize CRLF to LF for cross-platform comparison
  const normExisting = existingJson.replace(/\r\n/g, '\n');
  const normCompiled = compiledJson.replace(/\r\n/g, '\n');
  if (normExisting !== normCompiled) {
    console.error(`Drift detected between ${yamlPath} and ${jsonDestination}!`);
    console.error('frontend/lib/rules/rules.json does not match backend/app/rules.yaml.');
    console.error('Run "pnpm rules:compile" and commit both files.');
    process.exit(1);
  }
  console.log(`Parity check passed: ${jsonDestination} matches ${yamlPath}`);
} else {
  await mkdir(destinationDir, { recursive: true });
  await writeFile(jsonDestination, compiledJson, 'utf8');
  console.log(`Successfully compiled ${yamlPath} -> ${jsonDestination}`);
}
