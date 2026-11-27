/** PFML3（PLaMo 3 Translate のプロンプト形式）の組み立てと応答の検証。 */

/** 翻訳が終わったことを示す制御トークン。 */
export const STOP_TOKENS = ['<|plamo:tag|>', '<|plamo:bos|>'] as const;

/** プロンプト形式を変えたら上げる。キャッシュキーにも含める。 */
export const PROMPT_REVISION = 'pfml3-v1';

/**
 * 制御トークンと NUL を入力から追い出す。
 * コメントや文字列に `<|plamo:...|>` が現れてもプロンプト構造を壊さない。
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/<\|plamo:/g, '＜|plamo:')
    .replace(/\r\n?/g, '\n');
}

/**
 * 1 フラグメント分の PFML3 プロンプトを作る。
 * 原文言語は指定せず、PLaMo 側の自動判定に任せる。
 */
export function pfml3Prompt(text: string, targetLanguage: string): string {
  return '<|plamo:tag|>dataset<|plamo:msg|>translation'
    + '<|plamo:tag|>input'
    + `<|plamo:msg|>${sanitizeText(text)}`
    + `<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>${targetLanguage}`
    + '<|plamo:msg|>';
}

/** 入力長から出力トークン上限を見積もる。 */
export function maxOutputTokens(text: string, cap: number): number {
  const estimated = Math.ceil(text.length * 1.2) + 128;
  return Math.max(256, Math.min(cap, estimated));
}

/** モデルが末尾に付ける終端トークンと空白を取り除く。 */
export function stripTerminator(text: string): string {
  let output = text;
  for (;;) {
    const trimmed = output.replace(/\s+$/, '');
    const token = STOP_TOKENS.find((candidate) => trimmed.endsWith(candidate));
    if (token === undefined) return trimmed;
    output = trimmed.slice(0, -token.length);
  }
}
