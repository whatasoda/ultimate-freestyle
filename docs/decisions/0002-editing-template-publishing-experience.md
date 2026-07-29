# ADR 0002: 小粒度編集・宣言的テンプレート・確認後公開

- 状態: 採用
- 日付: 2026-07-27
- 対象: Remote MCP、Web UI、発表 renderer、公開成果物

## あるべき体験

利用者は Codex / ChatGPT との対話で研究を作り、同じ下書きを Web UI で確認する。AI は研究全体を毎回送り直さず、問い、仮説、ログ、スライドなど変更した箇所だけを更新する。利用者は Web UI から短い文言を直し、現在の version をプレビューし、その表示を確認した後に同一の固定版を公開する。

成功条件は次の通り。

1. MCP の各書き込み tool は一つの意図に対応し、巨大な project document を入力に要求しない。
2. すべての変更は `expected_version` による楽観的排他制御を行い、成功時は新しい version と変更対象だけを返す。
3. Web UI はタイトル、概要、問い、仮説、方法などの軽微編集を行え、競合時に上書きしない。
4. 発表の見た目は利用者が宣言的テンプレートとして追加できる。ただし任意 HTML、JavaScript、外部 URL を保存・実行しない。
5. プレビューは現在の project version から不変の HTML 成果物を生成する。公開は確認済みプレビューへの参照を切り替える操作とし、下書きの変更で公開物が暗黙に変わらない。
6. AI agent が実 OAuth 以外をブラウザなしの contract test で再現できる。

## 操作フロー

### AI クライアント

1. `list_projects` で対象を選ぶ。
2. `get_project_outline` または対象 section / slide を読み、現在 version を得る。
3. `update_project_fields`、`append_research_log`、`create_slide`、`update_slide`、`delete_slide`、`move_slide` など、変更目的に合う tool を一回呼ぶ。
4. 競合時だけ該当範囲を再取得して相談・再試行する。
5. 発表を構成したら Web UI のプレビュー確認を案内する。

全体置換の `update_project` は外部利用者がいない現段階で廃止する。

2026-07-29追補: tool定義全体が338,689 byteへ増えたため、全量の`get_project`と`evaluate_project`も廃止した。全量取得は`research://projects/{id}`、評価基準は`research://guide/evaluation`を使い、tool一覧へ巨大な出力schemaを重複させない。

### Web UI

1. Twitch ログイン後、自分の研究一覧から詳細を開く。
2. 「基本情報を編集」で短い文言を保存する。保存中、成功、競合、失敗をその場に表示する。
3. 発表構成と公開状態を確認し、「プレビューを作成」で現在 version の固定版を生成する。
4. 新しいタブで固定版を確認する。
5. 下書きがプレビュー後に変わっていない場合だけ「このプレビューを公開」で公開 URL を有効化・更新する。

## 責務境界

| プラットフォームが管理するもの | 利用者が定義できるもの |
|---|---|
| スライド番号、進行、reveal、URL 状態 | テンプレート名、レイアウト preset |
| 読み上げ開始、表示、進捗、音量 | narration 本文、表示形式、声 profile |
| 16:9 stage、操作ボタン、アクセシビリティ | 色、角丸、余白、文字 scale |
| CSP、escape、データ検証 | main / sidebar の領域比率 |
| プレビュー成果物、公開 pointer | enter / reveal animation preset |

任意 HTML / JavaScript / CSS は受け付けない。CSS は URL や任意 selector を含まない検証済み design token へ限定する。renderer は次の安定した hook を出力する。

- `data-slide-id`
- `data-template-id`
- `data-layout`
- `data-tone`
- `data-region="main|sidebar|narration"`
- `data-reveal-at`
- `data-animation`
- `data-state="active|inactive"`

この境界により、データ由来の script 実行を避けながら、利用者テンプレートと進行 engine を独立して発展させられる。

## データと公開

- project JSON は下書きの正本で、各編集につき version を一つ増やす。
- template は project 内に保存し、slide は `template_id` で参照する。
- preview は private R2 の不変 HTML と D1 revision row から成る。
- publish は stable slug から revision への D1 pointer とする。
- preview 作成時に R2 書き込みが成功し D1 記録が失敗した場合は、可能な範囲で object を削除する。
- 公開は `preview.project_version === current project.version` のときだけ許可する。
- 公開 HTML は Worker が `text/html; charset=utf-8`、`nosniff`、厳格な CSP 付きで配信する。

## 段階的実装

1. 小粒度 repository mutation と MCP contract。
2. 宣言的 template schema、標準 data attribute、renderer。
3. Web UI の基本情報編集。
4. immutable preview / publish revision と Web UI 導線。
5. slide / template の高度な GUI 編集、公開履歴と rollback。

初回実装では、AI 側は slide と template の構造編集まで、Web UI 側は基本情報の軽微編集と preview / publish 操作までを完成条件とする。
