/** PLaMo 呼び出しの失敗をホバー表示用の短い理由に分類する。 */

export type TranslationErrorCode =
  | 'unreachable'
  | 'timeout'
  | 'http'
  | 'invalid'
  | 'truncated'
  | 'empty'
  | 'unsupported-language';

export class TranslationError extends Error {
  override readonly name = 'TranslationError';

  constructor(
    readonly code: TranslationErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export function describeTranslationError(error: unknown): string {
  if (error instanceof TranslationError) {
    switch (error.code) {
      case 'unreachable':
        return `PLaMo サーバーに接続できません（${error.message}）`;
      case 'timeout':
        return 'PLaMo の応答がタイムアウトしました';
      case 'http':
        return `PLaMo サーバーが HTTP エラーを返しました（${error.message}）`;
      case 'invalid':
        return `PLaMo の応答を解釈できません（${error.message}）`;
      case 'truncated':
        return '翻訳が出力トークン上限に達しました';
      case 'empty':
        return 'PLaMo が空の翻訳を返しました';
      case 'unsupported-language':
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
