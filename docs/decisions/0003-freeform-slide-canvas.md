# ADR 0003: 自由配置スライドを安全なblock canvasとして表現する

- 状態: 採用
- 日付: 2026-07-27
- 対象: project schema、MCP、発表renderer、preview／publish成果物

## 背景

現行slideは`content_markdown`、`sidebar_markdown`、`narration`の固定領域を前提としている。BIIMや資料型には扱いやすいが、タイトルを中央に置く、画像を全面に敷く、複数の図や短文を重ねる、といった自由な構成を表現できない。

任意HTML／CSS／JavaScriptを受け付ければ自由度は高い一方、MCPから生成された未検証codeを公開成果物で実行することになり、CSP、アクセシビリティ、進行、読み上げ、将来のeditorを統一できない。

## 決定

既存の定型flowを残し、slideごとに任意で`composition.mode = "canvas"`を選べるようにする。canvasは16:9 stage内の百分率座標でblockを配置する。

blockは次の種類に限定する。

- `markdown`: 見出し、本文、箇条書き、短い数値表現
- `image`: projectへupload済みの`asset_id`を参照する画像
- `shape`: 矩形、楕円、線と、任意の短いlabel

各blockは`frame(x, y, width, height)`、`z_index`、`at`、animation preset、検証済みstyle tokenを持つ。座標は0〜100で、右端・下端を超えない。`at`はslideの段階表示と連携する。

rendererはblockからHTMLを生成し、利用者由来のHTML、selector、script、外部URL、任意CSSを受け付けない。標準hookとして`data-block-id`、`data-block-kind`、`data-reveal-at`、`data-animation`を出力する。

## 互換性

- `composition`未指定のslideは従来のmain／sidebar rendererを使う。
- canvasへ切り替えても、既存のnarration、ページ進行、URL、音量、自動送りは共通runtimeが管理する。
- legacy fieldsは当面schemaに残す。canvasが安定するまで自動変換や削除は行わない。

## 画像の公開固定

canvasの画像は外部URLを直接参照せず、所有者がprojectへuploadした`asset_id`だけを受け付ける。

preview作成時に参照画像をrevision専用R2 keyへstream copyし、D1の`presentation_revision_assets`へsnapshotを記録する。previewでは所有者だけが読め、publish後はそのrevisionの画像だけを公開できる。元画像の削除や差し替えで公開済み成果物が壊れない。

初期上限は1 revisionあたり画像30件、合計30 MiBとする。HTML自体の2 MiB上限は維持する。

## MCP操作

- `set_slide_canvas`: canvasの有効化、背景色、overflow方針を設定する。
- `upsert_slide_block`: block一件を追加・置換する。
- `delete_slide_block`: block一件を削除する。
- `research://projects/{id}/slides/{slideId}`: 現在のblockとversionを一枚単位で取得する。

2026-07-29追補: 一枚取得をtoolから標準MCP resourceへ移した。入力のない読取schemaをtool一覧へ重複させず、個別編集の取得粒度は維持する。

すべて既存の`expected_version`による楽観的排他制御を使い、研究全体やslide全体の再送を要求しない。

## 今回含めないもの

- 任意HTML、React component、JavaScript、任意CSS
- 動画、iframe、外部画像URL
- block間constraint、group、path animation
- Web UI上のドラッグ＆ドロップeditor

これらはcanvas schemaと公開snapshotが実利用で安定してから別の判断として追加する。
