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
