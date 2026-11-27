/** ドキュメントごとに BlockParser をキャッシュする。 */

import { Disposable, workspace, type TextDocument } from 'vscode';
import { BlockParser } from './blockParser';
import type { TextMateService } from './textmate';

interface CacheEntry {
  version: number;
  parser: Promise<BlockParser | null>;
}

export class DocumentParserCache implements Disposable {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly disposable: Disposable;

  constructor(private readonly textMate: TextMateService) {
    this.disposable = Disposable.from(
      workspace.onDidChangeTextDocument((event) => this.entries.delete(keyOf(event.document))),
      workspace.onDidCloseTextDocument((document) => this.entries.delete(keyOf(document))),
    );
  }

  async get(document: TextDocument): Promise<BlockParser | null> {
    const key = keyOf(document);
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.version === document.version) {
      return existing.parser;
    }

    const parser = (async () => {
      const grammar = await this.textMate.createGrammar(document.languageId);
      if (grammar === null) return null;
      const maxLineLength = workspace
        .getConfiguration('editor')
        .get<number>('maxTokenizationLineLength', 20_000);
      return new BlockParser(document.getText(), grammar, document.languageId, maxLineLength);
    })();

    this.entries.set(key, { version: document.version, parser });
    return parser;
  }

  dispose(): void {
    this.entries.clear();
    this.disposable.dispose();
  }
}

function keyOf(document: TextDocument): string {
  return `${document.languageId}|${document.uri.toString()}`;
}
