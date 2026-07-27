# ADR 0004: 登録制Web Componentsと1スライド制作画面を発表UIの正本にする

- 状態: 採用
- 日付: 2026-07-27
- 対象: project schema、発表runtime、MCP、Web UI、preview／publish
- 更新する判断: ADR 0003のflat canvasを互換形式として残し、標準の自由構成をcomponent sceneへ発展させる

## 背景

ADR 0003で導入したcanvasは、markdown、画像、図形を百分率座標へ置ける。しかし構造がflatなため、ローカルReact版で使えるカード列、数値部品、グラフ、入れ子のstack／grid、部品固有のanimationを表現しにくい。Web UIもスライド名の一覧しかなく、一枚の実表示を見ながら調整できない。

任意HTML／CSS／JavaScriptを親presentationへ直接挿入すれば表現力は上がるが、認証cookieと同じoriginで利用者codeを実行することになる。CSP、サニタイズ、AIによる検証、読み上げ・進行との連携、Web editorの意味理解を同時に維持できない。

## 決定

### 1. 標準形式は登録済みcomponentから成るscene tree

発表runtimeが実装する`uf-*`componentだけを利用できる宣言的なscene treeを追加する。利用者はcomponent、親子関係、順序、props、layout、design token、表示段階、animationを編集できるが、componentのJavaScript実装は運営側が管理する。

初期registryは次を含む。

- 構造: `uf-layer`、`uf-stack`、`uf-grid`
- 文章: `uf-hero`、`uf-markdown`、`uf-quote`
- 情報: `uf-card`、`uf-metric`、`uf-callout`
- データ: `uf-bar-chart`、`uf-timeline`
- メディア・装飾: `uf-image`、`uf-shape`

各componentはprops schema、許可する子、asset参照、reveal対応、instance上限、accessibility要件をregistryへ持つ。公開revisionはruntime versionを固定し、外部CDNや`latest`を参照しない。

sceneは正規化したnode配列として保存する。nodeは安定したIDと`parent_id`を持ち、MCPとWeb UIは一件ずつ更新する。tree全体をtool引数として毎回送らない。循環参照、存在しない親、過剰な深さ、範囲外座標、未知のcomponentはschemaで拒否する。

既存のflowとcanvasは互換形式として残す。rendererは同じplayer shell内で三形式を扱い、段階的にsceneへ変換できるようにする。

### 2. Web Componentsは拡張モデルでありsecurity sandboxではない

rendererは登録済みnodeを`<uf-hero>`、`<uf-grid>`等へ変換し、同梱したruntimeだけがupgradeする。Shadow DOMはCSS隔離に利用できるが、利用者codeを安全にする仕組みとしては扱わない。

利用者が任意のCustom Element実装を親documentへ登録すること、raw HTMLを`innerHTML`／`srcdoc`へ渡すこと、任意selector／style／scriptを保存することは禁止する。Markdown、URL、画像も現在のescapeと`asset_id`解決を維持する。

### 3. 任意HTML／CSS／JavaScriptは別機能・別originに隔離する

将来、本当に利用者codeが必要になった場合だけ`advanced_html`形式を追加する。この形式は`usercontent.2764.moe`等のcookieを持たない専用originから、`sandbox="allow-scripts"`かつ`allow-same-origin`なしのiframeとして配信する。

- 外部通信、worker、子frame、form、popup、download、top navigationを禁止する。
- assetはrevisionへ固定した同一成果物だけを許可する。
- 親との通信はiframeごとの`MessageChannel`と固定message schemaに限定する。
- 読み上げ、進行、公開、認証、保存は親runtimeだけが管理する。
- 任意code用originとCSPが用意できるまで、この形式をschemaへ追加しない。

### 4. Web UIは一枚を実表示しながら編集するworkspaceにする

owner限定の`/dashboard/projects/:projectId/slides/:slideId`を追加する。

- 左: slide一覧と前後移動
- 中央: 公開時と同じrendererを使う16:9 iframe
- 右: slide項目と選択componentのproperty inspector
- 下: reveal段階と読み上げ原稿
- 上: version、保存状態、固定preview、publish導線

編集用iframeはD1の現在下書きを都度描画し、画像はowner限定`/media/:assetId`を使う。公開成果物の`frame-ancestors 'none'`は維持し、編集用responseだけ`frame-ancestors 'self'`、`Cache-Control: no-store`とする。

最初の縦断実装では、slide一枚の正確な表示、step切替、タイトル・時間・tone・本文・補足欄の小粒度保存までを提供する。component treeの選択・追加・並べ替え・props編集は同じworkspaceへ順次載せる。

### 5. ローカル版とCloudflare版のruntimeを共有する

最終的に次をworkspace packageへ抽出する。

```text
packages/research-schema/src/presentation.ts
packages/presentation-runtime/src/components.ts
packages/presentation-runtime/src/render.ts
packages/presentation-runtime/src/player.ts
packages/presentation-runtime/src/styles.css
```

ローカルReact版は共有model／playerを使うadapterとし、Worker rendererはHTML shell、CSP、asset URL解決へ責務を絞る。初期移行ではWorker側でregistryとworkspaceを成立させ、代表fixtureによる同等性確認後にローカルを移す。

## 代替案

### raw HTMLをサニタイズして保存

不採用。十分な表現力にはCSS、SVG、scriptも要求され、サニタイズの境界が拡大する。Web editorとAIが内容の意味を理解できず、公開成果物の再現性も下がる。

### 利用者Web Componentを親documentで実行

不採用。Custom Elementも通常のJavaScriptであり、認証済みoriginで実行すれば任意scriptと同じ権限を持つ。

### canvasへblock種類だけ追加

移行段階では利用するが、正本にはしない。flatな座標配置だけでは入れ子layoutと再利用可能な意味部品を表現できない。

## 検証条件

- 既存flow／canvasの表示が変わらない。
- sceneの循環、参照切れ、深さ超過、未知component、範囲外frameを拒否する。
- MCP toolの最大input schemaを現在の上限内に保つ。
- owner以外は編集用slide frameを取得できない。
- Web保存はCSRFと`expected_version`を必須にする。
- iframeの内容と固定previewが同じrenderer／runtimeを使う。
- runtimeに利用者由来のscript、handler属性、任意URL、任意CSSが混入しない。
