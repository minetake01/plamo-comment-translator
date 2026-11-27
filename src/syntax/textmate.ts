/** インストール済み拡張の TextMate 文法を読み、言語 ID から IGrammar を作る。 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import {
  Registry,
  parseRawGrammar,
  type IGrammar,
  type IOnigLib,
  type IRawGrammar,
  type ITokenTypeMap,
} from 'vscode-textmate';
import type { GrammarContribution, GrammarExtension } from './types';

interface GrammarRegistration {
  location: string;
  embeddedLanguages: Record<string, string>;
  tokenTypes?: Record<string, string>;
}

let wasmLoaded: Promise<void> | undefined;

async function ensureWasm(wasmPath: string): Promise<void> {
  wasmLoaded ??= fs.readFile(wasmPath).then(async (bytes) => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await loadWASM(buffer);
  });
  return wasmLoaded;
}

function onigLib(): IOnigLib {
  return {
    createOnigScanner: (patterns) => new OnigScanner(patterns),
    createOnigString: (value) => new OnigString(value),
  };
}

function toTokenTypes(raw: Record<string, string> | undefined): ITokenTypeMap {
  const map: Record<string, number> = {};
  for (const [scope, type] of Object.entries(raw ?? {})) {
    map[scope] = type === 'comment' ? 1 : type === 'string' ? 2 : 0;
  }
  return map as ITokenTypeMap;
}

export class TextMateService {
  private readonly scopeToRegistration = new Map<string, GrammarRegistration>();
  private readonly languageToScope = new Map<string, string>();
  private readonly languageIds = new Map<string, number>();
  private readonly injections: Record<string, string[]> = {};
  private registryPromise: Promise<Registry> | undefined;

  constructor(
    extensions: readonly GrammarExtension[],
    private readonly wasmPath: string,
  ) {
    for (const extension of extensions) {
      for (const language of extension.languages) {
        this.languageIds.set(language.name, language.id);
      }
    }
    for (const extension of extensions) {
      for (const grammar of extension.value) {
        this.register(extension.extensionLocation, grammar);
      }
    }
  }

  /** WASM とレジストリを先に用意しておく。文法の読み込みは createGrammar まで遅延する。 */
  async initialize(): Promise<void> {
    await this.getRegistry();
  }

  async createGrammar(languageId: string): Promise<IGrammar | null> {
    const scopeName = this.languageToScope.get(languageId);
    if (scopeName === undefined) return null;
    const registration = this.scopeToRegistration.get(scopeName);
    if (registration === undefined) return null;

    const embeddedLanguages: Record<string, number> = {};
    for (const [scope, name] of Object.entries(registration.embeddedLanguages)) {
      const id = this.languageIds.get(name);
      if (id !== undefined) embeddedLanguages[scope] = id;
    }

    try {
      const registry = await this.getRegistry();
      return await registry.loadGrammarWithConfiguration(
        scopeName,
        this.languageIds.get(languageId) ?? 1,
        {
          embeddedLanguages,
          tokenTypes: toTokenTypes(registration.tokenTypes),
        },
      );
    } catch (error) {
      console.error(`[plamo-comment-translator] failed to load grammar ${scopeName}`, error);
      return null;
    }
  }

  private register(extensionLocation: string, grammar: GrammarContribution): void {
    const location = path.isAbsolute(grammar.path)
      ? grammar.path
      : path.join(extensionLocation, grammar.path);

    this.scopeToRegistration.set(grammar.scopeName, {
      location,
      embeddedLanguages: grammar.embeddedLanguages ?? {},
      tokenTypes: grammar.tokenTypes,
    });
    if (grammar.language !== undefined) {
      this.languageToScope.set(grammar.language, grammar.scopeName);
    }
    for (const injectedScope of grammar.injectTo ?? []) {
      (this.injections[injectedScope] ??= []).push(grammar.scopeName);
    }
  }

  private getRegistry(): Promise<Registry> {
    this.registryPromise ??= (async () => {
      await ensureWasm(this.wasmPath);
      return new Registry({
        onigLib: Promise.resolve(onigLib()),
        loadGrammar: async (scopeName: string) => {
          const registration = this.scopeToRegistration.get(scopeName);
          if (registration === undefined) return null;
          const content = await fs.readFile(registration.location, 'utf8');
          return parseRawGrammar(content, registration.location) as IRawGrammar;
        },
        getInjections: (scopeName: string) => this.injections[scopeName],
      });
    })();
    return this.registryPromise;
  }
}
