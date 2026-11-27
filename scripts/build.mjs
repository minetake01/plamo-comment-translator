import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

await mkdir(dist, { recursive: true });
await copyFile(
  path.join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'),
  path.join(dist, 'onig.wasm'),
);

const options = {
  entryPoints: [path.join(root, 'src', 'extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(dist, 'extension.js'),
  external: ['vscode'],
  sourcemap: false,
  minify,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/…');
} else {
  await build(options);
}
