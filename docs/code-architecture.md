# コード構成と品質境界

この文書は、機能仕様ではなく実装の置き場所、依存方向、テスト責任を定める。発表仕様は`docs/設計.md`、インフラ構成は`docs/remote-mcp-plan.html`、個別判断は`docs/decisions/`を正本とする。

## 依存方向

```text
Cloudflare entrypoint
  apps/mcp-server/src/index.ts
        │
        ├── MCP transport ── server.ts ── domain tools
        ├── Web transport ── web/router.ts ── request-schemas.ts
        └── background ───── voicevox/service.ts
                                  │
transport ──> service ──> repository ──> generated Env bindings
                    └──> schema / pure renderer
```

- `index.ts`はfetch、scheduled、queueの入口だけを持ち、業務規則を増やさない。
- `web/router.ts`はHTTP認証、method、path、schema検証、service呼び出し、HTTP responseへの変換を担う。
- `web/request-schemas.ts`はWeb UIから受けるJSON契約だけを持つ。D1、R2、Queue、HTML生成へ依存させない。
- `projects/`、`reviews/`、`assets/`、`voicevox/`、`publications/`は各domainのschema、service、repository、MCP toolを持つ。
- repositoryだけがD1やR2の永続化形式を知り、UIやMCP toolからSQLを直接実行しない。
- `presentation/render.ts`は検証済みprojectから自己完結HTMLを生成する。所有者判定や永続化を持たない。
- `web/pages.ts`、`web/assets.ts`は表示生成に閉じ、domain更新を行わない。

逆向きの依存、domain間の循環、Web UIだけで成立する業務規則を追加しない。共有が必要な規則はschemaまたはdomain serviceへ置く。

## 現在の集中箇所

2026-07-31時点では次のファイルが大きい。

| ファイル | およその行数 | 現在の責任 | 次の分割境界 |
|---|---:|---|---|
| `web/router.ts` | 4,900 | 全Web pathと更新handler | 認証済みroute群をproject、slide、voice、publication単位へ分ける |
| `web/assets.ts` | 4,800 | dashboardのbrowser runtime | preview、form保存、review、voice、asset単位のbrowser module |
| `web/pages.ts` | 3,200 | HTML shell、CSS、全画面 | shell／style、dashboard、project、slide、voice、review |
| `presentation/render.ts` | 3,100 | HTML生成、CSS、browser runtime | server render、style、runtime protocol |
| `projects/mutation-tools.ts` | 2,800 | MCPの変更tool | research、deck、slide、component、template |

巨大ファイルを行数だけで分割しない。同じ入力契約、同じ永続化境界、同じruntime protocolを一緒に移し、公開APIと回帰テストを先に固定する。新規の通常moduleは500行程度、通常functionは80行程度を目安とし、超える場合は責任を再確認する。自己完結HTML・CSS文字列は生成物として別に扱うが、周辺の業務処理を混ぜない。

## テストの層

1. pure contract test
   - schema、計算、renderer helper、error mappingをbindingなしで確認する。
2. Workers runtime test
   - `@cloudflare/vitest-pool-workers`上でD1、KV、R2、Queue、OAuth、MCP、Web routeを確認する。
3. generated artifact test
   - 発表HTML、dashboard JS、CSSのCSP、escape、runtime protocol、versionを確認する。
4. deploy smoke
   - main push後にmigration、Worker、Container、本番endpointを確認する。

`bun run test:mcp`は型生成確認、TypeScript、Istanbul coverage付きWorkers test、dry-run deployを実行する。coverageだけを見る場合は`bun run test:mcp:coverage`を使い、詳細は`coverage/mcp-server/coverage-summary.json`へ出力する。

基準値は現在の実測値を下回らないための下限であり、品質の最終目標ではない。

| 指標 | CI下限 | 2026-07-31実測 |
|---|---:|---:|
| statements | 75% | 75.52% |
| branches | 66% | 66.81% |
| functions | 86% | 86.96% |
| lines | 77% | 77.46% |

Cloudflare Workers Vitest integrationはV8 coverageに対応していないため、Istanbulのinstrumented coverageを使う。`String.raw`内のbrowser JavaScriptはTypeScriptの行coverageだけでは実行品質を示さないため、生成文字列のcontract testと実ブラウザ確認を別に残す。

## 変更時の手順

1. 変更対象の公開contractと、現在の成功・失敗responseをテストで固定する。
2. schema、transport、service、repositoryのどの境界かを決める。
3. 移動と振る舞い変更を同じcommitへ混ぜない。
4. `bun run test:mcp:coverage`で下限と未検証行を確認する。
5. `bun run test`で旧発表アプリを含む全体を確認する。
6. renderer、dashboard asset、MCP serviceのversionは外部artifactが変わる場合だけ上げる。

## 次に進める整理

優先順は次の通りとする。

1. `web/router.ts`のpath matchingを純粋なroute contractへ抽出し、優先順位とparameter抽出をtable testにする。
2. 単一の巨大な`web.spec.ts`から、未認証ページ、asset、project編集、slide編集、voice、publicationを独立fixtureへ分ける。
3. `web/pages.ts`のCSSと共通shellをページ生成から分離する。
4. dashboardとpresentationの`postMessage`契約を共有schemaへ置き、親子双方で検証する。
5. `web/assets.ts`と`presentation/render.ts`のbrowser runtimeを責務別sourceへ分け、build時に一つのself-contained artifactへ合成する。

この順序なら、外部の機能やURLを変えずに、最も変更頻度の高いWeb編集経路から安全に境界を作れる。
