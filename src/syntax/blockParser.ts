/** TextMate のトークン列から、ホバー位置のコメント／文字列／Markdown ブロックを切り出す。 */

import { INITIAL, type IGrammar, type IToken, type StateStack } from 'vscode-textmate';
import {
  findLeadingWhitespaceOrUnpairedIndex,
  normalizeCommentLines,
  normalizeStringLines,
} from './commentText';
import { findMarkdownBlock, isMarkdownScopes } from './markdown';
import type {
  CommentToken,
  MarkdownSource,
  PlainPosition,
  PlainRange,
  SyntaxBlock,
} from './types';

type ScopeCheck = (scopes: readonly string[]) => boolean;

const COMMENT_SCOPES: readonly RegExp[] = [
  /^punctuation\.definition\.comment/,
  /^comment\./,
  /^string\.quoted\.docstring\.multi/,
];

export function isCommentScope(scopes: readonly string[]): boolean {
  return scopes.some((scope) => COMMENT_SCOPES.some((pattern) => pattern.test(scope)));
}

export function isCommentSkip(scopes: readonly string[]): boolean {
  const leaf = scopes[0] ?? '';
  return leaf.startsWith('source') || leaf.startsWith('punctuation.whitespace.comment');
}

export function isCommentPunctuation(scopes: readonly string[]): boolean {
  const leaf = scopes[0] ?? '';
  return leaf.startsWith('punctuation.definition.comment')
    || leaf.startsWith('punctuation.definition.string');
}

export function isStringScope(scopes: readonly string[]): boolean {
  const leaf = scopes[0] ?? '';
  if (leaf.startsWith('string.regexp')) return false;
  return leaf.startsWith('string.')
    || leaf.startsWith('punctuation.definition.string')
    || leaf.startsWith('constant.character.escape');
}

export function isStringPunctuation(scopes: readonly string[]): boolean {
  return (scopes[0] ?? '').startsWith('punctuation.definition.string');
}

interface TokenInfo {
  token: IToken;
  text: string;
  startIndex: number;
  endIndex: number;
  scopes: readonly string[];
}

export interface FindOptions {
  comments: boolean;
  strings: boolean;
  markdown: boolean;
}

export class BlockParser {
  private readonly lines: string[];
  private readonly tokens: IToken[][] = [];
  private readonly states: StateStack[] = [];

  constructor(
    text: string,
    private readonly grammar: IGrammar,
    private readonly languageId: string,
    private readonly maxLineLength = 20_000,
  ) {
    this.lines = text.split(/\r?\n/);
  }

  /** 位置がコメント／文字列／Markdown 本文の内側なら、翻訳対象本文と元レンジを返す。 */
  find(position: PlainPosition, options: FindOptions): SyntaxBlock | null {
    const at = this.tokenAt(position);
    if (at === null) return null;

    if (options.comments && isCommentScope(at.scopes)) {
      return this.block('comment', position, at.index, isCommentScope, isCommentSkip, isCommentPunctuation);
    }
    if (options.markdown && isMarkdownScopes(at.scopes)) {
      const markdown = findMarkdownBlock(this.markdownSource(), position);
      if (markdown !== null) return markdown;
    }
    if (options.strings && isStringScope(at.scopes)) {
      return this.block('string', position, at.index, isStringScope, undefined, isStringPunctuation);
    }
    return null;
  }

  private markdownSource(): MarkdownSource {
    return {
      languageId: this.languageId,
      lineCount: this.lines.length,
      lineText: (line) => this.lines[line] ?? '',
      tokens: (line) => this.getTokens(line),
    };
  }

  private block(
    kind: 'comment' | 'string',
    position: PlainPosition,
    originIndex: number,
    match: ScopeCheck,
    skip: ScopeCheck | undefined,
    ignore: ScopeCheck,
  ): SyntaxBlock | null {
    const range = this.expand(position, originIndex, match, skip);
    const tokens = this.tokensFor(range, skip, ignore);
    const lines = tokens.map((token) => {
      const end = Math.max(token.ignoreStart, token.text.length - token.ignoreEnd);
      return token.text.slice(token.ignoreStart, end);
    });
    const text = kind === 'comment' ? normalizeCommentLines(lines) : normalizeStringLines(lines);
    if (text === null) return null;
    return { kind, text, range, languageId: this.languageId };
  }

  private expand(
    origin: PlainPosition,
    originIndex: number,
    match: ScopeCheck,
    skip: ScopeCheck | undefined,
  ): PlainRange {
    const originToken = this.getTokens(origin.line)[originIndex];
    if (originToken === undefined) {
      return { start: origin, end: origin };
    }

    let startIndex = originToken.startIndex;
    let startLine = origin.line;
    let skipEnabled = false;
    for (let line = origin.line; line >= 0; line -= 1) {
      let index = line === origin.line ? originIndex : this.getTokens(line).length - 1;
      for (; index >= 0; index -= 1) {
        const info = this.tokenInfo(line, index);
        if (match(info.scopes)) {
          startIndex = info.startIndex;
          startLine = line;
          skipEnabled = true;
        } else if (skipEnabled && skip?.(info.scopes) === true) {
          skipEnabled = false;
        } else {
          break;
        }
      }
      if (index >= 0) break;
    }

    let endIndex = originToken.endIndex;
    let endLine = origin.line;
    skipEnabled = true;
    for (let line = origin.line; line < this.lines.length; line += 1) {
      const tokens = this.getTokens(line);
      let index = line === origin.line ? originIndex + 1 : 0;
      for (; index < tokens.length; index += 1) {
        const info = this.tokenInfo(line, index);
        if (match(info.scopes)) {
          endIndex = info.endIndex;
          endLine = line;
          skipEnabled = true;
        } else if (skipEnabled && skip?.(info.scopes) === true) {
          skipEnabled = false;
        } else {
          break;
        }
      }
      if (index < tokens.length || !skipEnabled) break;
    }

    return {
      start: { line: startLine, character: startIndex },
      end: { line: endLine, character: endIndex },
    };
  }

  private tokensFor(
    range: PlainRange,
    skip: ScopeCheck | undefined,
    ignore: ScopeCheck,
  ): CommentToken[] {
    const tokens: CommentToken[] = [];
    for (let line = range.start.line; line <= range.end.line; line += 1) {
      const lineTokens = this.getTokens(line);
      const lineText = this.lines[line] ?? '';
      let sIndex = 0;
      let eIndex = lineTokens.length - 1;
      let sTextIndex = 0;
      let eTextIndex = lineText.length;

      if (line === range.start.line) {
        sIndex = this.tokenIndexAt(line, range.start.character);
        sTextIndex = range.start.character;
      }
      if (line === range.end.line) {
        eIndex = this.tokenIndexAt(line, Math.max(0, range.end.character - 1));
        eTextIndex = range.end.character;
      }

      let ignoreStart = 0;
      let index = sIndex;
      for (; index < lineTokens.length; index += 1) {
        const info = this.tokenInfo(line, index);
        if (skip?.(info.scopes) === true || ignore(info.scopes)) {
          ignoreStart += info.endIndex - info.startIndex;
        } else if (findLeadingWhitespaceOrUnpairedIndex(info.text) === info.text.length) {
          ignoreStart += info.text.length;
        } else if (index === 0 && ignoreStart === 0) {
          const match = info.text.match(/^\s+/);
          ignoreStart = match?.[0].length ?? ignoreStart;
        } else {
          break;
        }
      }

      let ignoreEnd = 0;
      for (let tail = eIndex; tail >= index; tail -= 1) {
        const info = this.tokenInfo(line, tail);
        if (ignore(info.scopes)) {
          ignoreEnd += info.text.length;
        } else {
          break;
        }
      }

      const width = Math.max(0, eTextIndex - sTextIndex);
      tokens.push({
        text: lineText.substring(sTextIndex, eTextIndex),
        ignoreStart: Math.min(ignoreStart, width),
        ignoreEnd: Math.min(ignoreEnd, width),
      });
    }
    return tokens;
  }

  private tokenAt(position: PlainPosition): { index: number; scopes: readonly string[] } | null {
    if (position.line < 0 || position.line >= this.lines.length) return null;
    this.tokenizeTo(position.line);
    const tokens = this.tokens[position.line] ?? [];
    let index = -1;
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if (position.character >= (tokens[i]?.startIndex ?? 0)) {
        index = i;
        break;
      }
    }
    if (index < 0) index = 0;
    const token = tokens[index];
    if (token === undefined) return null;
    return { index, scopes: [...token.scopes].reverse() };
  }

  private tokenInfo(line: number, index: number): TokenInfo {
    const token = this.getTokens(line)[index];
    if (token === undefined) {
      throw new Error(`token ${index} is missing on line ${line + 1}`);
    }
    const lineText = this.lines[line] ?? '';
    return {
      token,
      text: lineText.substring(token.startIndex, token.endIndex),
      startIndex: token.startIndex,
      endIndex: token.endIndex,
      scopes: [...token.scopes].reverse(),
    };
  }

  private tokenIndexAt(line: number, character: number): number {
    const tokens = this.getTokens(line);
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (character >= (tokens[index]?.startIndex ?? 0)) return index;
    }
    return 0;
  }

  private getTokens(line: number): IToken[] {
    this.tokenizeTo(line);
    const tokens = this.tokens[line];
    if (tokens === undefined) throw new Error(`line ${line + 1} is out of range`);
    return tokens;
  }

  private tokenizeTo(line: number): void {
    let state: StateStack = this.states.length > 0
      ? this.states[this.states.length - 1] ?? INITIAL
      : INITIAL;
    for (let index = this.tokens.length; index <= line; index += 1) {
      const text = this.lines[index] ?? '';
      if (text.length > this.maxLineLength) {
        throw new Error(`line ${index + 1} exceeds ${this.maxLineLength} characters`);
      }
      const result = this.grammar.tokenizeLine(text, state);
      this.tokens.push(result.tokens);
      this.states.push(result.ruleStack);
      state = result.ruleStack;
    }
  }
}
