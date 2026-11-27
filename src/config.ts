/** VSCode 設定の読み取りと、PLaMo リクエスト設定への変換。 */

import { env, workspace } from 'vscode';
import { endpointUrl, type PlamoConfig } from './plamo/client';
import { normalizeLanguageTag } from './plamo/languages';

export const CONFIG_SECTION = 'plamoCommentTranslator';
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:45871/v1';

export interface Settings {
  endpoint: string;
  model: string;
  targetLanguage: string;
  hoverEnabled: boolean;
  hoverComments: boolean;
  hoverStrings: boolean;
  hoverMarkdown: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
  addSpecialTokens: boolean;
}

export function readSettings(): Settings {
  const config = workspace.getConfiguration(CONFIG_SECTION);
  return {
    endpoint: config.get<string>('endpoint', DEFAULT_ENDPOINT),
    model: config.get<string>('model', 'plamo-3-translate'),
    targetLanguage: config.get<string>('targetLanguage', 'auto'),
    hoverEnabled: config.get<boolean>('hoverEnabled', true),
    hoverComments: config.get<boolean>('hoverComments', true),
    hoverStrings: config.get<boolean>('hoverStrings', true),
    hoverMarkdown: config.get<boolean>('hoverMarkdown', true),
    timeoutMs: clamp(config.get<number>('timeoutMs', 15_000), 1_000, 120_000),
    maxOutputTokens: clamp(config.get<number>('maxOutputTokens', 2_048), 128, 8_192),
    addSpecialTokens: config.get<boolean>('addSpecialTokens', true),
  };
}

/** endpoint を検証して PLaMo クライアント用の設定にする。 */
export function toPlamoConfig(settings: Settings): PlamoConfig {
  return {
    endpoint: endpointUrl(settings.endpoint),
    model: settings.model.trim() === '' ? 'plamo-3-translate' : settings.model.trim(),
    timeoutMs: settings.timeoutMs,
    maxOutputTokens: settings.maxOutputTokens,
    addSpecialTokens: settings.addSpecialTokens,
  };
}

/**
 * 設定値から PLaMo の言語コードを決める。
 * auto は VSCode の表示言語。未対応なら undefined を返し、呼び出し側がエラー表示する。
 */
export function resolveTargetLanguage(value: string): string | undefined {
  const tag = value === 'auto' ? env.language : value;
  return normalizeLanguageTag(tag);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
