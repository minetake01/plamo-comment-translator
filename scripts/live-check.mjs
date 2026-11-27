/** 実際に動いている PLaMo 3 Translate へ、この実装の PFML3 をそのまま投げる。 */

import { translateChunk } from '../test-build/logic.mjs';

const endpoint = process.env.PLAMO_ENDPOINT ?? 'http://127.0.0.1:45871/v1';
const config = {
  endpoint,
  model: process.env.PLAMO_MODEL ?? 'plamo-3-translate',
  timeoutMs: 30_000,
  maxOutputTokens: 2_048,
  addSpecialTokens: true,
};

const samples = [
  "Returns the user's display name.",
  'This function calculates the total price.\nIt includes tax and shipping.',
  'Good morning, everyone',
];

for (const sample of samples) {
  const started = Date.now();
  try {
    const translated = await translateChunk(config, sample, 'ja');
    console.log(`\n[${Date.now() - started}ms] ${JSON.stringify(sample)}`);
    console.log(`  -> ${JSON.stringify(translated)}`);
  } catch (error) {
    console.error(`\nFAILED ${JSON.stringify(sample)}`);
    console.error(error);
    process.exitCode = 1;
  }
}
