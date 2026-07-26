# Remote MCP server

最自由研究の制作機能をCodexやChatGPTへ提供するCloudflare Workerです。`health`、`get_access_status`、固定resourceと、Twitch OAuthによる利用資格判定を実装しています。本番はTwitchアプリの秘密情報を投入するまで認証無効で運用します。

## 開発と検証

リポジトリルートから実行します。

```bash
bun run dev:mcp
bun run build:mcp
bun run test:mcp
bun run types:mcp
bun run smoke:mcp
```

`bun run test:mcp` は生成型の同期、型検査、Workers runtime上のcontract test、deployのdry-run buildを連続実行します。MCP初期化とtool/resourceに加え、fixture化したTwitch APIを使って、Dynamic Client Registration、PKCE、CSRF、Twitch callback、資格判定、MCP token発行までをブラウザなしで検証します。

ローカル接続先は通常 `http://localhost:8787/mcp` です。MCP InspectorまたはCodexから接続し、`health`を呼び出してください。

本番は `whatasoda` Cloudflareアカウントのカスタムドメインへ配置します。

- ヘルスチェック: `https://saijiyu-kenkyu.2764.moe/healthz`
- Remote MCP: `https://saijiyu-kenkyu.2764.moe/mcp`

`bun run smoke:mcp` は、本番のヘルスチェックとMCP初期化をブラウザなしで検証します。別環境を検証するときだけ、`MCP_BASE_URL` にoriginを指定してください。デプロイはリポジトリルートで `bun run deploy:mcp` を実行します。

2026-07-26時点でWorker v0.2.0、Custom Domain、DNS、TLS、OAuth用KV、state用KV、D1と期限切れOAuthデータを清掃するcronは本番配置済みです。D1の`0001_auth.sql`も適用済みです。R2、Queue、Containerは後続Phaseで追加します。

## 設定

秘密ではない初期値は `wrangler.jsonc` の `vars` に置きます。

- `TWITCH_BROADCASTER_ID=67879379`
- `TWITCH_BROADCASTER_LOGIN=kashiwo`
- `MCP_AUTH_MODE=disabled`
- `MIN_FOLLOW_DAYS=30`
- `ELIGIBILITY_CACHE_TTL_SECONDS=1800`

ローカルでは`.dev.vars.example`を`.dev.vars`へコピーし、Twitch開発者コンソールの値を設定します。`.dev.vars`はGit対象外です。

本番有効化ではTwitchアプリのcallback URLを`https://saijiyu-kenkyu.2764.moe/oauth/twitch/callback`にし、`TWITCH_CLIENT_ID`と`TWITCH_CLIENT_SECRET`をWrangler secretとして登録します。ソースや`vars`には書きません。その後`MCP_AUTH_MODE`を`twitch`へ変更し、型生成、全体検証、デプロイ、実アカウントでのOAuth確認を行います。
