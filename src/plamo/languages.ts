/** PLaMo 3 Translate が出力できる 53 言語のコードと BCP 47 の正規化。 */

const SUPPORTED = new Set([
  'ja', 'en', 'ko', 'ar', 'az', 'be', 'bg', 'bn', 'ca', 'ceb', 'de', 'es', 'et', 'eu', 'fa', 'fr',
  'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'it', 'jv', 'ka', 'kk', 'km', 'lt', 'lv', 'ml', 'mr',
  'ms', 'my', 'ne', 'nl', 'pa', 'pl', 'ru', 'si', 'sk', 'sl', 'sr', 'sw', 'ta', 'te', 'th', 'tl',
  'ur', 'uz', 'vi',
]);

export const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  ja: '日本語',
  en: '英語',
  ko: '韓国語',
  ar: 'アラビア語',
  az: 'アゼルバイジャン語',
  be: 'ベラルーシ語',
  bg: 'ブルガリア語',
  bn: 'ベンガル語',
  ca: 'カタルーニャ語',
  ceb: 'セブアノ語',
  de: 'ドイツ語',
  es: 'スペイン語',
  et: 'エストニア語',
  eu: 'バスク語',
  fa: 'ペルシア語',
  fr: 'フランス語',
  gu: 'グジャラート語',
  he: 'ヘブライ語',
  hi: 'ヒンディー語',
  hr: 'クロアチア語',
  hu: 'ハンガリー語',
  hy: 'アルメニア語',
  id: 'インドネシア語',
  it: 'イタリア語',
  jv: 'ジャワ語',
  ka: 'ジョージア語',
  kk: 'カザフ語',
  km: 'クメール語',
  lt: 'リトアニア語',
  lv: 'ラトビア語',
  ml: 'マラヤーラム語',
  mr: 'マラーティー語',
  ms: 'マレー語',
  my: 'ミャンマー語',
  ne: 'ネパール語',
  nl: 'オランダ語',
  pa: 'パンジャブ語',
  pl: 'ポーランド語',
  ru: 'ロシア語',
  si: 'シンハラ語',
  sk: 'スロバキア語',
  sl: 'スロベニア語',
  sr: 'セルビア語',
  sw: 'スワヒリ語',
  ta: 'タミル語',
  te: 'テルグ語',
  th: 'タイ語',
  tl: 'タガログ語',
  ur: 'ウルドゥー語',
  uz: 'ウズベク語',
  vi: 'ベトナム語',
  'zh-hans': '中国語（簡体字）',
  'zh-hant': '中国語（繁体字）',
};

/**
 * BCP 47 のタグを PLaMo の言語コードへ落とす。
 * 中国語だけはモデルが簡体字と繁体字を区別するため、スクリプトまで残す。
 */
export function normalizeLanguageTag(tag: string): string | undefined {
  const lower = tag.trim().toLowerCase();
  if (lower === '' || lower === 'auto') return undefined;
  if (lower.startsWith('zh-hant') || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') {
    return 'zh-hant';
  }
  if (lower.startsWith('zh')) return 'zh-hans';
  const primary = lower.split('-')[0];
  return primary !== undefined && SUPPORTED.has(primary) ? primary : undefined;
}

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}
