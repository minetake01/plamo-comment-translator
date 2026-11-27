/** コメント／文字列／Markdown／選択範囲ホバーの登録と Markdown 表示。 */

import {
  Hover,
  MarkdownString,
  Range,
  languages,
  window,
  type ExtensionContext,
  type OutputChannel,
  type Position,
  type TextDocument,
} from 'vscode';
import { readSettings, resolveTargetLanguage, toPlamoConfig, type Settings } from './config';
import { describeTranslationError } from './plamo/errors';
import type { DocumentParserCache } from './syntax/documentParser';
import type { PlainRange, SyntaxBlock } from './syntax/types';
import { blockHoverMarkdown } from './translationView';
import type { PlamoTranslator } from './translator';

export interface HoverDependencies {
  parsers: DocumentParserCache;
  translator: PlamoTranslator;
  output: OutputChannel;
}

export function registerHover(context: ExtensionContext, dependencies: HoverDependencies): void {
  context.subscriptions.push(languages.registerHoverProvider('*', {
    async provideHover(document: TextDocument, position: Position, token): Promise<Hover | null> {
      const settings = readSettings();
      if (!settings.hoverEnabled) return null;

      const selected = selectionAt(document, position);
      if (selected !== null) {
        const block: SyntaxBlock = {
          kind: 'selection',
          text: selected.text,
          range: toPlainRange(selected.range),
          languageId: document.languageId,
        };
        return translateBlock(block, settings, dependencies, token);
      }

      if (!settings.hoverComments && !settings.hoverStrings && !settings.hoverMarkdown) return null;

      const parser = await dependencies.parsers.get(document);
      if (parser === null) return null;

      let block: SyntaxBlock | null;
      try {
        block = parser.find(
          { line: position.line, character: position.character },
          {
            comments: settings.hoverComments,
            strings: settings.hoverStrings,
            markdown: settings.hoverMarkdown,
          },
        );
      } catch (error) {
        dependencies.output.appendLine(`[hover] parse failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
      if (block === null) return null;

      return translateBlock(block, settings, dependencies, token);
    },
  }));
}

/** 選択範囲を翻訳してホバーを返す。文法の解析は通さず、選択された本文だけを送る。 */
async function translateBlock(
  block: SyntaxBlock,
  settings: Settings,
  dependencies: HoverDependencies,
  token: { isCancellationRequested: boolean },
): Promise<Hover | null> {
  if (token.isCancellationRequested) return null;

  const target = resolveTargetLanguage(settings.targetLanguage);
  if (target === undefined) {
    return new Hover(
      errorMarkdown(`翻訳先の言語 "${settings.targetLanguage}" は PLaMo 3 Translate では未対応です`),
      toRange(block.range),
    );
  }

  let config;
  try {
    config = toPlamoConfig(settings);
  } catch (error) {
    return new Hover(
      errorMarkdown(error instanceof Error ? error.message : String(error)),
      toRange(block.range),
    );
  }

  try {
    const translated = await dependencies.translator.translate(block.text, target, config);
    if (token.isCancellationRequested) return null;
    return new Hover(translationMarkdown(block, translated, target), toRange(block.range));
  } catch (error) {
    dependencies.output.appendLine(`[hover] ${describeTranslationError(error)}`);
    if (token.isCancellationRequested) return null;
    return new Hover(errorMarkdown(describeTranslationError(error)), toRange(block.range));
  }
}

/** ホバー位置を含む、空でない選択範囲を探す。 */
function selectionAt(
  document: TextDocument,
  position: Position,
): { range: Range; text: string } | null {
  for (const editor of window.visibleTextEditors) {
    if (editor.document !== document) continue;
    for (const selection of editor.selections) {
      if (selection.isEmpty || !selection.contains(position)) continue;
      const text = document.getText(selection).trim();
      if (text === '') continue;
      return { range: selection, text };
    }
  }
  return null;
}

function translationMarkdown(block: SyntaxBlock, translated: string, targetLanguage: string): MarkdownString {
  const markdown = new MarkdownString(undefined, true);
  markdown.supportThemeIcons = true;
  markdown.appendMarkdown(blockHoverMarkdown(block, translated, targetLanguage));
  return markdown;
}

function errorMarkdown(message: string): MarkdownString {
  const markdown = new MarkdownString(undefined, true);
  markdown.supportThemeIcons = true;
  markdown.appendMarkdown('$(error) **PLaMo 3 Translate**\n\n');
  markdown.appendText(message);
  return markdown;
}

function toRange(range: PlainRange): Range {
  return new Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}

function toPlainRange(range: Range): PlainRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}
