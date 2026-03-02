# Commonplace MVP

ローカル JSON で運用する、読書メモ向けの Commonplace Web アプリです。

## 起動

静的ファイルなので、任意のローカル HTTP サーバで起動できます。

```bash
python3 -m http.server 8125
```

その後、`http://127.0.0.1:8125` を開きます。

## 保存方式

- 初期表示では `data/books.json` と `data/entries.json` を読み込みます
- 編集内容をローカル JSON へ永続化するには、Chromium 系ブラウザで `データ保存先を接続` を押し、保存先フォルダを選択します
- 選択先フォルダに `books.json` / `entries.json` がなければ自動作成します

## MVP 範囲

- 本棚: 検索、並び替え、本の新規作成
- 本: メモ一覧、quote プレビュー、本ごとの検索、本情報の編集
- メモ: core/context の編集、タグ、削除
- 検索: メモ横断検索
- 表紙: URL/パス入力または画像アップロードで設定

## 注意

- Safari / Firefox では閲覧はできますが、File System Access API による JSON 永続化は使えません
- 保存時は一時ファイルを書いた後に本体を書き換える流れで、破損リスクを下げています
