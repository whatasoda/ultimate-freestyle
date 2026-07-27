# 2026-07-26 自律実装ログ

## 対象

Web UI堅牢化、研究詳細、画像upload、VOICEVOX複数話者・調声、本番Cloudflare反映。

設計判断の理由と比較は[ADR 0001](decisions/0001-web-media-platform.md)を正本とする。`daifuku-tw`はmain commit `8410cef`を参照し、workspace分離、body上限、typed contract、migrationを先に適用するdeploy順、fixture testを採用した。自己完結signed sessionは即時logoutに向かないため採用していない。

## 完了した変更

- `9ca2893`: Twitch state、Web routing、上限付きstream readerを分離。
- `8f13e74`: 所有者限定の研究詳細Web UI。
- `e84881d`: Web sessionをKVからD1へ移し、session／CSRFの二つのCookieを照合。
- `2970bac`: JPEG／PNG／静止WebPを検査・縮小・WebP化してprivate R2へ保存する画像UI。原本、EXIF、SVG、animationを保存せず、D1 triggerでquotaを強制。
- `c1c4f4b`: `speaker_uuid + style_id`のVOICEVOX profile、segment別profile、7種の調声値、manifest v2、クレジット自動表示。
- MCPから研究画像の一覧・冪等削除を行うtoolと、Web／MCP画像操作のaudit eventを追加。

## Cloudflare本番状態

- Host: `saijiyu-kenkyu.2764.moe`
- D1 migration: `0001`〜`0004`適用済み。
- Private R2: `ultimate-freestyle-media`（APAC、public accessなし）。
- Bindings: OAuth KV、state KV、D1、R2、Images。
- Worker: v0.5.0、Version ID `848b0855-08ed-48b4-8354-a385bc0e6a63`。
- 本番smoke: health v0.5.0、OAuth必須、Web dashboard、authorization endpointを確認済み。

## 検証

- 発表UIの通常build。
- GitHub Pages移行前互換としてroot／subpathの静的build。
- Worker型生成差分、TypeScript、11 test files／33 tests、deploy dry-run。
- Imagesのoffline bindingとR2で、変換、所有者分離、取得、削除、unsupported MIME拒否を確認。
- Web UIでCSRFなしuploadを403、SVGを422、他所有者の研究詳細を404にするcontractを確認。

## 後続作業・人間確認

作業を止めるblockerではないため、次へ分離した。

1. D1 session移行で旧Cookieは無効になったため、ブラウザでTwitchへ再ログインする。
2. 本番Web UIから実画像を1枚uploadし、Images本番変換、表示、削除を目視確認する。
3. ChatGPT GUIからのRemote MCP OAuth確認。
4. Cloudflare Queue、DLQ、Containerを作り、VOICEVOX ENGINE 0.25.1のamd64 image digestを確定する。
5. Container生成MP3をprivate R2へ保存するjob、利用規約snapshot、再生成・削除・quotaを接続する。
6. 固定版presentationのpreview／publishとpublic配信経路を実装する。

## 運用上の注意

- secret、Twitch token、MCP token、画像binaryをログやMCP JSONへ出さない。
- 画像object keyはserver生成UUIDだけを使う。
- ローカルVOICEVOX manifestは`unverified-local`。本番cacheへ昇格しない。
- 人に見える話者名はsnapshotで、生成identityには使わない。
- migrationを先に適用してから対応Workerをdeployする。

---

## 2026-07-27 追記: 小粒度編集・template・Web公開

### 体験と契約

- `9dba6c8`: ADR 0002で「AI/Webから小さく編集し、固定プレビューを確認してから公開する」体験と責務境界を採用。
- `3ecd53c`: 巨大な`update_project`を廃止。軽量`get_project_outline`と、基本項目、箇条書き、ログ、deck、template、slide、reveal、narrationの小粒度toolへ移行。
- MCP toolの最大input schemaを12,000文字未満に保つcontract testを追加。
- 発表templateは任意HTML/CSS/JavaScriptではなく、領域配置、検証済み色、余白、文字scale、animation presetを宣言する方式を採用。
- rendererへ`data-slide-id`、`data-template-id`、`data-region`、`data-reveal-at`、`data-animation`、`data-state`を追加。
- VOICEVOX profileも`upsert_voicevox_profile`で一件ずつ更新できる。

### Web UIと公開

- `2284ef4`: タイトル、段階、概要、問い、仮説、方法の軽微編集をWeb UIへ追加。32 KiB JSON上限、CSRF、schema検証、version競合防止を適用。
- D1 migration `0005_presentation_publications.sql`で不変revisionとstable公開pointerを追加。
- 現在versionから自己完結HTMLをprivate R2へ保存し、所有者限定previewを開いた後、同じversionのrevisionだけを公開できる。
- 公開下書きは公開版を暗黙更新しない。公開URLは`/p/<stable-slug>`、previewは`/preview/<revision-id>`。
- `ae54640`: R2補償削除、APIの予期しない失敗応答、成果物配信のCSP／Permissions Policyを強化。

### 検証と本番

- Worker型、TypeScript、11 test files／33 tests、Wrangler dry-runを通過。
- contract testでWeb編集、競合409、preview生成、所有者限定閲覧、publish、未認証public閲覧、CSPを確認。
- 最新Workers型`5.20260727.1`を一時取得してR2/D1 contractを照合。依存更新はrepositoryの7日minimum-release-age方針により`5.20260718.1`を維持。
- 本番D1へ`0005`適用済み。
- Worker v0.6.0、Version ID `f36f9692-29e9-4035-af0c-289d5826ae31`。
- 本番smokeでhealth v0.6.0、OAuth必須、Web dashboard、authorization endpointを確認済み。

### 残る目視確認

ブラウザ制御環境に利用可能なbrowser backendがなかったため、認証済み研究詳細の目視操作だけを残した。自動contractは通過している。本番でTwitchログイン後、基本情報保存、プレビューの新規タブ表示、公開URLの順に一度確認する。

---

## 2026-07-27 追記: 自由配置スライド

### schemaと編集契約

- `49f4fb0`: ADR 0003で、既存flowを維持しながらslide単位で安全なblock canvasを選べる方針を採用。
- markdown、project画像、矩形・楕円・線を、百分率frame、重なり順、段階表示、animation preset、検証済みstyle tokenで配置できる。
- `set_slide_canvas`、`upsert_slide_block`、`delete_slide_block`を追加し、AI clientはslide全体を送り直さず一blockずつ編集できる。
- 任意HTML、JavaScript、CSS、外部画像URLは受け付けず、従来のnarration、進行、URL、自動送りは共通runtimeへ残した。

### previewと公開画像

- D1 migration `0006_presentation_revision_assets.sql`で、発表revisionと画像snapshotの対応を保存する。
- preview生成時、参照中のprivate project画像をrevision専用R2 keyへstream copyする。previewは所有者限定、publish後の現行revisionはimmutable cacheで公開する。
- 元のproject画像を削除しても固定revisionが表示できるcontract testを追加した。
- 1 revisionあたり画像30件・合計30 MiB、HTML 2 MiBを上限とする。

### 検証

- schema境界、自由配置renderer、MCP小粒度編集、所有者限定preview画像、公開画像の固定性を自動検証した。
- Web研究詳細には自由配置block数を表示する。ドラッグ＆ドロップeditorはschemaの実利用を見てから実装する。
- Worker型、TypeScript、11 test files／35 tests、Wrangler dry-runを通過した。

### Cloudflare本番

- 本番D1へ`0006_presentation_revision_assets.sql`を適用済み。
- Worker v0.7.0、Version ID `f012d8a5-63e2-4ae1-a901-a3bfa4583618`。
- 本番smokeでhealth v0.7.0、OAuth必須、Web dashboard、authorization endpointを確認済み。
