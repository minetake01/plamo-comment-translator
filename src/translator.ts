/** 長いコメントを分割し、キャッシュ越しに PLaMo へ渡す。 */

import type { OutputChannel } from 'vscode';
import { translateChunk, type PlamoConfig } from './plamo/client';
import { describeTranslationError } from './plamo/errors';
import { PROMPT_REVISION } from './plamo/prompt';
import type { TranslationCache } from './translationCache';

const CHUNK_CHARS = 2_000;

export class PlamoTranslator {
  constructor(
    private readonly cache: TranslationCache,
    private readonly output: OutputChannel,
  ) {}

  async translate(text: string, targetLanguage: string, config: PlamoConfig): Promise<string> {
    const key = JSON.stringify([
      PROMPT_REVISION,
      config.endpoint,
      config.model,
      config.addSpecialTokens,
      targetLanguage,
      text,
    ]);

    return this.cache.get(key, async () => {
      const chunks = splitText(text, CHUNK_CHARS);
      const translatedChunks: string[] = [];
      for (const chunk of chunks) {
        const started = Date.now();
        try {
          const translated = await translateChunk(config, chunk, targetLanguage);
          this.output.appendLine(
            `[translate] ${targetLanguage} ${chunk.length} chars -> ${translated.length} chars (${Date.now() - started}ms)`,
          );
          translatedChunks.push(translated);
        } catch (error) {
          this.output.appendLine(`[translate] failed: ${describeTranslationError(error)}`);
          throw error;
        }
      }
      return translatedChunks.join('\n');
    });
  }
}

/** 行境界を優先して maxChars 以下に切る。1 行が長すぎる場合はその行の途中で切る。 */
export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars);
    if (cut < Math.floor(maxChars / 2)) cut = maxChars;
    const chunk = rest.slice(0, cut).trim();
    if (chunk !== '') chunks.push(chunk);
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  const tail = rest.trim();
  if (tail !== '') chunks.push(tail);
  return chunks;
}
