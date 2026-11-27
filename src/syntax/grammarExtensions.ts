/** VSCode にインストールされた拡張の TextMate 文法コントリビューションを集める。 */

import { extensions } from 'vscode';
import type { GrammarContribution, GrammarExtension, GrammarLanguage } from './types';

interface PackageContributes {
  grammars?: unknown;
  languages?: unknown;
}

interface ExtensionPackage {
  contributes?: PackageContributes;
}

function isGrammarContribution(value: unknown): value is GrammarContribution {
  if (typeof value !== 'object' || value === null) return false;
  const grammar = value as Partial<GrammarContribution>;
  return typeof grammar.scopeName === 'string'
    && typeof grammar.path === 'string'
    && grammar.scopeName.length > 0
    && grammar.path.length > 0;
}

/**
 * 言語 ID は埋め込み言語のトークン化にも使うため、全拡張を通して一意に振る。
 * 文法を持たない拡張は対象外。
 */
export function getGrammarExtensions(): GrammarExtension[] {
  const result: GrammarExtension[] = [];
  let nextLanguageId = 2;

  for (const extension of extensions.all) {
    const packageJSON = extension.packageJSON as ExtensionPackage | undefined;
    const contributes = packageJSON?.contributes;
    const rawGrammars = contributes?.grammars;
    if (!Array.isArray(rawGrammars)) continue;
    const grammars = rawGrammars.filter(isGrammarContribution);
    if (grammars.length === 0) continue;

    const languages: GrammarLanguage[] = [];
    if (Array.isArray(contributes?.languages)) {
      for (const language of contributes.languages) {
        if (typeof language !== 'object' || language === null) continue;
        const id = (language as { id?: unknown }).id;
        if (typeof id !== 'string' || id === '') continue;
        languages.push({ id: nextLanguageId, name: id });
        nextLanguageId += 1;
      }
    }

    result.push({
      languages,
      value: grammars,
      extensionLocation: extension.extensionPath,
    });
  }

  return result;
}
