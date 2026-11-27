# PLaMo Comment Translator

[![CI](https://github.com/minetake01/plamo-comment-translator/actions/workflows/ci.yml/badge.svg)](https://github.com/minetake01/plamo-comment-translator/actions/workflows/ci.yml)
[![Release](https://github.com/minetake01/plamo-comment-translator/actions/workflows/release.yml/badge.svg)](https://github.com/minetake01/plamo-comment-translator/releases)

ローカルで動く **PLaMo 3 Translate**（OpenAI 互換 `/v1`）を使って、コード中のコメント・文字列リテラル・Markdown の本文・選択範囲をホバーで翻訳する VSCode 拡張です。

[comment-translate](https://github.com/intellism/vscode-comment-translate) の TextMate ベースのコメント／文字列検出を土台に、次の点だけを残した作り直しです。

- ホバー翻訳だけ。没入型表示、置換、変数名の翻訳、コマンド、ステータスバーはありません。
- 翻訳先はローカルの PLaMo 3 Translate のみ。Google / Bing / DeepL などは呼びません。
- 複数行コメントは 1 ブロックにまとめ、行頭の `//`、`#`、`*`、`/*`、`*/` などを除いた本文を翻訳します。
- 文字列リテラル（`"..."`、`'...'`、`` `...` ``、Python の docstring など）のホバー翻訳を既定で有効にします。
- Markdown は見出し・段落・リスト・引用・表のセルを本文として翻訳します。コードブロックの中のコメントと文字列も翻訳します。
- テキストを選択したままその上にホバーすると、選択範囲だけを翻訳します。

## 必要なもの

- VSCode 1.92 以上
- PLaMo 3 Translate の OpenAI 互換サーバー
  - 既定: `http://127.0.0.1:45871/v1`
  - モデル名: `plamo-3-translate`（`--served-model-name` と一致させる）
- サーバーが動いていること。落ちている場合はホバーに接続エラーが出ます。

## インストール

[Releases](https://github.com/minetake01/plamo-comment-translator/releases) の `.vsix` を取得して入れます。

```powershell
code --install-extension dist/plamo-comment-translator-0.2.0.vsix
```

元の `intellsmi.comment-translate` が有効なままだと、同じ場所に 2 つのホバーが出ます。この拡張だけを使う場合は無効化してください。

```powershell
code --disable-extension intellsmi.comment-translate
```

VSCode を再読み込みすると有効になります。

## 設定

設定画面で `PLaMo Comment Translator` を検索するか、`settings.json` に書きます。

| キー | 既定 | 意味 |
|---|---|---|
| `plamoCommentTranslator.endpoint` | `http://127.0.0.1:45871/v1` | OpenAI 互換のベース URL |
| `plamoCommentTranslator.model` | `plamo-3-translate` | サーバーのモデル名 |
| `plamoCommentTranslator.targetLanguage` | `auto` | 翻訳先。`auto` は VSCode の表示言語（日本語 UI なら `ja`） |
| `plamoCommentTranslator.hoverEnabled` | `true` | ホバー翻訳全体の ON/OFF |
| `plamoCommentTranslator.hoverComments` | `true` | コメントのホバー翻訳 |
| `plamoCommentTranslator.hoverStrings` | `true` | 文字列リテラルのホバー翻訳 |
| `plamoCommentTranslator.hoverMarkdown` | `true` | Markdown の本文のホバー翻訳 |
| `plamoCommentTranslator.timeoutMs` | `15000` | 1 チャンクあたりのタイムアウト |
| `plamoCommentTranslator.maxOutputTokens` | `2048` | `max_tokens` の上限 |
| `plamoCommentTranslator.addSpecialTokens` | `true` | vLLM は `true`、BOS を自動付与する llama.cpp などは `false` |

`targetLanguage` は PLaMo 3 Translate が扱える 53 言語から選べます。未対応の言語を指定した場合は、ホバーにエラーを表示します。

## ホバー翻訳

コメント／文字列／Markdown 本文の上にマウスを置くだけで、次のようなホバーが出ます。

```text
🌐 PLaMo 3 Translate · コメント · 自動 → 日本語

ユーザーの表示名を返します。
名前はローカルプロファイルから取得します。
```

### 複数行コメント

連続する `//` やブロックコメントは 1 つのブロックとして扱い、記号を除いた本文だけを送ります。

```ts
// Returns the user's display name.
// The name comes from the local profile.
```

→ `Returns the user's display name.\nThe name comes from the local profile.`

```ts
/*
 * This function calculates the total price.
 * It includes tax and shipping.
 */
```

→ `This function calculates the total price.\nIt includes tax and shipping.`

JSDoc の `/** ... */`、`///`、`#`、`--`、`;`、`%`、`<!-- ... -->`、Python の `""" ... """` なども同様に記号を落とします。

### 文字列

- `"..."`、`'...'`、`` `...` ``、raw 文字列の接頭辞
- Python の docstring
- 複数行のテンプレートリテラル（`${...}` の式部分は翻訳しません）

文字列リテラルの中の `//` や `#` は本文なので消しません。

### Markdown

Markdown の本文は、ホバーした場所を含むブロック単位で翻訳します。

- 見出し: `#` を除いた見出し本文。ホバー結果は翻訳された Markdown として描画します。
- 段落: 空行までの連続する行を 1 ブロックにまとめます。
- リスト: 項目ごとに 1 ブロック。折り返し行は同じ項目に含めます。
- 引用: `>` を除いた連続する行を 1 ブロックにまとめます。
- 表: ホバーしたセルだけを翻訳します（区切り行は対象外）。
- インラインコード、強調、リンクは Markdown の記法を残したまま送ります。
- コードブロックの本文は翻訳しません。言語指定（`` ```ts `` など）のあるフェンスでは、中のコメントと文字列を埋め込み文法で翻訳します。

## 選択範囲の翻訳

翻訳したい範囲を選択したまま、その選択範囲の上にマウスを置くと、選択した本文だけを翻訳したホバーが出ます。

- コメント・文字列・Markdown のブロックより選択範囲を優先します。たとえばコメントの一部だけを選べば、コメント全体ではなくその部分を訳します。
- 選択範囲の外にホバーしたときは、これまでどおりコメント／文字列／Markdown のブロックを翻訳します。
- 複数の選択範囲がある場合は、ホバー位置を含む選択範囲を使います。
- 選択範囲が空、または空白だけのときは、通常のブロック翻訳になります。

翻訳先は `targetLanguage`、接続先は `endpoint` の設定に従います。長い選択範囲は 2000 文字前後のチャンクに分けて送ります。

## 元の拡張との違い

| 機能 | comment-translate | この拡張 |
|---|---|---|
| ホバー翻訳 | あり | あり |
| Markdown の本文翻訳 | なし | **あり** |
| 選択範囲の翻訳 | なし | **あり（選択範囲のホバー）** |
| 没入型表示 | あり | **なし** |
| 置換・変数名生成 | あり | **なし** |
| コマンド／ステータスバー | あり | **なし** |
| 翻訳元 | Google / Bing / DeepL など | **ローカル PLaMo のみ** |
| 複数行コメントの記号除去 | あり | あり（明示的に正規化） |
| 文字列ホバー | 設定で ON | **既定で ON** |

## 開発

Node.js 24 以上と npm を使います。

```powershell
npm install
npm run build          # dist/extension.js と dist/onig.wasm
npm test               # 純粋ロジックのユニットテスト
npm run test:integration  # 実際の VSCode + ローカル PLaMo
npm run live-check     # PLaMo へ PFML3 を直接投げる確認
npm run package        # dist/<name>-<version>.vsix
```

F5 で拡張開発ホストを起動する場合は `.vscode/launch.json` を使います。`test/fixtures/workspace` が開きます。

### CI / リリース

CI（`.github/workflows/ci.yml`）は `main` への push と pull request で、Ubuntu と Windows の Node.js 24 上で型チェック・ユニットテスト・ビルドを実行し、VSIX を artifact として残します。統合テストと `live-check` は VSCode とローカルの PLaMo サーバーが必要なので CI では動かしません。

リリースはタグで行います。タグは `package.json` の `version` と一致している必要があります。

```powershell
git tag v0.2.0
git push origin v0.2.0
```

`v*` タグの push で `.github/workflows/release.yml` が走り、同じ検証とパッケージをしたうえで VSIX を添付した GitHub Release を作ります。

Marketplace と Open VSX への公開は手動です。Actions の `Publish` を、リリース済みのタグと公開先を指定して実行します。リポジトリの Secrets に次の PAT を登録してください。

| Secret | 用途 |
|---|---|
| `VSCE_PAT` | Visual Studio Marketplace（Azure DevOps の PAT、Marketplace の Manage スコープ） |
| `OVSX_PAT` | Open VSX |

### 構成

```text
src/
├─ extension.ts                 # 起動、ホバー登録
├─ hover.ts                     # ホバー表示（選択範囲の優先を含む）
├─ translationView.ts           # ホバーの表示組み立て
├─ config.ts                    # 設定
├─ translator.ts                # チャンク分割 + キャッシュ
├─ translationCache.ts
├─ plamo/
│  ├─ client.ts                 # /completions
│  ├─ prompt.ts                 # PFML3
│  ├─ languages.ts              # 53 言語
│  └─ errors.ts
└─ syntax/
   ├─ grammarExtensions.ts      # インストール済み文法の収集
   ├─ textmate.ts               # vscode-textmate + oniguruma
   ├─ blockParser.ts            # コメント／文字列／Markdown ブロックの抽出
   ├─ markdown.ts               # Markdown 本文ブロック
   ├─ commentText.ts            # 記号除去・正規化
   ├─ documentParser.ts         # ドキュメント単位のキャッシュ
   └─ types.ts
```

## 制限

- TextMate 文法を持つ言語だけが対象です。プレーンテキストなど、文法のない言語ではホバーしません。
- ホバーは翻訳が返るまで待ちます。初回は文法の読み込みで少し時間がかかります。
- `${...}` などのテンプレート式、正規表現リテラルは翻訳しません。
- Markdown のインラインコード（`` `...` ``）とリンク URL は本文の一部として送ります。翻訳結果で表記が変わる場合があります。
- 選択範囲の翻訳は、VSCode のエディタで選択した範囲の上にホバーしたときだけ働きます。Markdown プレビューやターミナル内の選択には効きません。
- リモート SSH など、拡張ホストがローカル以外で動く環境では `127.0.0.1` がリモート側を指します。ローカル専用です。
- 翻訳結果はメモリ上に 300 件までキャッシュします。設定を変えると別キーになります。

## ライセンス

- このリポジトリのコード: MIT（[LICENSE](LICENSE)）
- TextMate のトークン化とコメントブロック検出の考え方は [intellism/vscode-comment-translate](https://github.com/intellism/vscode-comment-translate)（MIT）を参考にしています（[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）。
- PFML3 プロンプトは [plamo-page-translator](https://github.com/minetake01/plamo-page-translator) と `plamo-cot-translation` の実装に合わせています。
- PLaMo 3 Translate のモデル重みは含みません。PLaMo Community License に従って別途取得してください。
