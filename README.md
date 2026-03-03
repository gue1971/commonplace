# Commonplace MVP

ローカル JSON で運用する、読書メモ向けの Commonplace Web アプリです。

## 起動

静的ファイルなので、任意のローカル HTTP サーバで起動できます。

```bash
python3 -m http.server 8125
```

その後、`http://127.0.0.1:8125` を開きます。

## 保存方式

- 初期表示では `data/commonplace.json` を読み込みます
- 保存形式は 1 ファイルで、スキーマは `schema_version + books + entries` です
- `インポート` で既存の JSON を読み込みます
- `エクスポート` で現在の状態を `cmp_YYYY-MM-DD-HH-mm.json` 形式の名前でダウンロードします

## MVP 範囲

- 本棚: 検索、並び替え、本の新規作成
- 本: メモ一覧、quote プレビュー、本ごとの検索、本情報の編集
- メモ: core/context の編集、タグ、削除
- 検索: メモ横断検索
- 表紙: URL/パス入力または画像アップロードで設定

## 注意

- JSON の読込形式は `schema_version + books + entries` の 1 ファイル構成です
