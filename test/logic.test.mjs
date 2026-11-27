import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BlockParser,
  TextMateService,
  blockHoverMarkdown,
  endpointUrl,
  findMarkdownBlock,
  maxOutputTokens,
  normalizeCommentLines,
  normalizeLanguageTag,
  normalizeStringLines,
  pfml3Prompt,
  sanitizeText,
  stripTerminator,
  translateChunk,
  splitText,
  TranslationError,
} from '../test-build/logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = path.join(root, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');
const grammarPath = path.join(root, 'test', 'fixtures', 'test.tmLanguage.json');

let grammar;

test.before(async () => {
  const service = new TextMateService([
    {
      languages: [{ id: 2, name: 'test' }],
      value: [{ language: 'test', scopeName: 'source.test', path: grammarPath }],
      extensionLocation: root,
    },
  ], wasmPath);
  await service.initialize();
  grammar = await service.createGrammar('test');
  assert.ok(grammar, 'test grammar should load');
});

const code = [
  '// first line',
  '// second line',
  'const greeting = "Good morning";',
  '/*',
  ' * This is a block comment.',
  ' * It has two lines.',
  ' */',
  'const template = `Hello template`;',
  'const plain = 1;',
].join('\n');

function parse(line, character, options = { comments: true, strings: true, markdown: true }) {
  return new BlockParser(code, grammar, 'test').find({ line, character }, options);
}

test('normalizes consecutive line comments and strips the leading //', () => {
  assert.equal(normalizeCommentLines(['// first line', '// second line']), 'first line\nsecond line');
  assert.equal(normalizeCommentLines(['/// <summary>', '/// text', '/// </summary>']), '<summary>\ntext\n</summary>');
  assert.equal(normalizeCommentLines(['# Title', '# Body']), 'Title\nBody');
});

test('normalizes block comments and JSDoc decoration', () => {
  assert.equal(normalizeCommentLines(['/*', ' * one', ' * two', ' */']), 'one\ntwo');
  assert.equal(
    normalizeCommentLines(['/**', ' * @param x - value', ' * @returns result', ' */']),
    '@param x - value\n@returns result',
  );
  assert.equal(normalizeCommentLines(['<!--', ' hello', ' -->']), 'hello');
});

test('handles other comment syntaxes', () => {
  assert.equal(normalizeCommentLines(["'Hello"]), 'Hello');
  assert.equal(normalizeCommentLines(['--[[', 'Lua block', ']]']), 'Lua block');
  assert.equal(normalizeCommentLines(['(*', 'OCaml comment', '*)']), 'OCaml comment');
  assert.equal(normalizeCommentLines(['=begin', 'Ruby comment', '=end']), 'Ruby comment');
  assert.equal(normalizeCommentLines(['"""', 'Docstring', '"""']), 'Docstring');
});

test('keeps emphasis and URLs inside comments', () => {
  assert.equal(normalizeCommentLines(['// *important*']), '*important*');
  assert.equal(normalizeCommentLines(['// https://example.com/a//b']), 'https://example.com/a//b');
  assert.equal(normalizeCommentLines(['// C:\\path\\to\\file']), 'C:\\path\\to\\file');
});

test('returns null when nothing is left to translate', () => {
  assert.equal(normalizeCommentLines([]), null);
  assert.equal(normalizeCommentLines(['/**', ' */']), null);
  assert.equal(normalizeCommentLines(['#', '//', '--', '']), null);
});

test('normalizes string quotes without touching the body', () => {
  assert.equal(normalizeStringLines(['"Hello"']), 'Hello');
  assert.equal(normalizeStringLines(['`Hello template`']), 'Hello template');
  assert.equal(normalizeStringLines(['`', 'line one', 'line two', '`']), 'line one\nline two');
  assert.equal(normalizeStringLines(['"It\'s fine"']), "It's fine");
  assert.equal(normalizeStringLines(['"  spaced  "']), '  spaced  ');
  assert.equal(normalizeStringLines(['', '']), null);
});

test('does not strip quotes that are part of already-normalized content', () => {
  assert.equal(normalizeStringLines(["He said 'hi'"]), "He said 'hi'");
  assert.equal(normalizeStringLines(['He said \\"hi\\"']), 'He said \\"hi\\"');
  assert.equal(normalizeStringLines(['"He said \'hi\'"']), "He said 'hi'");
});

test('splits long text on line boundaries without losing content', () => {
  const text = ['line one', 'line two', 'line three'].join('\n');
  const chunks = splitText(text, 12);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join('\n'), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 12));
  assert.deepEqual(splitText('short', 100), ['short']);
});

test('parses a hovered line comment as one multi-line block', () => {
  const block = parse(0, 3);
  assert.ok(block);
  assert.equal(block.kind, 'comment');
  assert.equal(block.text, 'first line\nsecond line');
  assert.deepEqual(block.range.start, { line: 0, character: 0 });
  assert.deepEqual(block.range.end, { line: 1, character: 14 });
});

test('parses a hovered block comment and strips * and closing */', () => {
  const block = parse(4, 5);
  assert.ok(block);
  assert.equal(block.kind, 'comment');
  assert.equal(block.text, 'This is a block comment.\nIt has two lines.');
  assert.deepEqual(block.range.start, { line: 3, character: 0 });
  assert.deepEqual(block.range.end, { line: 6, character: 3 });
});

test('parses a hovered quoted string and template literal', () => {
  const quoted = parse(2, 20);
  assert.ok(quoted);
  assert.equal(quoted.kind, 'string');
  assert.equal(quoted.text, 'Good morning');

  const template = parse(7, 20);
  assert.ok(template);
  assert.equal(template.kind, 'string');
  assert.equal(template.text, 'Hello template');
});

test('returns null for code and honors the hover switches', () => {
  assert.equal(parse(8, 7), null);
  assert.equal(parse(0, 3, { comments: false, strings: true, markdown: true }), null);
  assert.equal(parse(2, 20, { comments: true, strings: false, markdown: true }), null);
});

function token(startIndex, endIndex, ...scopes) {
  return { startIndex, endIndex, scopes: ['text.html.markdown', ...scopes] };
}

function mdLine(text, tokens) {
  return { text, tokens };
}

const blankLine = mdLine('', []);

function markdownDoc(...lines) {
  return {
    languageId: 'markdown',
    lineCount: lines.length,
    lineText: (line) => lines[line]?.text ?? '',
    tokens: (line) => lines[line]?.tokens ?? [],
  };
}

function paragraphLine(text) {
  return mdLine(text, [token(0, text.length, 'meta.paragraph.markdown')]);
}

function headingLine(text) {
  const hashes = text.match(/^#+\s+/)?.[0].length ?? 0;
  return mdLine(text, [
    token(0, hashes, 'markup.heading.markdown', 'punctuation.definition.heading.markdown'),
    token(hashes, text.length, 'markup.heading.markdown', 'entity.name.section.markdown'),
  ]);
}

function listLine(marker, text) {
  return mdLine(marker + ' ' + text, [
    token(0, marker.length, 'markup.list.unnumbered.markdown', 'punctuation.definition.list.begin.markdown'),
    token(marker.length, marker.length + 1, 'markup.list.unnumbered.markdown'),
    token(marker.length + 1, marker.length + 1 + text.length, 'meta.paragraph.markdown'),
  ]);
}

function quoteLine(text) {
  return mdLine('> ' + text, [
    token(0, 1, 'markup.quote.markdown', 'punctuation.definition.quote.begin.markdown'),
    token(1, 2, 'markup.quote.markdown'),
    token(2, 2 + text.length, 'meta.paragraph.markdown'),
  ]);
}

test('translates a markdown heading without the leading hashes', () => {
  const doc = markdownDoc(
    headingLine('# Heading one'),
    blankLine,
    paragraphLine('Body text.'),
  );

  const block = findMarkdownBlock(doc, { line: 0, character: 4 });
  assert.ok(block);
  assert.equal(block.kind, 'markdown');
  assert.equal(block.text, 'Heading one');
  assert.deepEqual(block.range.start, { line: 0, character: 2 });
  assert.deepEqual(block.range.end, { line: 0, character: 13 });
});

test('joins a multi-line paragraph and keeps inline markup', () => {
  const first = paragraphLine('A paragraph with **bold** and `code`.');
  const second = paragraphLine('Second line of the paragraph.');
  const doc = markdownDoc(first, second, blankLine, paragraphLine('Another paragraph.'));

  const block = findMarkdownBlock(doc, { line: 0, character: 3 });
  assert.ok(block);
  assert.equal(block.text, 'A paragraph with **bold** and `code`.\nSecond line of the paragraph.');
  assert.deepEqual(block.range.start, { line: 0, character: 0 });
  assert.deepEqual(block.range.end, { line: 1, character: second.text.length });

  const other = findMarkdownBlock(doc, { line: 3, character: 3 });
  assert.ok(other);
  assert.equal(other.text, 'Another paragraph.');
});

test('translates a paragraph inside inline code as the whole paragraph', () => {
  const doc = markdownDoc(paragraphLine('Use `plamoCommentTranslator.endpoint` here.'));
  const block = findMarkdownBlock(doc, { line: 0, character: 8 });
  assert.ok(block);
  assert.equal(block.text, 'Use `plamoCommentTranslator.endpoint` here.');
});

test('splits list items at their markers and keeps wrapped lines', () => {
  const doc = markdownDoc(
    listLine('-', 'first item'),
    mdLine('  wrapped line', [
      token(0, 2, 'markup.list.unnumbered.markdown'),
      token(2, 15, 'meta.paragraph.markdown'),
    ]),
    listLine('-', 'second item'),
  );

  const first = findMarkdownBlock(doc, { line: 0, character: 5 });
  assert.ok(first);
  assert.equal(first.text, 'first item\nwrapped line');
  assert.deepEqual(first.range.start, { line: 0, character: 2 });
  assert.deepEqual(first.range.end, { line: 1, character: 15 });

  const second = findMarkdownBlock(doc, { line: 2, character: 5 });
  assert.ok(second);
  assert.equal(second.text, 'second item');

  const wrapped = findMarkdownBlock(doc, { line: 1, character: 4 });
  assert.ok(wrapped);
  assert.equal(wrapped.text, 'first item\nwrapped line');
});

test('joins blockquote lines without the quote markers', () => {
  const doc = markdownDoc(
    quoteLine('Quoted line'),
    quoteLine('continues here.'),
    blankLine,
    paragraphLine('Outside the quote.'),
  );

  const block = findMarkdownBlock(doc, { line: 0, character: 5 });
  assert.ok(block);
  assert.equal(block.text, 'Quoted line\ncontinues here.');
  assert.deepEqual(block.range.start, { line: 0, character: 2 });
  assert.deepEqual(block.range.end, { line: 1, character: 17 });
});

test('translates one table cell and skips the delimiter row', () => {
  const header = mdLine('| Name | Value |', [
    token(0, 1, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
    token(1, 2, 'markup.table.markdown'),
    token(2, 6, 'markup.table.markdown'),
    token(6, 7, 'markup.table.markdown'),
    token(7, 8, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
    token(8, 9, 'markup.table.markdown'),
    token(9, 14, 'markup.table.markdown'),
    token(14, 15, 'markup.table.markdown'),
    token(15, 16, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
  ]);
  const delimiter = mdLine('| --- | --- |', [
    token(0, 1, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
    token(1, 2, 'markup.table.markdown'),
    token(2, 5, 'markup.table.markdown', 'punctuation.separator.table.markdown'),
    token(5, 6, 'markup.table.markdown'),
    token(6, 7, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
    token(7, 8, 'markup.table.markdown'),
    token(8, 11, 'markup.table.markdown', 'punctuation.separator.table.markdown'),
    token(11, 12, 'markup.table.markdown'),
    token(12, 13, 'markup.table.markdown', 'punctuation.definition.table.markdown'),
  ]);
  const doc = markdownDoc(header, delimiter);

  const cell = findMarkdownBlock(doc, { line: 0, character: 4 });
  assert.ok(cell);
  assert.equal(cell.text, 'Name');
  assert.deepEqual(cell.range.start, { line: 0, character: 2 });
  assert.deepEqual(cell.range.end, { line: 0, character: 6 });

  const second = findMarkdownBlock(doc, { line: 0, character: 10 });
  assert.ok(second);
  assert.equal(second.text, 'Value');

  assert.equal(findMarkdownBlock(doc, { line: 1, character: 3 }), null);
});

test('ignores markdown code blocks, separators, and non-markdown tokens', () => {
  const fence = mdLine('```ts', [
    token(0, 3, 'markup.fenced_code.block.markdown', 'punctuation.definition.markdown'),
    token(3, 5, 'markup.fenced_code.block.markdown', 'fenced_code.block.language'),
  ]);
  const code = mdLine('const x = 1;', [token(0, 12, 'markup.fenced_code.block.markdown')]);
  const doc = markdownDoc(fence, code, blankLine, mdLine('---', [
    token(0, 3, 'meta.separator.markdown'),
  ]));

  assert.equal(findMarkdownBlock(doc, { line: 0, character: 1 }), null);
  assert.equal(findMarkdownBlock(doc, { line: 1, character: 4 }), null);
  assert.equal(findMarkdownBlock(doc, { line: 3, character: 1 }), null);

  const plain = markdownDoc(mdLine('plain text', [
    { startIndex: 0, endIndex: 10, scopes: ['source.plain'] },
  ]));
  assert.equal(findMarkdownBlock(plain, { line: 0, character: 2 }), null);
});

test('treats setext headings as their own block', () => {
  const doc = markdownDoc(
    paragraphLine('Paragraph before.'),
    paragraphLine('Setext heading'),
    mdLine('===', [token(0, 3, 'markup.heading.setext.1.markdown', 'meta.paragraph.markdown')]),
  );

  const text = findMarkdownBlock(doc, { line: 0, character: 2 });
  assert.ok(text);
  assert.equal(text.text, 'Paragraph before.');

  const heading = findMarkdownBlock(doc, { line: 1, character: 3 });
  assert.ok(heading);
  assert.equal(heading.text, 'Setext heading');

  const underline = findMarkdownBlock(doc, { line: 2, character: 1 });
  assert.ok(underline);
  assert.equal(underline.text, 'Setext heading');
});

test('does not merge a paragraph with a following quote or list', () => {
  const doc = markdownDoc(
    paragraphLine('Paragraph before.'),
    quoteLine('Quoted text.'),
    paragraphLine('Paragraph again.'),
    listLine('-', 'list item'),
  );

  const paragraph = findMarkdownBlock(doc, { line: 0, character: 2 });
  assert.ok(paragraph);
  assert.equal(paragraph.text, 'Paragraph before.');

  const quote = findMarkdownBlock(doc, { line: 1, character: 3 });
  assert.ok(quote);
  assert.equal(quote.text, 'Quoted text.');

  const beforeList = findMarkdownBlock(doc, { line: 2, character: 3 });
  assert.ok(beforeList);
  assert.equal(beforeList.text, 'Paragraph again.');

  const listItem = findMarkdownBlock(doc, { line: 3, character: 3 });
  assert.ok(listItem);
  assert.equal(listItem.text, 'list item');
});

test('renders markdown translations without a code fence and other blocks fenced', () => {
  const markdown = blockHoverMarkdown(
    { kind: 'markdown', text: 'src', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, languageId: 'markdown' },
    '**翻訳**',
    'ja',
  );
  assert.match(markdown, /Markdown · 自動 → 日本語/);
  assert.match(markdown, /\*\*翻訳\*\*/);
  assert.ok(!markdown.includes('```markdown'));

  const comment = blockHoverMarkdown(
    { kind: 'comment', text: 'src', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, languageId: 'typescript' },
    '翻訳',
    'ja',
  );
  assert.match(comment, /コメント · 自動 → 日本語/);
  assert.match(comment, /```typescript\n翻訳\n```/);

  const selection = blockHoverMarkdown(
    { kind: 'selection', text: 'src', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, languageId: 'typescript' },
    '翻訳',
    'ja',
  );
  assert.match(selection, /選択範囲 · 自動 → 日本語/);
  assert.match(selection, /```typescript\n翻訳\n```/);

  const markdownSelection = blockHoverMarkdown(
    { kind: 'selection', text: 'src', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, languageId: 'markdown' },
    '翻訳',
    'ja',
  );
  assert.match(markdownSelection, /選択範囲 · 自動 → 日本語/);
  assert.ok(!markdownSelection.includes('```markdown'));
});

test('builds the PFML3 prompt and strips stop tokens', () => {
  assert.equal(
    pfml3Prompt('Hello', 'ja'),
    '<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:msg|>Hello'
      + '<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>',
  );
  assert.equal(sanitizeText('a\r\nb\u0000<|plamo:tag|>'), 'a\nb＜|plamo:tag|>');
  assert.equal(stripTerminator(' こんにちは <|plamo:tag|>'), ' こんにちは');
  assert.equal(stripTerminator('ok<|plamo:tag|><|plamo:bos|>'), 'ok');
  assert.ok(maxOutputTokens('x'.repeat(2_000), 2_048) <= 2_048);
});

test('normalizes language tags for PLaMo', () => {
  assert.equal(normalizeLanguageTag('ja'), 'ja');
  assert.equal(normalizeLanguageTag('ja-JP'), 'ja');
  assert.equal(normalizeLanguageTag('zh-CN'), 'zh-hans');
  assert.equal(normalizeLanguageTag('zh-TW'), 'zh-hant');
  assert.equal(normalizeLanguageTag('fr-CA'), 'fr');
  assert.equal(normalizeLanguageTag('auto'), undefined);
  assert.equal(normalizeLanguageTag('xx'), undefined);
});

test('validates the endpoint URL', () => {
  assert.equal(endpointUrl('http://127.0.0.1:45871/v1/'), 'http://127.0.0.1:45871/v1');
  assert.throws(() => endpointUrl('ftp://127.0.0.1/v1'));
  assert.throws(() => endpointUrl('http://user:pass@127.0.0.1/v1'));
  assert.throws(() => endpointUrl('http://127.0.0.1/v1#fragment'));
});

async function withServer(handler, body) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no server port');
  try {
    return await body(address.port);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('posts a PFML3 completion request and parses the response', async () => {
  let seen;
  await withServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    seen = {
      url: request.url,
      method: request.method,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ text: ' こんにちは<|plamo:tag|>', finish_reason: 'stop' }],
    }));
  }, async (port) => {
    const translated = await translateChunk({
      endpoint: `http://127.0.0.1:${port}/v1`,
      model: 'plamo-3-translate',
      timeoutMs: 5_000,
      maxOutputTokens: 1_024,
      addSpecialTokens: true,
    }, 'Hello', 'ja');
    assert.equal(translated, 'こんにちは');
  });

  assert.equal(seen.url, '/v1/completions');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.body.model, 'plamo-3-translate');
  assert.match(seen.body.prompt, /<\|plamo:val\|>ja/);
  assert.deepEqual(seen.body.stop, ['<|plamo:tag|>', '<|plamo:bos|>']);
  assert.equal(seen.body.add_special_tokens, true);
  assert.equal(seen.body.temperature, 0);
  assert.ok(seen.body.max_tokens >= 256);
});

test('classifies HTTP, invalid, empty, and truncated responses', async () => {
  const config = (port) => ({
    endpoint: `http://127.0.0.1:${port}/v1`,
    model: 'plamo-3-translate',
    timeoutMs: 5_000,
    maxOutputTokens: 1_024,
    addSpecialTokens: true,
  });

  await withServer((_request, response) => {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('server error');
  }, async (port) => {
    await assert.rejects(translateChunk(config(port), 'Hello', 'ja'), (error) => {
      assert.ok(error instanceof TranslationError);
      assert.equal(error.code, 'http');
      return true;
    });
  });

  await withServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('not json');
  }, async (port) => {
    await assert.rejects(translateChunk(config(port), 'Hello', 'ja'), (error) => {
      assert.equal(error.code, 'invalid');
      return true;
    });
  });

  await withServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ text: '   ', finish_reason: 'stop' }] }));
  }, async (port) => {
    await assert.rejects(translateChunk(config(port), 'Hello', 'ja'), (error) => {
      assert.equal(error.code, 'empty');
      return true;
    });
  });

  await withServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ text: 'partial', finish_reason: 'length' }] }));
  }, async (port) => {
    await assert.rejects(translateChunk(config(port), 'Hello', 'ja'), (error) => {
      assert.equal(error.code, 'truncated');
      return true;
    });
  });
});

test('classifies unreachable and timeout failures', async () => {
  await assert.rejects(translateChunk({
    endpoint: 'http://127.0.0.1:1/v1',
    model: 'plamo-3-translate',
    timeoutMs: 2_000,
    maxOutputTokens: 1_024,
    addSpecialTokens: true,
  }, 'Hello', 'ja'), (error) => {
    assert.equal(error.code, 'unreachable');
    return true;
  });

  await withServer(() => {
    // Intentionally never responds.
  }, async (port) => {
    await assert.rejects(translateChunk({
      endpoint: `http://127.0.0.1:${port}/v1`,
      model: 'plamo-3-translate',
      timeoutMs: 100,
      maxOutputTokens: 1_024,
      addSpecialTokens: true,
    }, 'Hello', 'ja'), (error) => {
      assert.equal(error.code, 'timeout');
      return true;
    });
  });
});
