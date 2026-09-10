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

await mkdir(destinationDir, { recursive: true });
const yamlContent = await readFile(yamlPath, 'utf8');
const parsed = YAML.parse(yamlContent);

await writeFile(jsonDestination, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
console.log(`Successfully compiled ${yamlPath} -> ${jsonDestination}`);
