# Remote MCP server

最自由研究の制作機能をCodexやChatGPTへ提供するCloudflare Workerです。現段階は認証前の最小実装で、`health` toolと固定resourceだけを公開します。

## 開発と検証

リポジトリルートから実行します。

```bash
bun run dev:mcp
bun run build:mcp
bun run test:mcp
bun run types:mcp
bun run smoke:mcp
```

`bun run test:mcp` は生成型の同期、型検査、Workers runtime上のcontract test、deployのdry-run buildを連続実行します。`/healthz`、未知のURLに対する構造化404、`/mcp`のStreamable HTTP初期化、`health` tool呼び出し、固定resource取得をブラウザ操作なしで検証します。

ローカル接続先は通常 `http://localhost:8787/mcp` です。MCP InspectorまたはCodexから接続し、`health`を呼び出してください。

本番は `whatasoda` Cloudflareアカウントのカスタムドメインへ配置します。

- ヘルスチェック: `https://saijiyu-kenkyu.2764.moe/healthz`
- Remote MCP: `https://saijiyu-kenkyu.2764.moe/mcp`

`bun run smoke:mcp` は、本番のヘルスチェックとMCP初期化をブラウザなしで検証します。別環境を検証するときだけ、`MCP_BASE_URL` にoriginを指定してください。デプロイはリポジトリルートで `bun run deploy:mcp` を実行します。

2026-07-26時点でWorker、Custom Domain、DNS、TLSは本番配置済みです。D1、KV、R2、Queue、ContainerとTwitch secretは、対応する機能を実装する段階で追加します。

## 設定

秘密ではない初期値は `wrangler.jsonc` の `vars` に置きます。

- `TWITCH_BROADCASTER_ID=67879379`
- `TWITCH_BROADCASTER_LOGIN=kashiwo`
- `MIN_FOLLOW_DAYS=30`

Twitch client secretなどの秘密値は、実装後にWranglerのsecretとして登録します。ソースや`vars`には書きません。
