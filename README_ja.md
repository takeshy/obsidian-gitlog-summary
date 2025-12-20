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
