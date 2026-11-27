import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];

if (tag === undefined) {
  console.error('usage: node scripts/verify-tag.mjs v<version>');
  process.exit(1);
}

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

if (tag !== `v${version}`) {
  console.error(`tag ${tag} does not match package.json version v${version}`);
  process.exit(1);
}

console.log(`tag ${tag} matches package.json version ${version}`);
