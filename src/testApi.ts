/** テストから VSCode 抜きで読み込むための純粋ロジックの再エクスポート。 */

export { endpointUrl, translateChunk, type PlamoConfig } from './plamo/client';
export { TranslationError, describeTranslationError } from './plamo/errors';
export { languageLabel, normalizeLanguageTag } from './plamo/languages';
export {
  maxOutputTokens,
  pfml3Prompt,
  sanitizeText,
  STOP_TOKENS,
  stripTerminator,
} from './plamo/prompt';
export {
  findLeadingWhitespaceOrUnpairedIndex,
  normalizeCommentLines,
  normalizeStringLines,
} from './syntax/commentText';
export {
  BlockParser,
  isCommentScope,
  isStringScope,
} from './syntax/blockParser';
export { findMarkdownBlock, isMarkdownScopes } from './syntax/markdown';
export { TextMateService } from './syntax/textmate';
export { blockHoverMarkdown, fenced } from './translationView';
export { splitText } from './translator';
export type {
  BlockKind,
  GrammarContribution,
  GrammarExtension,
  MarkdownSource,
  PlainPosition,
  SyntaxBlock,
  TokenSpan,
} from './syntax/types';
