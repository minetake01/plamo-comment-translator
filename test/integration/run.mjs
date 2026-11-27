import { runTests } from '@vscode/test-electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = path.join(root, 'test', 'fixtures', 'workspace');
const extensionPath = process.env.EXTENSION_PATH ?? root;

// DSH / code.cmd が設定する Node モードを引き継ぐと Code.exe が GUI を起動しない。
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.VSCODE_DEV;

function findCodeExecutable() {
  if (process.env.VSCODE_EXE) return process.env.VSCODE_EXE;
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const local = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe');
    if (fs.existsSync(local)) return local;
  }
  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    const system = path.join(programFiles, 'Microsoft VS Code', 'Code.exe');
    if (fs.existsSync(system)) return system;
  }
  throw new Error('VS Code の Code.exe が見つかりません。VSCODE_EXE を設定してください。');
}

await runTests({
  vscodeExecutablePath: findCodeExecutable(),
  extensionDevelopmentPath: extensionPath,
  extensionTestsPath: path.join(root, 'test', 'integration', 'suite.cjs'),
  launchArgs: [`--folder-uri=${pathToFileURL(workspace).href}`],
});
