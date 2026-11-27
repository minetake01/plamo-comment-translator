/** PLaMo 3 Translate の OpenAI 互換 /completions を 1 回呼ぶ。 */

import { TranslationError } from './errors';
import { maxOutputTokens, pfml3Prompt, STOP_TOKENS, stripTerminator } from './prompt';

export interface PlamoConfig {
  /** 末尾スラッシュを除いた OpenAI 互換ベース URL。 */
  endpoint: string;
  /** サーバーの --served-model-name。 */
  model: string;
  /** 1 リクエストの上限時間。 */
  timeoutMs: number;
  /** max_tokens の上限。 */
  maxOutputTokens: number;
  /** vLLM は true、BOS を自動付与するサーバーは false。 */
  addSpecialTokens: boolean;
}

interface CompletionChoice {
  text?: unknown;
  finish_reason?: unknown;
}

/** 設定値を検証し、末尾スラッシュを落としたベース URL を返す。 */
export function endpointUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '' || url.hash !== '') {
    throw new Error('PLaMo の endpoint は資格情報やフラグメントを含まない HTTP(S) URL である必要があります');
  }
  return url.href.replace(/\/+$/, '');
}

/**
 * 1 フラグメントを翻訳する。
 * 呼び出し側がチャンク分割とキャッシュを持つため、ここでは再試行しない。
 */
export async function translateChunk(
  config: PlamoConfig,
  text: string,
  targetLanguage: string,
): Promise<string> {
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const body = {
    model: config.model,
    prompt: pfml3Prompt(text, targetLanguage),
    temperature: 0,
    max_tokens: maxOutputTokens(text, config.maxOutputTokens),
    stop: [...STOP_TOKENS],
    add_special_tokens: config.addSpecialTokens,
  };

  let response: Response;
  try {
    response = await fetch(`${config.endpoint}/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeout,
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new TranslationError('timeout', `after ${config.timeoutMs}ms`);
    }
    throw new TranslationError('unreachable', config.endpoint, error instanceof Error ? error.message : undefined);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    const detail = rawBody.slice(0, 300).replace(/\s+/g, ' ').trim();
    throw new TranslationError('http', `HTTP ${response.status}`, detail);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    throw new TranslationError('invalid', 'JSON ではありません');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new TranslationError('invalid', 'レスポンスがオブジェクトではありません');
  }
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TranslationError('invalid', 'choices が空です');
  }
  const choice = choices[0] as CompletionChoice;
  if (typeof choice.text !== 'string') {
    throw new TranslationError('invalid', 'completion text がありません');
  }
  if (choice.finish_reason === 'length') {
    throw new TranslationError('truncated', 'finish_reason=length');
  }

  const translated = stripTerminator(choice.text).trim();
  if (translated === '') {
    throw new TranslationError('empty', '翻訳結果が空です');
  }
  return translated;
}
