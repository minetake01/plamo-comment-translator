/** 拡張のエントリポイント。ホバー翻訳を登録する。 */

import * as path from 'node:path';
import { extensions, window, type ExtensionContext } from 'vscode';
import { registerHover } from './hover';
import { DocumentParserCache } from './syntax/documentParser';
import { getGrammarExtensions } from './syntax/grammarExtensions';
import { TextMateService } from './syntax/textmate';
import { TranslationCache } from './translationCache';
import { PlamoTranslator } from './translator';

export async function activate(context: ExtensionContext): Promise<void> {
  const output = window.createOutputChannel('PLaMo Comment Translator');
  context.subscriptions.push(output);

  const grammarExtensions = getGrammarExtensions();
  const grammarCount = grammarExtensions.reduce((sum, extension) => sum + extension.value.length, 0);
  if (grammarCount === 0) {
    throw new Error('TextMate 文法が見つかりません。VSCode の言語拡張を確認してください。');
  }

  const textMate = new TextMateService(
    grammarExtensions,
    path.join(context.extensionPath, 'dist', 'onig.wasm'),
  );
  try {
    await textMate.initialize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[activate] oniguruma の初期化に失敗しました: ${message}`);
    window.showErrorMessage(`PLaMo Comment Translator: Oniguruma WASM を読み込めません（${message}）`);
    throw error;
  }

  const parsers = new DocumentParserCache(textMate);
  context.subscriptions.push(parsers);

  const translator = new PlamoTranslator(new TranslationCache(), output);
  registerHover(context, { parsers, translator, output });

  if (extensions.getExtension('intellsmi.comment-translate')?.isActive === true) {
    output.appendLine('[activate] intellsmi.comment-translate が有効です。同じ場所にホバーが重複します。');
  }

  output.appendLine(`[activate] ${grammarExtensions.length} 個の文法パッケージ、${grammarCount} 個の文法を登録しました`);
}

export function deactivate(): void {
  // すべて context.subscriptions で破棄される。
}
