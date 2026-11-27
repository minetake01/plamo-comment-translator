/** Markdown の本文ブロック（見出し・段落・リスト項目・引用・表のセル）を切り出す。 */

import type {
  BlockKind,
  MarkdownSource,
  PlainPosition,
  PlainRange,
  SyntaxBlock,
  TokenSpan,
} from './types';

const ROOT_SCOPE = 'text.html.markdown';
const PARAGRAPH_SCOPE = 'meta.paragraph.markdown';
const HEADING_SCOPE = 'markup.heading.markdown';
const TABLE_SCOPE = 'markup.table.markdown';
const LIST_MARKER = 'punctuation.definition.list.begin.markdown';

/** 行の端で落とす、構文上の記号。強調やリンクの記号は本文として残す。 */
const STRUCTURAL_PREFIXES: readonly string[] = [
  'punctuation.definition.heading.markdown',
  'punctuation.definition.list.begin.markdown',
  'punctuation.definition.quote.begin.markdown',
  'punctuation.definition.table.markdown',
  'punctuation.separator.table.markdown',
  'punctuation.definition.markdown',
  'punctuation.definition.begin.frontmatter',
  'punctuation.definition.end.frontmatter',
  'markup.heading.setext.',
];

interface Segment {
  line: number;
  start: number;
  end: number;
}

export function isMarkdownScopes(scopes: readonly string[]): boolean {
  return scopes.includes(ROOT_SCOPE);
}

/**
 * ホバー位置が Markdown の本文なら、翻訳する本文と元レンジを返す。
 * コードブロック・コードスパン・リンク定義は本文ではないので扱わない。
 */
export function findMarkdownBlock(source: MarkdownSource, position: PlainPosition): SyntaxBlock | null {
  if (position.line < 0 || position.line >= source.lineCount) return null;
  const tokens = source.tokens(position.line);
  if (tokens.length === 0) return null;

  const hovered = tokens[tokenIndexAt(tokens, position.character)];
  if (hovered === undefined || !isMarkdownScopes(hovered.scopes)) return null;

  if (isSetextLine(tokens)) return position.line === 0 ? null : lineBlock(source, position.line - 1);
  if (isSetextHeadingText(source, position.line)) return lineBlock(source, position.line);
  if (tokens.some((token) => token.scopes.includes(TABLE_SCOPE))) {
    return tableCellBlock(source, position.line, position.character);
  }
  if (tokens.some((token) => token.scopes.includes(HEADING_SCOPE))) {
    return lineBlock(source, position.line);
  }
  if (tokens.some((token) => token.scopes.includes(PARAGRAPH_SCOPE))) {
    return paragraphBlock(source, position.line);
  }
  return null;
}

function lineBlock(source: MarkdownSource, line: number): SyntaxBlock | null {
  const segment = contentSegment(source.lineText(line), source.tokens(line), line);
  return fromSegments(source, segment === null ? [] : [segment], 'markdown');
}

function paragraphBlock(source: MarkdownSource, originLine: number): SyntaxBlock | null {
  const quoted = isQuoteLine(source.tokens(originLine));

  let start = originLine;
  if (!hasListMarker(source.tokens(originLine))) {
    while (start > 0
      && continuesParagraph(source, start - 1)
      && isQuoteLine(source.tokens(start - 1)) === quoted) {
      start -= 1;
      if (hasListMarker(source.tokens(start))) break;
    }
  }

  let end = originLine;
  while (end + 1 < source.lineCount
    && continuesParagraph(source, end + 1)
    && isQuoteLine(source.tokens(end + 1)) === quoted
    && !hasListMarker(source.tokens(end + 1))) {
    end += 1;
  }

  const segments: Segment[] = [];
  for (let line = start; line <= end; line += 1) {
    const segment = contentSegment(source.lineText(line), source.tokens(line), line);
    if (segment !== null) segments.push(segment);
  }
  return fromSegments(source, segments, 'markdown');
}

/** 段落が次の行へ続くか。空行、見出し、セット見出しの下線で切る。 */
function continuesParagraph(source: MarkdownSource, line: number): boolean {
  const tokens = source.tokens(line);
  if (isSetextLine(tokens) || isSetextHeadingText(source, line)) return false;
  return tokens.some((token) => token.scopes.includes(PARAGRAPH_SCOPE));
}

function hasListMarker(tokens: readonly TokenSpan[]): boolean {
  return tokens.some((token) => token.scopes.includes(LIST_MARKER));
}

function isSetextLine(tokens: readonly TokenSpan[]): boolean {
  return tokens.some(
    (token) => token.scopes.some((scope) => scope.startsWith('markup.heading.setext.')),
  );
}

function isQuoteLine(tokens: readonly TokenSpan[]): boolean {
  return tokens.some((token) => token.scopes.includes('markup.quote.markdown'));
}

function isSetextHeadingText(source: MarkdownSource, line: number): boolean {
  return line + 1 < source.lineCount && isSetextLine(source.tokens(line + 1));
}

function tableCellBlock(source: MarkdownSource, line: number, character: number): SyntaxBlock | null {
  const text = source.lineText(line);
  const tokens = source.tokens(line);
  const bounds = cellBounds(text, tokens, character);
  if (bounds === null) return null;

  const inside = tokens.filter(
    (token) => token.startIndex >= bounds.start && token.endIndex <= bounds.end,
  );
  let first = 0;
  while (first < inside.length && isEdgeNoise(text, inside[first] as TokenSpan)) first += 1;
  let last = inside.length - 1;
  while (last >= first && isEdgeNoise(text, inside[last] as TokenSpan)) last -= 1;
  if (first > last) return null;

  const start = (inside[first] as TokenSpan).startIndex;
  const end = (inside[last] as TokenSpan).endIndex;
  const segment = trimSegment(text, line, start, end);
  return fromSegments(source, segment === null ? [] : [segment], 'markdown');
}

/** カーソルを含むセルの、パイプを除いた範囲。 */
function cellBounds(
  text: string,
  tokens: readonly TokenSpan[],
  character: number,
): { start: number; end: number } | null {
  let start = 0;
  for (const token of tokens) {
    if (!leafScope(token).startsWith('punctuation.definition.table.markdown')) continue;
    if (character < token.startIndex) return { start, end: token.startIndex };
    start = token.endIndex;
  }
  return { start, end: text.length };
}

function contentSegment(text: string, tokens: readonly TokenSpan[], line: number): Segment | null {
  let first = 0;
  while (first < tokens.length && isEdgeNoise(text, tokens[first] as TokenSpan)) first += 1;
  let last = tokens.length - 1;
  while (last >= first && isEdgeNoise(text, tokens[last] as TokenSpan)) last -= 1;
  if (first > last) return null;

  const start = (tokens[first] as TokenSpan).startIndex;
  const end = (tokens[last] as TokenSpan).endIndex;
  return trimSegment(text, line, start, end);
}

function isEdgeNoise(text: string, token: TokenSpan): boolean {
  if (text.slice(token.startIndex, token.endIndex).trim() === '') return true;
  return token.scopes.some((scope) => STRUCTURAL_PREFIXES.some((prefix) => scope.startsWith(prefix)));
}

function trimSegment(text: string, line: number, start: number, end: number): Segment | null {
  const slice = text.slice(start, end);
  const trimmed = slice.trim();
  if (trimmed === '') return null;
  const leading = slice.length - slice.trimStart().length;
  const trailing = slice.length - slice.trimEnd().length;
  return { line, start: start + leading, end: end - trailing };
}

function fromSegments(
  source: MarkdownSource,
  segments: readonly Segment[],
  kind: BlockKind,
): SyntaxBlock | null {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first === undefined || last === undefined) return null;

  const text = segments
    .map((segment) => source.lineText(segment.line).slice(segment.start, segment.end))
    .join('\n');
  if (text.trim() === '') return null;

  const range: PlainRange = {
    start: { line: first.line, character: first.start },
    end: { line: last.line, character: last.end },
  };
  return { kind, text, range, languageId: source.languageId };
}

function tokenIndexAt(tokens: readonly TokenSpan[], character: number): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (character >= (tokens[index]?.startIndex ?? 0)) return index;
  }
  return 0;
}

function leafScope(token: TokenSpan): string {
  return token.scopes[token.scopes.length - 1] ?? '';
}
