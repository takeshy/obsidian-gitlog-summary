# Git Log Summary for Obsidian

今日の Git ログをノートに挿入する Obsidian プラグインです。

## スクリーンショット

### 使用例
![使用例](image.png)

### 設定画面
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
### Commits
- 09:30 [project-a] 新機能を追加
- 10:45 [project-b] ログインのバグを修正

### Staged
- [project-a] src/index.ts

### Unstaged
- [project-b] README.md
- [project-b] config.json (new)
```

## テンプレートのカスタマイズ

出力フォーマットは設定画面で [Handlebars](https://handlebarsjs.com/) テンプレート構文を使ってカスタマイズできます。

### 使用可能な変数

| コンテキスト | 変数 |
|---------|-----------|
| コミット | `{{time}}`, `{{repo}}`, `{{message}}` |
| Staged/Unstaged | `{{repo}}`, `{{file}}` |
| グローバル | `{{timestamp}}` |

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

### テンプレート例

#### コミットをタイプとリポジトリ別にグループ化

この例では、コミットをバグ修正、デザイン、機能追加に分類し、さらにリポジトリ別にグループ化します。

**前提条件：**
- `"my-app"` と `"api-server"` は実際のリポジトリディレクトリ名に置き換えてください
- コミットはメッセージの接頭辞で分類されます：
  - `fix` で始まる → バグ修正
  - `design` で始まる → デザイン
  - その他 → 機能追加
- 表示名（`フロントエンド`、`バックエンド`）は `{{#eq}}` ブロック内でカスタマイズ可能です

```handlebars
{{#if commits}}
### バグ修正
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}フロントエンド{{else}}{{#eq this "api-server"}}バックエンド{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "fix"}}
- {{time}} {{message}}
{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}

### デザイン
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}フロントエンド{{else}}{{#eq this "api-server"}}バックエンド{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "design"}}
- {{time}} {{message}}
{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}

### 機能追加
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}フロントエンド{{else}}{{#eq this "api-server"}}バックエンド{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../commits}}
{{#eq repo ../this}}
{{#startsWith message "fix"}}{{else}}{{#startsWith message "design"}}{{else}}
- {{time}} {{message}}
{{/startsWith}}{{/startsWith}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

{{#if staged}}
### Staged
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}フロントエンド{{else}}{{#eq this "api-server"}}バックエンド{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../staged}}
{{#eq repo ../this}}
- {{file}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

{{#if unstaged}}
### Unstaged
{{#each (array "my-app" "api-server")}}
#### {{#eq this "my-app"}}フロントエンド{{else}}{{#eq this "api-server"}}バックエンド{{else}}{{this}}{{/eq}}{{/eq}}
{{#each ../unstaged}}
{{#eq repo ../this}}
- {{file}}
{{/eq}}
{{/each}}
{{/each}}
{{/if}}

({{timestamp}})
```

出力：
```markdown
### バグ修正
#### フロントエンド
- 10:30 fix: ログイン問題を解決
- 14:00 fix: null ポインタを処理

### デザイン
#### フロントエンド
- 11:00 design: ボタンスタイルを更新

### 機能追加
#### フロントエンド
- 09:00 ユーザープロフィールページを追加
#### バックエンド
- 12:00 ヘルスチェックエンドポイントを追加

### Staged
#### フロントエンド
- src/components/Button.tsx

### Unstaged
#### バックエンド
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
