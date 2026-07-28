# ADR 0005: main pushからCloudflare本番へ自動デプロイする

- 状態: 採用
- 日付: 2026-07-28
- 対象: Remote MCP、Web UI、公開発表renderer

## 文脈

本番の正本は `saijiyu-kenkyu.2764.moe` 上のCloudflare Workerであり、GitHub Pagesとの二重公開は不要になった。手元からの `wrangler deploy` だけでは、mainの内容と本番の対応が人間の操作に依存し、検証漏れやデプロイ忘れが起こる。

一方、D1 schemaとWorkerは同じ変更で更新されることがある。新しいWorkerが先に動くと未適用schemaを参照し得るため、migrationとコードの順序を固定する必要がある。VOICEVOX生成は実行時間と出力確認が必要なので、main pushの経路には含めない。

## 決定

`.github/workflows/deploy-mcp.yml` を本番CI/CDの正本とし、mainへのpushと手動実行で次を直列実行する。

1. lockfileどおりに依存を導入する。
2. `bun run test:mcp` でWorker型、TypeScript、contract test、deploy dry-runを検証する。
3. `bun run migrate:mcp` で未適用のD1 migrationを本番へ適用する。
4. `bun run deploy:mcp` でWorkerをデプロイする。
5. `bun run smoke:mcp` で本番healthとMCP初期化を確認する。

同時実行は `deploy-mcp-production` concurrency groupで直列化し、進行中の本番デプロイは新しいpushでキャンセルしない。workflowの権限はrepository contentsのreadだけにし、account IDはGitHub Actions variable、API tokenはsecretからWranglerの環境変数へ渡す。

D1 migrationは、適用直後から既存Workerでも動く後方互換な変更を原則とする。破壊的変更が必要な場合は「追加 → Worker切替 → 後続migrationで削除」の複数段階へ分ける。検証またはmigrationが失敗した場合はWorkerを更新しない。デプロイ後のsmoke失敗はworkflowを失敗にするが、自動rollbackは行わず、Cloudflareのversion履歴から原因を確認して明示的に戻す。

## 認証情報

GitHub repositoryのActions設定へ次の2件を登録する。API tokenの値はソース、workflow、ログへ書かない。

- Variable `CLOUDFLARE_ACCOUNT_ID`: 対象Cloudflare account ID
- Secret `CLOUDFLARE_API_TOKEN`: 対象accountと `2764.moe` zoneに限定したAPI token

API tokenはCloudflareの `Edit Cloudflare Workers` templateを基礎にresourceを対象account／zoneへ絞り、D1 migrationのためaccount権限 `D1 Edit` も付与する。Worker内で使う `TWITCH_CLIENT_ID` と `TWITCH_CLIENT_SECRET` は引き続きCloudflare Worker secretであり、GitHubへ複製しない。Wrangler deployは既存Worker secretを削除しない。

## 結果

- mainへ入った内容だけが、同じ固定手順を通って本番になる。
- GitHub Pagesのmain push workflowは削除する。GitHub Actionsはホスティング先ではなくCI/CD制御面としてだけ使う。
- VOICEVOX Actionは手動／`voice-*` tagの生成・試聴artifactに限定し、本番デプロイを行わない。
- Cloudflare API tokenの失効・権限不足、またはGitHub variable／secret未登録時は、認証値を表示せず早期に失敗する。

## 参考

- [Cloudflare Workers: GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare D1: Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Wrangler: System environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)
