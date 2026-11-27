/** コメント記号・文字列の引用符を落として、PLaMo に渡す本文を作る。 */

const UNPAIRED = new Set(['*', '+', '-', '#', '?', '!', '|', '&', '~', '^', ',', '.', ':', ';']);

/**
 * 行頭の空白とコメント装飾だけを読み飛ばした位置を返す。
 * ブロックコメントの閉じ記号の先頭文字は、記号の一部なので落とさない。
 */
export function findLeadingWhitespaceOrUnpairedIndex(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === undefined) return text.length;
    if ((char === '*' && (next === '/' || next === ')'))
      || (char === '-' && (next === '>' || next === '}'))) {
      return index;
    }
    if (!/\s/.test(char) && !UNPAIRED.has(char)) return index;
  }
  return text.length;
}

const DROP_LINE = /^\s*(?:=begin|=end)\b/i;

const LEADING_MARKERS: readonly RegExp[] = [
  /^\s*\/\/+!?/,
  /^\s*\/\*+!?/,
  /^\s*<!--/,
  /^\s*\*+(?=\s|$)/,
  /^\s*#+!?/,
  /^\s*--\[=*\[/,
  /^\s*--+!?/,
  /^\s*;+/,
  /^\s*%+/,
  /^\s*"""|^\s*'''/,
  /^\s*'+/,
  /^\s*REM\b/i,
  /^\s*\(\*+/,
  /^\s*\{-/,
];

const TRAILING_MARKERS: readonly RegExp[] = [
  /\s*\*\/\s*$/,
  /\s*-->\s*$/,
  /\s*-\}\s*$/,
  /\s*\*\)\s*$/,
  /\s*\]\]\s*$/,
  /\s*"""\s*$/,
  /\s*'''\s*$/,
];

const DECORATION_ONLY = /^[\s*\/#;%'"<>{}()\[\].:+~^|&,-]+$/;

/** 1 行からコメント記号を取り除く。 */
function stripCommentLine(line: string): string {
  if (DROP_LINE.test(line)) return '';

  let value = line.replace(/\r$/, '');
  for (const marker of LEADING_MARKERS) {
    const next = value.replace(marker, '');
    if (next !== value) {
      value = next;
      break;
    }
  }
  for (const marker of TRAILING_MARKERS) {
    value = value.replace(marker, '');
  }
  value = value.trim();
  return DECORATION_ONLY.test(value) ? '' : value;
}

/**
 * コメントブロックの行を本文へ正規化する。
 * 連続する `//`、ブロックコメントの `*`、JSDoc の `/**` などを落とし、
 * 先頭・末尾の空行を除いた 1 つの文字列を返す。翻訳対象がなければ null。
 */
export function normalizeCommentLines(lines: readonly string[]): string | null {
  const cleaned = lines.map(stripCommentLine);

  while (cleaned.length > 0 && cleaned[0] === '') cleaned.shift();
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop();
  if (cleaned.length === 0) return null;

  const text = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text === '' ? null : text;
}

/** 先頭行の開始引用符（raw/b/f 接頭辞を含む）を落とす。 */
function stripOpeningQuote(line: string): string {
  return line.replace(/^\s*(?:[rRbBuUfF]{0,2})(?:"""|'''|"|'|`)/, '');
}

/** 最終行の終了引用符を落とす。 */
function stripClosingQuote(line: string): string {
  return line.replace(/(?<!\\)(?:"""|'''|"|'|`)\s*$/, '');
}

/**
 * 文字列リテラルの行を本文へ正規化する。
 * TextMate が引用符を落としている場合は何もしない。文法によって引用符が
 * 残っている場合だけ、開始引用符があると確認できたときに前後を落とす。
 */
export function normalizeStringLines(lines: readonly string[]): string | null {
  if (lines.length === 0) return null;
  const hasOpeningQuote = /^\s*(?:[rRbBuUfF]{0,2})(?:"""|'''|"|'|`)/.test(lines[0] ?? '');
  const cleaned = lines.map((line, index) => {
    let value = line.replace(/\r$/, '');
    if (hasOpeningQuote && index === 0) value = stripOpeningQuote(value);
    if (hasOpeningQuote && index === lines.length - 1) value = stripClosingQuote(value);
    return value;
  });

  while (cleaned.length > 0 && cleaned[0]?.trim() === '') cleaned.shift();
  while (cleaned.length > 0 && cleaned[cleaned.length - 1]?.trim() === '') cleaned.pop();
  if (cleaned.length === 0) return null;

  const text = cleaned.join('\n').replace(/\n{3,}/g, '\n\n');
  return text.trim() === '' ? null : text;
}
