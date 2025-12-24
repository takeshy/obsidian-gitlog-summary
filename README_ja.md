# Git Log Summary for Obsidian

今日の Git ログをノートに挿入する Obsidian プラグインです。

## 設定画面
![設定画面](settings.png)

## 機能

- **今日のコミット** - 複数リポジトリの今日のコミットを一括表示
- **複数リポジトリ対応** - 複数の Git ディレクトリを同時に監視
- **Staged 変更** - ステージングされているがコミットされていないファイルを表示
- **Unstaged 変更** - 変更されたファイルと新規ファイルを表示
- **作者フィルター** - メールアドレスでコミットをフィルタリング（オプション）
- **時間順ソート** - コミットは時間順にソートされます

## 出力フォーマット

以下のような形式でサマリーが挿入されます：

```markdown
### project-a
#### Commits
- 09:30 新機能を追加
#### Staged
- src/index.ts

### project-b
#### Commits
- 10:45 ログインのバグを修正
#### Unstaged
- README.md
- config.json (new)

(2024-01-15 16:30)
```

## テンプレートのカスタマイズ

出力フォーマットは設定画面で [Handlebars](https://handlebarsjs.com/) テンプレート構文を使ってカスタマイズできます。

### 使用可能な変数

| コンテキスト | 変数 |
|---------|-----------|
| コミット | `{{time}}`, `{{repo}}`, `{{message}}` |
| Staged/Unstaged | `{{repo}}`, `{{file}}` |
| グローバル | `{{repositories}}`, `{{timestamp}}` |

- `{{repositories}}` - リポジトリオブジェクトの配列。各要素は `{{name}}`, `{{commits}}`, `{{staged}}`, `{{unstaged}}` を持つ

### 組み込みヘルパー

- `{{#if commits}}...{{/if}}` - 条件付きレンダリング
- `{{#each commits}}...{{/each}}` - ループ
- `{{#unless}}...{{/unless}}` - 否定条件
- `{{else}}` - else 節

### カスタムヘルパー

- `{{#eq value "string"}}...{{else}}...{{/eq}}` - 等価比較
- `{{#ne value "string"}}...{{/ne}}` - 非等価比較
- `{{#contains value "substring"}}...{{/contains}}` - 文字列を含むかチェック
- `{{#startsWith value "prefix"}}...{{/startsWith}}` - 文字列が指定の接頭辞で始まるかチェック
- `(array "a" "b" "c")` - `{{#each}}` で使用するインライン配列を作成
- `{{#some array field="value"}}...{{/some}}` - 条件に一致するアイテムがあるかチェック
  - `fieldStartsWith="prefix"` - プレフィックスマッチング（例: `messageStartsWith="fix"`）
  - `fieldNotStartsWithAny="a,b"` - 複数のプレフィックスを除外
- `(or a b c)` - いずれかの値が truthy なら true を返す（配列の場合は length > 0 をチェック）

### テンプレート例

#### コミットをリポジトリとタイプ別にグループ化

この例では、コミットをリポジトリ別に分け、さらにバグ修正、デザイン、機能追加に分類します。

**前提条件：**
- コミットはメッセージの接頭辞で分類されます：
  - `fix` で始まる → バグ修正
  - `design` で始まる → デザイン
  - その他 → 機能追加
- 表示名（`フロントエンド`、`バックエンド`）は `{{#eq}}` ブロック内でカスタマイズ可能です

```handlebars
{{#each repositories}}
{{#if (or commits staged unstaged)}}
### {{#eq name "my-app"}}フロントエンド{{else}}{{#eq name "api-server"}}バックエンド{{else}}{{name}}{{/eq}}{{/eq}}
{{#some commits messageStartsWith="fix"}}
#### バグ修正
{{#each commits}}
{{#startsWith message "fix"}}
- {{time}} {{message}}
{{/startsWith}}
{{/each}}
{{/some}}
{{#some commits messageStartsWith="design"}}
#### デザイン
{{#each commits}}
{{#startsWith message "design"}}
- {{time}} {{message}}
{{/startsWith}}
{{/each}}
{{/some}}
{{#some commits messageNotStartsWithAny="fix,design"}}
#### 機能追加
{{#each commits}}
{{#startsWith message "fix"}}{{else}}{{#startsWith message "design"}}{{else}}
- {{time}} {{message}}
{{/startsWith}}{{/startsWith}}
{{/each}}
{{/some}}
{{#if staged}}
#### Staged
{{#each staged}}
- {{file}}
{{/each}}
{{/if}}
{{#if unstaged}}
#### Unstaged
{{#each unstaged}}
- {{file}}
{{/each}}
{{/if}}
{{/if}}
{{/each}}

({{timestamp}})
```

出力：
```markdown
### フロントエンド
#### バグ修正
- 10:30 fix: ログイン問題を解決
- 14:00 fix: null ポインタを処理
#### デザイン
- 11:00 design: ボタンスタイルを更新
#### 機能追加
- 09:00 ユーザープロフィールページを追加
#### Staged
- src/components/Button.tsx

### バックエンド
#### 機能追加
- 12:00 ヘルスチェックエンドポイントを追加
#### Unstaged
- README.md

(2024-01-15 16:30)
```

## インストール

### 手動インストール
1. 最新リリース（`main.js`、`manifest.json`）をダウンロード
2. Vault の `.obsidian/plugins/` ディレクトリに `gitlog-summary` フォルダを作成
3. ダウンロードしたファイルをコピー
4. Obsidian 設定 > コミュニティプラグイン でプラグインを有効化

### ソースからビルド
```bash
git clone https://github.com/takeshy/obsidian-gitlog-summary
cd obsidian-gitlog-summary
npm install
npm run build
```

`main.js` と `manifest.json` を Vault のプラグインフォルダにコピーしてください。

## 設定

### Author email
作者のメールアドレスでコミットをフィルタリングします。空欄の場合は全作者のコミットを表示します。

### Git directories
監視する Git リポジトリを1行に1つずつ指定します。

**重要:** フルパスが必要です（例: `/home/user/project`）。`~` ショートカットは使用できません。

## 使い方

1. Git ログを挿入したいノートを開く
2. コマンドパレットを開く（Ctrl/Cmd + P）
3. "Insert today's Git log" を検索
4. カーソル位置に Git ログサマリーが挿入されます

## 動作要件

- Obsidian v0.15.0 以上
- Git がコマンドラインからアクセス可能
- **デスクトップ専用** - Node.js API を使用するため、モバイルでは動作しません

## 開発

```bash
# 依存パッケージのインストール
npm install

# 開発ビルド（ウォッチモード）
npm run dev

# プロダクションビルド
npm run build

# Lint
npm run lint
```

## ライセンス

MIT
