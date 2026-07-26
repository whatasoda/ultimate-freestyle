# Claude Code instructions

このリポジトリは、カシヲ氏の「最自由研究」に複数の研究を提出するための制作・発表基盤です。返答、文書、コードコメントは原則として日本語を使ってください。

## 作業を始める前に

1. `docs/最自由研究2026.md` を読み、提出条件を確認する。
2. `docs/設計.md` を読み、研究の分離と発表UIの責務を確認する。
3. 対象研究の `researches/<slug>/README.md` を読み、研究内容と進捗を把握する。
4. `git status --short` を確認し、ユーザーの既存変更を保持する。

研究テーマ、問い、方法、記録、発表構成、評価をユーザーと対話して作る依頼では、`.claude/skills/research-companion/SKILL.md` を使う。正本である `.agents/skills/research-companion/SKILL.md` と、必要な参照ファイルを完全に読む。

## コマンド

このプロジェクトではBunを使う。package.jsonのscriptを実行するときは、必ず `bun run <script>` を使う。

- 開発: `bun run dev`
- ビルド: `bun run build`
- 検証: `bun run test`
- lint: `bun run lint`
- VOICEVOX話者一覧: `bun run voicevox:list`（ENGINE起動中のみ）
- VOICEVOX一括生成: `bun run voicevox:generate -- <slug>`（ENGINE起動中のみ）

`bun test`、`bun build`、`bun deploy` はpackage.jsonのscript実行には使わない。

## 変更方針

- 研究固有の内容は `researches/<slug>/` に置く。
- 研究固有の画像・動画・音声は `public/researches/<slug>/` に置く。
- 共通の発表操作、タイマー、進捗、読み上げは `components/presentation/` に置く。
- 研究を追加したら `researches/registry.ts` に登録する。
- 発表物間のナビゲーションは追加しない。各研究は `/present/<slug>` から直接開く。
- 1つの研究内でタイトルから結論まで完結させる。
- 発表時間は20分以内。設定した想定時間の合計も必ず確認する。
- アニメーションは発表内容を補助する範囲に留め、`prefers-reduced-motion` を壊さない。
- 本番操作を妨げるフォーム、モーダル、通常のサイトヘッダーは発表画面に追加しない。
- 発表内容は16:9の `.stage` 内に限定し、タイマー・進捗・音声・操作ボタンは枠外へ置く。スライド内の寸法にはコンテナ単位（`cqw`、`cqh`）を使い、画面全体の `vw`、`vh` に依存させない。
- レイアウトは `cinematic`、`biim`、`minimal` の3種類を維持する。研究データやスライド部品をレイアウト固有に分岐させず、`data-layout` 配下の共通CSSと補助クロームで表現する。
- 新しい依存関係は、CSSと既存コードでは実現できない場合にだけ追加する。

## スライド実装ルール

- `durationSeconds` は実際に読み上げて見積もる。
- `<Reveal at={n}>` の最大値と `revealSteps` を一致させる。
- `narration.segments[].at` も対応する `<Reveal at={n}>` と一致させる。
- 読み上げ原稿をスライド本文へコピーしない。表示と音声は必ず同じ `narration.segments[].text` を参照する。
- BIIM右欄の読み上げない補足はスライドの `sidebar` に置く。`narration` へ混ぜず、作者コメント・追加データ・画像等の任意要素を許可する。
- `speaker` は実際に話者名を見せたい場合だけ指定する。「ナレーション」のような汎用ラベルは表示しない。
- 原稿表示は、ストーリーなら `dialogue`、テンポ重視なら `commentary`、全原稿を読ませるなら `inline` を選ぶ。
- 1スライド1メッセージを基本とし、配信画面の縮小表示でも読める文字量にする。
- 引用・素材の出典は、スライド内または研究READMEに必ず残す。
- 音声ファイルを追加する場合は各segmentの `audioSrc` を使い、ファイルがなくても発表が止まらない構成にする。
- VOICEVOX生成ファイルは `public/researches/<slug>/audio/<slide-id>-<at>.wav` に置く。ENGINE本体やモデルはコミットしない。
- ページ・段階の移動後は対応するsegmentを自動再生し、音声終了時だけ自動送りする。個別の再読み上げ操作は追加しない。
- 読み上げ時間と再生位置は下部のインジケーターへ反映する。音声ファイルがない場合もブラウザ読み上げの推定値を表示する。
- 音量は `ultimate-freestyle:narration-volume` として `localStorage` に保存する。進行位置は保存せず、`?slide=<1始まり>&step=<0始まり>` とHistory APIで管理する。
- カシヲ氏本人の協力が必要な研究は、公式FAQに従い事前連絡が必要であることを研究READMEへ明記する。

## 完了条件

- `bun run test` が成功する。
- クリックとキーボードの両方で最初から最後まで進行できる。
- 予定時間・実時間・進捗表示が内容を隠さない。
- 1280×720相当で文字や操作部品が画面外へ出ない。
- 音声なしでも研究内容が完全に伝わる。
