/** VSCode に依存しない構文解析の型。 */

export interface PlainPosition {
  line: number;
  character: number;
}

export interface PlainRange {
  start: PlainPosition;
  end: PlainPosition;
}

export interface TextDocumentLike {
  languageId: string;
  getText(): string;
}

export interface CommentToken {
  /** 行全体（その行の範囲内）。 */
  text: string;
  /** 行頭で翻訳対象外にする文字数。 */
  ignoreStart: number;
  /** 行末で翻訳対象外にする文字数。 */
  ignoreEnd: number;
}

/** TextMate の 1 トークン。vscode-textmate の IToken と構造的に互換。 */
export interface TokenSpan {
  startIndex: number;
  endIndex: number;
  scopes: readonly string[];
}

/** Markdown ブロックの切り出しに使う、行単位のトークン列。 */
export interface MarkdownSource {
  languageId: string;
  lineCount: number;
  lineText(line: number): string;
  tokens(line: number): readonly TokenSpan[];
}

/** 翻訳できる本文の種類。 */
export type BlockKind = 'comment' | 'string' | 'markdown' | 'selection';

export interface SyntaxBlock {
  kind: BlockKind;
  /** 記号を除いた、PLaMo に渡す本文。 */
  text: string;
  /** 元ドキュメント上の範囲。 */
  range: PlainRange;
  languageId: string;
}

export interface GrammarContribution {
  language?: string;
  scopeName: string;
  path: string;
  embeddedLanguages?: Record<string, string>;
  tokenTypes?: Record<string, string>;
  injectTo?: string[];
}

export interface GrammarLanguage {
  id: number;
  name: string;
}

export interface GrammarExtension {
  languages: GrammarLanguage[];
  value: GrammarContribution[];
  extensionLocation: string;
}
