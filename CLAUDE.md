# Claude Code instructions

このリポジトリは、カシヲ氏の「最自由研究」を制作・発表するためのworkspaceです。返答、設計文書、コードコメントは原則として日本語を使ってください。

まず `AGENTS.md` を読む。リポジトリ共通の方針、移行状態、MCP実装ルールはそちらを正本とし、このファイルには重複させない。ここにはClaudeで作業するときの読み順、面ごとの担当、skillの選び方だけを置く。

## 対象

アプリは1つで、`apps/mcp-server/` にRemote MCP・制御画面・発表rendererが同居する。研究データはD1、素材はR2に置く。共有schemaは `packages/research-schema/`。

旧発表アプリ（Next.js）は2026-09-05に削除した。移行途中のまま実データの研究を持たず（`researches/` はstarterのみ）、GitHub Pagesへの公開も既に終えていた一方、そのビルド依存（vinext系）の脆弱性が本番Workerのデプロイを止めていた。復元が要るときは `git show df5a31c^:app` のように履歴から取り出す。

## 正本と履歴

読む順は目的で決める。全部を先に読まない。

| 知りたいこと | 正本 |
|---|---|
| 提出条件 | `docs/最自由研究2026.md` |
| 現行システムの仕様（URL、公開方式、スライド構成、レビュー、音声） | `docs/設計.md` |
| Cloudflare構成と移行段階 | `docs/remote-mcp-plan.html` |
| 実装の置き場所、依存方向、テスト責任 | `docs/code-architecture.md` |
| 制御画面の役割分解（面の型、操作の意味、状態の系統） | `docs/dashboard-roles.md` |
| 制御画面のデザイン決定 | `docs/dashboard-design-system.md` |
| 個別の判断とその理由 | `docs/decisions/` |
| 発表デザインとAI制作の合格基準 | `docs/design-production-rubric.md` |

`docs/ux-improvement-log-*.md` と `docs/implementation-log-*.md` は**履歴であって正本ではない**。決定の背景を追うときだけ読み、現在の仕様として引用しない。矛盾したら上表の正本を優先する。

## skill

| 状況 | skill |
|---|---|
| 研究テーマ、問い、方法、記録、発表構成、評価をユーザーと対話して作る | `research-companion` |
| 制御画面のデザインを定義・適用・点検する | `dashboard-design` |

どちらも `.agents/skills/<name>/SKILL.md` が正本。`.claude/` 側はポインタなので、正本と参照ファイルを最初から最後まで読んでから作業する。

## コマンド

package.jsonのscriptは必ず `bun run <script>` で実行する。`bun test`、`bun build`、`bun deploy` はbun組み込みコマンドであり、scriptを実行しない。

全体:

- 検証: `bun run test`（`test:mcp` と同じ）
- lint: `bun run lint`

`apps/mcp-server/`:

- 開発: `bun run dev:mcp`
- 検証: `bun run test:mcp`（型生成確認、TypeScript、coverage付きWorkersテスト、dry-run deploy）
- 制御画面の実表示プレビュー生成: `bun run preview:dashboard`
- 本番デプロイ: `bun run deploy:mcp`

その他のscriptは `AGENTS.md` を見る。

## 制御画面を実表示で確認する

制御画面はTwitch OAuthの内側にあるが、`bun run preview:dashboard` が固定データから全ページのHTMLを `work/dashboard-preview/` へ生成する。ログインもD1もR2も不要で、CSSとJSは配信されるものと同一。`agent-browser` で開いて確認する。

サーバへ送る操作とスライド編集画面の中央プレビューiframeは動かない。それらの確認には `bun run dev:mcp` と実ログインが要る。

## 共通の制約

- 公開素材のURLへドメイン名を直接埋め込まない。同一host相対URLを使う。
- 新しい依存関係は、CSSと既存コードでは実現できない場合にだけ追加する。
- `prefers-reduced-motion` を壊さない。
- 音声なしでも研究内容が完全に伝わる状態を保つ。
- 作業前に `git status --short` を確認し、ユーザーの既存変更を保持する。
