# 実表示での確認

制御画面はTwitch OAuthの内側にあるが、`web/pages.ts` のページ関数は固定データからHTMLを返すだけなので、ログインなしで全面を生成できる。

## 生成する

```bash
bun run preview:dashboard
```

`work/dashboard-preview/` へ全面のHTMLと `dashboard.css` / `dashboard.js` を出力する。CSSとJSは実際に配信されるものと同一で、変更後に再実行すれば反映される。`index.html` から各面へ辿れる。

生成される面と、それぞれが属する型は次の通り。

| ファイル | 面の型 |
|---|---|
| `landing.html`、`guide.html`、`data.html` | 開示面 |
| `dashboard.html` | 選択面 |
| `project.html` | 現在地面 |
| `slide.html` | 作業面 |
| `review.html` | 指摘面 |
| `voice.html` | 監視面 |

固定データを増やす必要が出たら `apps/mcp-server/scripts/dashboard-preview.ts` を編集する。このスクリプトは `tsconfig.json` の `include` 外にあり型検査もテストも通らないので、壊れていないことは実行して確かめる。

## 見る

```bash
agent-browser open "file://$PWD/work/dashboard-preview/project.html"
agent-browser screenshot /tmp/project.png
```

テーマは属性で切り替える。両方を必ず見る。

```bash
agent-browser eval "document.documentElement.setAttribute('data-theme','light')"
agent-browser eval "document.documentElement.setAttribute('data-theme','dark')"
```

## 確認する項目

- 1280×720で文字と操作部品が画面外へ出ない。
- 同じ領域に強調した操作が2つ以上ない。
- 隣り合う操作の意味（移動・確認・編集・依頼・確定・破棄）が見分けられる。
- 状態表示が色を消しても読める。文言だけで意味が通る。
- ライトとダークで情報の並び順と操作の階層が変わらない。

色を消して確かめるときはフィルタをかける。

```bash
agent-browser eval "document.documentElement.style.filter='grayscale(1)'"
```

## 本番と違う点

プレビューはBunで生成し、本番は`wrangler`(esbuild)でビルドする。Bunは`String.raw`テンプレート内の非ASCII文字を`\uXXXX`へ退避し、rawテンプレートではこの列が解釈されないため、`content: "○"` のようなCSSが文字列 "u25CB" として表示される。スクリプト側で戻しているが、記号が崩れて見えたときはまずこれを疑い、本番ビルドの成果物と突き合わせる。

```bash
bun run build:mcp
rg -o '.journey-step::before[^}]*' apps/mcp-server/dist/index.js
```

## この方法で確認できないもの

- スライド編集画面の中央プレビューiframe（サーバのpathを指すため空になる）
- 保存、生成、アップロードなどサーバへ送る操作の結果
- 実データの分量による崩れ

これらは `bun run dev:mcp` と実ログインが要る。レイアウト、配色、操作階層の判断には固定プレビューで足りる。
