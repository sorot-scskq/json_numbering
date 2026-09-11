# json_numbering
シナリオJsonを作成するツールです。

[リンク](https://sorot-scskq.github.io/json_numbering/json_numbering_ver2.html)

## テスト

出力・読込の処理（`json_numbering_ver2.html` の `<script id="core">`）をNode.jsの標準テスト機能でテストしています。追加のインストールは要りません。

```bash
node --test test/*.test.js
```

PRを作ると GitHub Actions でも実行され、`main` へのpush時はテストが通ったときだけ GitHub Pages を更新します。
