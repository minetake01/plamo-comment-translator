/** 翻訳結果の表示用 Markdown を組み立てる。 */

import { languageLabel } from './plamo/languages';
import type { SyntaxBlock } from './syntax/types';

const KIND_LABELS: Readonly<Record<SyntaxBlock['kind'], string>> = {
  comment: 'コメント',
  string: '文字列',
  markdown: 'Markdown',
  selection: '選択範囲',
};

/** ホバーに出す Markdown。Markdown の本文は翻訳結果の記法をそのまま活かす。 */
export function blockHoverMarkdown(block: SyntaxBlock, translated: string, targetLanguage: string): string {
  const header = `$(globe) **PLaMo 3 Translate** · ${KIND_LABELS[block.kind]} · 自動 → ${languageLabel(targetLanguage)}\n\n`;
  return header + (rendersMarkdown(block) ? translated : fenced(translated, block.languageId));
}

function rendersMarkdown(block: SyntaxBlock): boolean {
  if (block.kind === 'markdown') return true;
  return block.kind === 'selection' && block.languageId === 'markdown';
}

/** 本文にバッククォートが含まれてもコードフェンスが壊れないようにする。 */
export function fenced(text: string, languageId: string): string {
  let fence = '```';
  while (text.includes(fence)) fence += '`';
  return `${fence}${languageId}\n${text}\n${fence}`;
}
