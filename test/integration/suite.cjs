const assert = require('node:assert/strict');
const vscode = require('vscode');

/**
 * 実際の VSCode 拡張ホストで、コメント・複数行コメント・文字列・Markdown のホバーと、
 * 選択範囲のホバー翻訳を確認する。PLaMo が 127.0.0.1:45871 で動いていることが前提。
 */
exports.run = async function run() {
  const extension = vscode.extensions.getExtension('minetake01.plamo-comment-translator');
  assert.ok(extension, 'PLaMo Comment Translator が開発ホストに読み込まれていません');

  // onStartupFinished による自動起動を確認する。activate() を直接呼ばない。
  const deadline = Date.now() + 10_000;
  while (!extension.isActive && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(extension.isActive, '拡張が onStartupFinished で起動していません');

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'テスト用ワークスペースが開かれていません');
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, 'sample.ts'),
  );
  await vscode.window.showTextDocument(document);

  const hover = async (target, line, character) => {
    const result = await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      target.uri,
      new vscode.Position(line, character),
    );
    const hovers = result ?? [];
    return {
      text: hovers
        .flatMap((item) => item.contents)
        .map((content) => (typeof content === 'string' ? content : content.value))
        .join('\n'),
      hovers,
      range: hovers
        .filter((item) => item.contents.some((content) => (typeof content === 'string' ? content : content.value).includes('PLaMo 3 Translate')))
        .at(0)?.range,
    };
  };

  const lineComment = await hover(document, 0, 5);
  console.log('[integration] line comment:', lineComment.text);
  assert.match(lineComment.text, /PLaMo 3 Translate/);
  assert.match(lineComment.text, /[\u3040-\u30ff]/, '行コメントが日本語に翻訳されていません');
  assert.ok(!lineComment.text.includes('// Returns'), '行コメントの // が残っています');
  assert.equal(lineComment.hovers[0]?.range.start.line, 0);
  assert.equal(lineComment.hovers[0]?.range.end.line, 1, '連続する // が 1 ブロックになっていません');

  const blockComment = await hover(document, 4, 5);
  console.log('[integration] block comment:', blockComment.text);
  assert.match(blockComment.text, /PLaMo 3 Translate/);
  assert.match(blockComment.text, /[\u3040-\u30ff]/, 'ブロックコメントが日本語に翻訳されていません');
  assert.ok(!blockComment.text.includes('* This'), 'ブロックコメントの * が残っています');
  assert.equal(blockComment.hovers[0]?.range.start.line, 3);
  assert.equal(blockComment.hovers[0]?.range.end.line, 6);

  const stringLiteral = await hover(document, 2, 25);
  console.log('[integration] string:', stringLiteral.text);
  assert.match(stringLiteral.text, /PLaMo 3 Translate/);
  assert.match(stringLiteral.text, /[\u3040-\u30ff]/, '文字列が日本語に翻訳されていません');
  assert.ok(!stringLiteral.text.includes('"Good morning'), '文字列の引用符が残っています');

  const code = await hover(document, 8, 10);
  assert.ok(!code.text.includes('PLaMo 3 Translate'), '通常のコードでホバーが出ています');

  // Python: # コメントと docstring（"""）も同じ経路で確認する。
  const python = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, 'sample.py'),
  );
  await vscode.window.showTextDocument(python);

  const hashComment = await hover(python, 0, 5);
  console.log('[integration] python # comment:', hashComment.text);
  assert.match(hashComment.text, /[\u3040-\u30ff]/, 'Python の # コメントが翻訳されていません');
  assert.ok(!hashComment.text.includes('# Returns'), 'Python コメントの # が残っています');

  const docstring = await hover(python, 5, 6);
  console.log('[integration] python docstring:', docstring.text);
  assert.match(docstring.text, /[\u3040-\u30ff]/, 'Python docstring が翻訳されていません');
  assert.ok(!docstring.text.includes('"""'), 'docstring の引用符が残っています');

  // Markdown: 見出し・段落・リスト・引用・表のセルを本文として扱う。
  const markdown = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, 'sample.md'),
  );
  await vscode.window.showTextDocument(markdown);

  const heading = await hover(markdown, 0, 4);
  console.log('[integration] markdown heading:', heading.text);
  assert.match(heading.text, /PLaMo 3 Translate/);
  assert.match(heading.text, /Markdown · 自動 → 日本語/);
  assert.match(heading.text, /[\u3040-\u30ff]/, 'Markdown の見出しが翻訳されていません');
  assert.ok(!heading.text.includes('# Sample'), '見出しの # が残っています');
  assert.equal(heading.hovers[0]?.range.start.line, 0);
  assert.equal(heading.hovers[0]?.range.start.character, 2);

  const paragraph = await hover(markdown, 2, 5);
  console.log('[integration] markdown paragraph:', paragraph.text);
  assert.match(paragraph.text, /[\u3040-\u30ff]/, 'Markdown の段落が翻訳されていません');
  assert.equal(paragraph.hovers[0]?.range.start.line, 2);
  assert.equal(paragraph.hovers[0]?.range.end.line, 3, '複数行の段落が 1 ブロックになっていません');

  const listItem = await hover(markdown, 5, 4);
  console.log('[integration] markdown list item:', listItem.text);
  assert.match(listItem.text, /[\u3040-\u30ff]/, 'Markdown のリスト項目が翻訳されていません');
  assert.equal(listItem.hovers[0]?.range.start.character, 2);
  assert.equal(listItem.hovers[0]?.range.start.line, 5);
  assert.equal(listItem.hovers[0]?.range.end.line, 5, 'リスト項目が 2 件まとめて翻訳されています');

  const quote = await hover(markdown, 8, 4);
  console.log('[integration] markdown quote:', quote.text);
  assert.match(quote.text, /[\u3040-\u30ff]/, 'Markdown の引用が翻訳されていません');
  assert.equal(quote.hovers[0]?.range.start.line, 8);
  assert.equal(quote.hovers[0]?.range.end.line, 9);

  const cell = await hover(markdown, 13, 4);
  console.log('[integration] markdown table cell:', cell.text);
  assert.match(cell.text, /[\u3040-\u30ff]/, 'Markdown の表のセルが翻訳されていません');
  assert.equal(cell.hovers[0]?.range.start.line, 13);
  assert.equal(cell.hovers[0]?.range.start.character, 2);

  const fencedComment = await hover(markdown, 16, 5);
  console.log('[integration] markdown fenced comment:', fencedComment.text);
  assert.match(fencedComment.text, /[\u3040-\u30ff]/, 'フェンス内のコメントが翻訳されていません');

  const fencedString = await hover(markdown, 17, 20);
  console.log('[integration] markdown fenced string:', fencedString.text);
  assert.match(fencedString.text, /[\u3040-\u30ff]/, 'フェンス内の文字列が翻訳されていません');

  const fencedCode = await hover(markdown, 17, 2);
  assert.ok(!fencedCode.text.includes('PLaMo 3 Translate'), 'フェンス内のコードでホバーが出ています');

  const tableDelimiter = await hover(markdown, 12, 3);
  assert.ok(!tableDelimiter.text.includes('PLaMo 3 Translate'), '表の区切り行でホバーが出ています');

  // 選択範囲: 選択した範囲の上でホバーすると、その範囲だけを翻訳する。
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'エディタがアクティブではありません');
  const selectionEnd = new vscode.Position(3, markdown.lineAt(3).text.length);
  editor.selection = new vscode.Selection(new vscode.Position(2, 0), selectionEnd);

  const selectionHover = await hover(markdown, 2, 5);
  console.log('[integration] selection hover:', selectionHover.text);
  assert.match(selectionHover.text, /選択範囲 · 自動 → 日本語/);
  assert.match(selectionHover.text, /[\u3040-\u30ff]/, '選択範囲が翻訳されていません');
  assert.ok(selectionHover.range, '選択範囲のホバーがありません');
  assert.deepEqual(
    [selectionHover.range.start.line, selectionHover.range.start.character, selectionHover.range.end.line, selectionHover.range.end.character],
    [2, 0, 3, selectionEnd.character],
    'ホバーの範囲が選択範囲と一致していません',
  );

  // 選択の外では、これまでどおり Markdown のブロックとして翻訳する。
  const outsideSelection = await hover(markdown, 5, 4);
  assert.match(outsideSelection.text, /Markdown · 自動 → 日本語/);
  assert.ok(!outsideSelection.text.includes('選択範囲'), '選択外まで選択範囲として扱われています');

  // コメントの一部を選択した場合は、コメント全体ではなく選択範囲を訳す。
  await vscode.window.showTextDocument(document);
  const codeEditor = vscode.window.activeTextEditor;
  assert.ok(codeEditor, 'コメントのエディタがアクティブではありません');
  const commentEnd = new vscode.Position(1, document.lineAt(1).text.length);
  codeEditor.selection = new vscode.Selection(new vscode.Position(1, 3), commentEnd);

  const commentSelection = await hover(document, 1, 10);
  console.log('[integration] comment selection hover:', commentSelection.text);
  assert.match(commentSelection.text, /選択範囲 · 自動 → 日本語/);
  assert.match(commentSelection.text, /[\u3040-\u30ff]/, '選択したコメントが翻訳されていません');
  assert.ok(commentSelection.range, '選択したコメントのホバーがありません');
  assert.deepEqual(
    [commentSelection.range.start.line, commentSelection.range.start.character, commentSelection.range.end.line, commentSelection.range.end.character],
    [1, 3, 1, commentEnd.character],
    'ホバーの範囲が選択範囲と一致していません',
  );

  // 選択の外にあるコメントは、コメントブロックとして翻訳する。
  const outsideComment = await hover(document, 0, 5);
  assert.match(outsideComment.text, /コメント · 自動 → 日本語/);
  assert.ok(!outsideComment.text.includes('選択範囲'));
};
