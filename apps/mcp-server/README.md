# Remote MCP server

最自由研究の制作機能をCodexやChatGPTへ提供するCloudflare Workerです。Twitch OAuthによる利用資格判定と、所有者分離された研究データの作成・再開・更新・評価・発表構成を標準MCPで提供します。本番MCPはTwitch OAuthを必須とし、未認証でもヘルスチェック、OAuth metadata、Web UIの入口を利用できます。

## 開発と検証

リポジトリルートから実行します。

```bash
bun run dev:mcp
bun run build:mcp
bun run test:mcp
bun run test:mcp:render
bun run types:mcp
bun run migrate:mcp
bun run smoke:mcp
```

`bun run test:mcp` は生成型の同期、型検査、Workers runtime上のcontract test、deployのdry-run buildを連続実行します。MCP初期化とtool/resourceに加え、fixture化したTwitch APIを使って、Dynamic Client Registration、PKCE、CSRF、Twitch callback、資格判定、MCP token発行、Webログイン、所有研究だけの一覧表示、ログアウトまでをブラウザなしで検証します。

`bun run test:mcp:render` はローカル待受やCloudflare bindingを使わず、HTML rendererと一枚編集ページの純粋な生成テストだけをNode環境で実行します。制限されたAI実行環境でも、背景、字幕、escape、scene component、構成outlineなどのデザイン変更を素早く検証できます。

ローカル接続先は通常 `http://localhost:8787/mcp` です。MCP InspectorまたはCodexから接続し、`health`を呼び出してください。

本番は `whatasoda` Cloudflareアカウントのカスタムドメインへ配置します。

- ヘルスチェック: `https://saijiyu-kenkyu.2764.moe/healthz`
- Remote MCP: `https://saijiyu-kenkyu.2764.moe/mcp`
- Web UI: `https://saijiyu-kenkyu.2764.moe/`
- ログイン後の研究一覧: `https://saijiyu-kenkyu.2764.moe/dashboard`

`bun run smoke:mcp` は、本番のヘルスチェックとMCP初期化をブラウザなしで検証します。別環境を検証するときだけ、`MCP_BASE_URL` にoriginを指定してください。手動デプロイはリポジトリルートで、`bun run migrate:mcp`、`bun run deploy:mcp`、`bun run smoke:mcp` の順に実行します。

2026-07-28時点でWorker v0.8.0、Custom Domain、DNS、TLS、OAuth用KV、state用KV、D1、private R2、Images binding、期限切れOAuth／Web sessionを清掃するcronを構成しています。D1 migration `0001`〜`0006`が認証、研究、Web session、画像metadata、固定発表revisionを管理します。QueueとContainerは後続Phaseで追加します。

## 本番デプロイ

mainへのpushは `.github/workflows/deploy-mcp.yml` を起動し、検証、未適用D1 migration、Worker deploy、本番smokeを直列実行します。途中で検証またはmigrationが失敗した場合はWorkerを更新しません。同時に複数のpushが来ても本番デプロイは直列化し、実行中のdeployをキャンセルしません。VOICEVOX生成はこの経路に含まれません。

GitHub repositoryの `Settings` → `Secrets and variables` → `Actions` に次を登録します。

- Actions variable `CLOUDFLARE_ACCOUNT_ID`: 対象Cloudflare account ID
- Actions secret `CLOUDFLARE_API_TOKEN`: `Edit Cloudflare Workers` templateを基礎に、対象account／`2764.moe` zoneだけへ限定し、accountの `D1 Edit` を加えたtoken

Twitchのclient ID／secretは既存のCloudflare Worker secretをそのまま使います。GitHub Actionsへは登録しません。variableまたはsecretが未登録なら、workflowは値を表示せず認証確認stepで停止します。詳しい判断とrollback方針は [ADR 0005](../../docs/decisions/0005-main-push-cloudflare-deployment.md) に記録しています。

研究データは512 KiB以内の固定schemaでD1へ保存します。`create_project`はidempotency key、`update_project`は`expected_version`を必須とし、再試行による重複作成と同時編集による上書きを防ぎます。`list_project_images`と`delete_project_image`も所有者を強制し、画像binaryやbase64はMCPレスポンスへ含めません。全操作で他利用者のproject／asset IDを指定しても存在を開示しません。

Web UIも同じD1の所有者IDで絞り込みます。Twitch確認後は、Twitch tokenやMCP tokenをCookieへ保存せず、D1に保存した24時間のWeb専用セッションを`HttpOnly`、`Secure`、`SameSite=Lax`の不透明Cookieで参照します。D1を使うことでログアウトを即時反映し、session cookieとCSRF cookieの両方が揃った場合だけ認証済みとして扱います。現在の画面機能は一覧、研究詳細、研究画像管理、研究の基本文言編集、一枚ごとの実表示・STEP確認、template・font・配色・animation編集、読み上げ枠・話者・VOICEVOX調声編集、構成詳細と見切れ診断、固定previewの確認と公開です。componentの追加・削除・親子構造変更はMCP対応AIクライアントから行います。

研究画像はJPEG、PNG、静止WebPの10MiB以下だけを受け付けます。実データから形式と寸法を検査し、最大辺2560px、WebP quality 85、2MiB以下へ正規化した一枚だけをprivate R2へ保存します。原本、EXIF、SVG、GIF、アニメーションは保存しません。上限は100画像/project、300画像/user、150MiB/userで、D1 triggerでも同時書き込み時の超過を拒否します。

構造化deckから自己完結HTMLを作るrendererも実装済みです。16:9／4:3の発表枠、cinematic／BIIM／minimal、7種類のvisual presetとfont preset、7種類の領域配置、5種類の表紙配置、段階表示、ADV会話枠・実況字幕・映像字幕・追従全文・最小字幕、音声file優先再生とブラウザ読み上げfallback、音量保存、自動送り、進捗とURL復帰を含みます。表紙前の0ページ目では画像・生成音声・fontをpreloadし、開始クリック後に経過時間と読み上げを始めます。文字と余白はbrowser全体ではなく選択した発表枠を基準に拡縮し、編集frameでは自動fit後も残る見切れを対象component付きで報告します。研究由来の文字列はHTMLと埋め込みJSONの両方でescapeします。発表成果物は画像snapshotとともにprivate R2の不変revisionへ保存し、所有者previewで確認した研究versionとrenderer versionの両方が現在値と一致する場合だけWeb UIからstable URLへ切り替えます。

発表templateは任意CSSではなく、安全なtokenを組み合わせます。visual presetは`studio`、`paper`、`editorial`、`neon`、`retro-game`、`soft-pop`、`scientific`、font presetは`system-sans`、`gothic`、`rounded`、`mincho`、`serif`、`monospace`、`display`です。本文と見出しを別々に指定でき、密度、文字weight、行間、字間、色、領域比、余白、角丸、motionも調整できます。既存projectは追加fieldなしで従来どおり読み取れます。

## 設定

秘密ではない初期値は `wrangler.jsonc` の `vars` に置きます。

- `TWITCH_BROADCASTER_ID=67879379`
- `TWITCH_BROADCASTER_LOGIN=kashiwo`
- `MCP_AUTH_MODE=twitch`
- `MIN_FOLLOW_DAYS=30`
- `ELIGIBILITY_CACHE_TTL_SECONDS=1800`

ローカルでは`.dev.vars.example`を`.dev.vars`へコピーし、Twitch開発者コンソールの値を設定します。`.dev.vars`はGit対象外です。

本番有効化ではTwitchアプリのcallback URLを`https://saijiyu-kenkyu.2764.moe/oauth/twitch/callback`にし、`TWITCH_CLIENT_ID`と`TWITCH_CLIENT_SECRET`をWrangler secretとして登録します。ソースや`vars`には書きません。その後`MCP_AUTH_MODE`を`twitch`へ変更し、型生成、全体検証、デプロイ、実アカウントでのOAuth確認を行います。
