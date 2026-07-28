# Repository agent instructions

このリポジトリは、最自由研究の制作・発表UIと、限定利用者向けRemote MCPを同時に管理するworkspaceです。返答、設計文書、コードコメントは原則として日本語を使います。

## 正本

- Cloudflare/MCPの目標構成と段階は `docs/remote-mcp-plan.html` を正本とする。
- 発表UIの現在仕様は `docs/設計.md`、提出条件は `docs/最自由研究2026.md` を読む。
- 研究の対話制作では `.agents/skills/research-companion/SKILL.md` を使う。

## 現在の移行状態

- `apps/mcp-server/` は新しいCloudflare Remote MCP。
- 本番入口は `saijiyu-kenkyu.2764.moe`。MCP、OAuth、公開発表、成果物は同一host内のpathで分ける。
- 発表アプリはまだリポジトリ直下にある。共有schemaとrendererを抽出する段階で `apps/presentation/` へ移す。
- 現行形式の外部利用者はいないため、GitHub Pagesとの後方互換層や二重公開は作らない。Cloudflare公開が成立した段階でPages固有処理を削除する。
- MCPはCodexとChatGPTを第一の受け入れ対象にする。標準MCPから外れる独自tool契約は作らない。

## コマンド

package.jsonのscriptは必ず `bun run <script>` で実行する。

- 全体検証: `bun run test`
- MCP開発: `bun run dev:mcp`
- MCP dry-run build: `bun run build:mcp`
- MCPのみ検証: `bun run test:mcp`
- MCP本番D1 migration: `bun run migrate:mcp`
- MCP本番デプロイ: `bun run deploy:mcp`
- MCP本番スモークテスト: `bun run smoke:mcp`
- Worker binding型生成: `bun run types:mcp`

## MCP実装ルール

- Streamable HTTPとステートレスな `createMcpHandler` を使い、リクエストごとに `McpServer` を生成する。
- toolの入力と出力はschemaで固定し、安定したerror code、`request_id`、変更後versionを返す。
- 読み取り・書き込み・公開をtool名、scope、annotationで区別する。
- Twitch APIはadapter越しに呼び、fixtureで資格判定を自動検証できるようにする。
- secretをソース、`wrangler.jsonc`、fixtureへ書かない。非秘密の対象broadcaster IDとフォロー日数だけを`vars`に置く。
- 汎用shell、任意コード、未検証HTMLをMCP toolとして公開しない。
- Workers binding型は手書きせず、`wrangler types`の生成物を使う。
- 実OAuthログイン以外は、AI agentがブラウザなしで再現できるcontract testまたはsmoke testを用意する。
