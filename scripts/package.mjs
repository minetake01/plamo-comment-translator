import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${path.basename(script)} exited with ${signal ?? code}`));
    });
  });
}

const { name, version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const vsix = path.join(root, 'dist', `${name}-${version}.vsix`);

await run(path.join(root, 'scripts', 'build.mjs'), ['--minify']);
await run(path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce'), [
  'package',
  '--no-dependencies',
  '--out',
  vsix,
]);

console.log(vsix);
