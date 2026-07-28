# 最自由研究 Web Presentation

複数の「最自由研究」をこのリポジトリで管理し、それぞれをクリック進行型のWebスライドとして発表するための基盤です。

関連設計資料： [Twitch認証つきRemote MCPの構成・実装計画](docs/remote-mcp-plan.html)

現在は、まず自分の研究を制作・発表できることを優先しています。他の人が配布物として簡単にカスタマイズできる状態への整備は将来の範囲です。

本番の入口は `saijiyu-kenkyu.2764.moe` です。Remote MCP v0.8.0は `apps/mcp-server/` からTwitch OAuth必須で稼働し、資格判定、所有者分離されたversion付き研究CRUD、伴走prompt、安全な発表rendererを提供します。同じWorkerのWeb UIでは、自分の研究を一枚ずつ確認・編集し、画像、固定preview、公開版を管理できます。mainへのpushは検証後にD1 migrationとWorkerをCloudflareへ自動デプロイします。GitHub Pagesは公開経路に含めません。

## できること

- クリック、Space、Enter、矢印キーでスライドと段階表示を進める
- Googleスライドのワイド画面と同じ16:9の枠内に発表内容を収める
- タイマー、進捗、音声、操作ボタンをスライド枠の外側に表示する
- 同じ研究内容を演出型・BIIM型・資料型の3レイアウトで比較する
- 研究ごとに独立したURLを持つ
- スライド枚数、全体進捗、想定経過時間、実経過時間を常時表示する
- スライドごとに想定時間を設定する
- 全画面表示する
- 読み上げ原稿をADV風・実況字幕風・本文型の3形式で画面に表示する
- ページや段階を進めると、ブラウザ標準の日本語音声または用意した音声ファイルで自動的に読み上げる
- 読み上げの現在位置と全体の長さをインジケーターで表示する
- 読み上げ音量を調整し、端末のブラウザへ保存する
- 音声終了後に次の段階へ進む自動送りを切り替える
- 現在のスライドと段階をURLへ反映し、再読み込み・共有・ブラウザ履歴から復帰する
- CSSだけで画面遷移・段階表示・背景・グラフをアニメーションする

## 開始方法

依存関係を初回だけインストールします。

```bash
bun install
```

編集用サーバーを起動します。

```bash
bun run dev
```

表示されたURLを開くとテンプレートが表示されます。直接開く場合は `/present/starter` です。発表内容は常に16:9の枠を保ち、ブラウザサイズに合わせて枠全体が拡大・縮小します。

提出前の確認は次で行います。

```bash
bun run test
```

## Remote MCPを開発する

CodexとChatGPTを優先するRemote MCPがあります。`health`、`get_access_status`、研究の作成・一覧・取得・更新・評価材料取得、研究画像の一覧・削除、制作ガイドresource、3つの伴走prompt、Twitch OAuthによるフォロー期間・サブスク・運用overrideの資格判定を実装しています。`https://saijiyu-kenkyu.2764.moe/`では、同じTwitchアカウントでログインして自分の研究一覧・詳細と画像を管理できます。画像binaryの追加はMCP JSONへ埋め込まずWeb UIから行います。

```bash
bun run dev:mcp
bun run test:mcp
bun run build:mcp
```

`bun run test:mcp` は、設定から生成したWorker型、型検査、Workers runtime上のMCP contract、Cloudflare deployのdry-run buildをブラウザなしで確認します。詳しくは [MCP server README](apps/mcp-server/README.md) を参照してください。

## Cloudflare本番へデプロイする

mainへのpush、またはActions画面からの手動実行で `Deploy Remote MCP to Cloudflare` が動きます。依存導入、`bun run test:mcp`、未適用D1 migration、Worker deploy、本番smokeのいずれかが失敗するとworkflowも失敗します。

初回だけ、GitHub repositoryの `Settings` → `Secrets and variables` → `Actions` に次を登録します。

- Actions variable `CLOUDFLARE_ACCOUNT_ID`
- Actions secret `CLOUDFLARE_API_TOKEN`（`Edit Cloudflare Workers` template + `D1 Edit`、対象account／zoneだけに限定）

通常pushではVOICEVOXを起動しません。`Generate VOICEVOX audio` は手動または `voice-*` tagだけで起動し、7日間の試聴artifactを作ります。本番音声は将来のCloudflare Container経路へ接続します。詳細は [MCP server README](apps/mcp-server/README.md) と [ADR 0005](docs/decisions/0005-main-push-cloudflare-deployment.md) を参照してください。

リポジトリ直下の旧発表アプリは、移行期間中のローカル比較用として残しています。Cloudflare本番の公開発表は、Worker内の安全なrendererとR2上の固定revisionを正本にします。

## 対話しながら研究を作る

リポジトリ内の `research-companion` スキルが、テーマ探しから提出前評価まで一問ずつ伴走します。Codexでは `.agents/skills/research-companion/`、Claudeでは `.claude/skills/research-companion/` から同じ正本を利用します。

依頼例：

```text
$research-companion を使って、最自由研究のテーマ探しから相談したい。
```

スキルは次の流れで進みます。

1. 今回の対象とゴールを確認する
2. 一度に一問だけ尋ね、本人の関心・問い・方法を深掘りする
3. 節目で `researches/<slug>/README.md` に決定と未確定事項を残す
4. 8観点の基準で根拠付き評価を行う
5. 最優先の弱点につながる一問へ戻る
6. 内容が固まってからdeck、読み上げ、BIIM補足欄を制作する

評価では、問い、仮説、方法、証拠、考察、本人性、発表構成、信頼性を各0〜4で確認します。判断材料がない項目は無理に採点せず `NE` とし、提出可能判定では時間・出典・規約・公開URL・通し確認などの必須条件も別に確認します。

- [スキル本体](.agents/skills/research-companion/SKILL.md)
- [対話フロー](.agents/skills/research-companion/references/dialogue-flow.md)
- [評価基準](.agents/skills/research-companion/references/evaluation-rubric.md)

## 発表操作

| 操作 | キー／動作 |
|---|---|
| 次の段階・スライド | クリック、Space、Enter、→、PageDown |
| 前の段階・スライド | ←、Backspace、PageUp |
| 最初／最後へ | Home／End |
| タイマー開始・停止 | `T` または右上のボタン |
| 自動読み上げ ON／OFF | `M` または右下の音声ボタン |
| 読み上げ音量 | 右下の `VOL` スライダー。フォーカス中は矢印キーでも調整可能 |
| 自動送り ON／OFF | `A` または右下の `≫` ボタン |
| 全画面表示 | `F` または右下の全画面ボタン |

タイマーは配信開始前の待ち時間を含めないよう、発表開始時に手動で開始します。予定時刻は現在のスライドと段階表示から算出されます。実績が予定より30秒以上遅れると実績時間が赤くなります。

進行するたびにURLは `?slide=2&step=1` の形式で更新されます。`slide` は1始まりのスライド番号、`step` は0始まりの段階番号です。このURLを再読み込み・共有すると同じ位置から表示され、ブラウザの戻る／進むでも表示位置が復元されます。

## レイアウトパターン

上部の `STYLE` から3種類を切り替えられます。選択中の形式はURLの `layout` に反映されるため、その見た目を指定したURLを共有できます。

| 値 | 見た目 | 向いている研究 |
|---|---|---|
| `cinematic` | 現在の大きな文字・背景演出を使う標準形 | 写真、物語、印象的な結論 |
| `biim` | 左の主画面、右の研究メモ、下の読み上げ欄に固定分割 | 情報量が多い解説、比較、実況形式 |
| `minimal` | 白地、罫線、控えめな装飾の資料風 | 数値、文章、論理構成を読ませる発表 |

直接比較する例：`/present/starter?slide=2&step=1&layout=biim`

## 新しい研究を追加する

1. `researches/starter/` を新しい名前のフォルダとして複製する
2. `deck.tsx` の `slug`、題名、発表者、スライドを編集する
3. 素材を `public/researches/<slug>/` に置く
4. `researches/registry.ts` から新しい `deck` をimportし、`researchDecks`へ登録する
5. `/present/<slug>` を開いて確認する

研究同士を移動するナビゲーションは設けていません。配信時は発表する研究のURLを直接開きます。

## スライドの編集

各スライドでは次を設定します。

- `durationSeconds`: そのスライドの想定秒数
- `revealSteps`: クリックで段階表示する回数
- `tone`: `dark`、`light`、`signal`、`quiet` の画面テーマ
- deckの `layout`: `cinematic`、`biim`、`minimal` の既定レイアウト
- スライドの `sidebar`: BIIM右欄にだけ表示する、読み上げない任意のReact要素
- `narration.display`: `dialogue`、`commentary`、`inline` の表示形式
- `narration.speaker`: このスライドだけ話者名を変える場合に指定
- `narration.segments`: 段階表示ごとの原稿と音声

段階表示したい内容を `<Reveal at={1}>...</Reveal>` で囲みます。`at` の最大値と `revealSteps` を一致させてください。

読み上げも同じ `at` に対応させます。

```tsx
narration: {
  display: "dialogue",
  speaker: "ずんだもん",
  segments: [
    {
      at: 0,
      text: "まず、研究を始めたきっかけなのだ。"
    },
    {
      at: 1,
      text: "最初の疑問はこちらなのだ。"
    }
  ]
}
```

BIIM型の右欄は `sidebar` へ自由に記述します。これは `narration` とは別のため、VOICEVOXの生成対象にはなりません。

```tsx
sidebar: (
  <div className="biim-custom-content">
    <p>AUTHOR&apos;S NOTE</p>
    <strong>作者からの補足コメント</strong>
    <ul>
      <li>読み上げない注意点</li>
      <li>追加データや観察メモ</li>
    </ul>
  </div>
)
```

文字だけでなく、画像、表、独自コンポーネントなど任意のReact要素を配置できます。`sidebar` がないスライドには、スライド番号・段階・予定時刻の標準情報が表示されます。

### 原稿の表示形式

| 値 | 見た目 | 向いている内容 |
|---|---|---|
| `dialogue` | 画面下部のADV風会話枠。`speaker`指定時だけ話者名を表示 | ストーリー、掛け合い、長めの説明 |
| `commentary` | 太い文字と話者ラベルを使った実況字幕 | テンポの速い説明、結果発表、ツッコミ |
| `inline` | 原稿全体をスライドの一部として配置し、現在文を強調 | 論理的な説明、読み返してほしい内容 |

表示文と読み上げ文は同じ `text` を使うため、二重管理は不要です。`inline` は全原稿を表示し、現在読み上げる段落を強調します。狭い画面では可読性を優先して現在段落だけを表示します。

## 読み上げについて

音声ファイルがない場合は、Web Speech APIによるブラウザ標準の日本語読み上げを使います。これが通常の開発方法です。声質はOS・ブラウザごとに異なります。ページや段階を進めると、その位置に対応する原稿が自動再生されます。再生済みの原稿を個別に再生する操作は設けていないため、もう一度聞く場合は一度前へ戻ってから進めます。

右下の音声ボタンは今後の自動読み上げを止めるミュート切替です。`≫` の自動送りをオンにすると、音声の終了後に次の段階へ進み、そのまま発表を連続再生します。音声のない段階では短い待ち時間の後に進みます。初期状態では自動読み上げがオン、自動送りがオフです。

`VOL` スライダーの音量はブラウザの `localStorage` に保存され、次回同じ端末で開いたときに復元されます。MP3等の音声ファイルは再生中にも変更が反映されます。ブラウザ標準読み上げは、現在の文が終わった後、次の文から新しい音量になります。

### 開発環境で読み上げを確認する

```bash
bun run dev
```

1. 表示されたURL、または `/present/starter` を開く
2. クリックやSpaceで段階を進め、自動的に音声が始まることを確認する
3. 下部の `VOICE` バーで再生位置と再生時間を確認する
4. `A` キーまたは `≫` ボタンで自動送りをオンにし、音声終了後に次へ進むことを確認する
5. 音声を止めたい場合は `M` キーまたは音声ボタンで自動読み上げをオフにする

`audioSrc` がないsegmentはブラウザ標準音声、あるsegmentは指定した音声ファイルを再生します。ブラウザ標準音声が聞こえない場合は、OSの音声出力、ブラウザのサイト音声設定、日本語音声のインストール状況を確認してください。

### ローカルでVOICEVOX音声を確認する

この手順は任意です。VOICEVOX ENGINEとffmpegを用意できない場合は、通常のブラウザ読み上げだけで制作を進められます。

VOICEVOX ENGINEを起動します。Dockerを使う場合：

```bash
docker run -d --rm \
  --name ultimate-freestyle-voicevox \
  -p 127.0.0.1:50021:50021 \
  voicevox/voicevox_engine:cpu-latest
```

利用可能な話者・スタイルを確認できます。

```bash
bun run voicevox:list
```

別途 `ffmpeg` コマンドをインストールしたうえで、登録済み研究の全segmentを一括生成します。

```bash
bun run voicevox:generate -- starter
```

全研究をまとめて生成する場合：

```bash
bun run voicevox:generate -- --all
```

`voicevox:list` は `style_id / speaker_uuid / 話者名 / style名` を表示します。研究ごとの`deck.tsx`では、名前ではなく`voicevox.profiles`の`speakerUuid + styleId`で声を固定します。`starter`には、ずんだもんと四国めたんの例が入っています。

```tsx
voicevox: {
  catalogRevision: "voicevox-engine-0.25.1",
  defaultProfileId: "zundamon-normal",
  profiles: [{
    id: "zundamon-normal",
    label: "ずんだもん（ノーマル）",
    speakerUuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    speakerName: "ずんだもん",
    styleId: 3,
    styleName: "ノーマル",
    tuning: { speedScale: 1.05, pitchScale: 0 }
  }]
}
```

segmentごとに`voiceProfileId`を選び、`voiceTuning`でその文だけ調整できます。対応値は話速`speedScale`、音高`pitchScale`、抑揚`intonationScale`、音量`volumeScale`、ポーズ倍率`pauseLengthScale`、前後無音`prePhonemeLength`／`postPhonemeLength`です。

`voicevox`がまだない旧deckだけは、既定の「ずんだもん／ノーマル」を使います。環境変数で変更する場合：

```bash
VOICEVOX_SPEAKER="四国めたん" \
VOICEVOX_STYLE="ノーマル" \
bun run voicevox:generate -- starter
```

旧deckの調声は`VOICEVOX_SPEED`、`VOICEVOX_PITCH`、`VOICEVOX_INTONATION`、`VOICEVOX_VOLUME`、`VOICEVOX_PAUSE_LENGTH`、`VOICEVOX_PRE_PHONEME`、`VOICEVOX_POST_PHONEME`で変更できます。profileがあるdeckではdeck側の値を正本にします。MP3のビットレートは`VOICEVOX_MP3_BITRATE`で変更でき、既定は音声向けのモノラル64kbpsです。生成先は次の形式です。

```text
public/.voicevox-preview/researches/<slug>/audio/<slide-id>-<at>.mp3
```

この領域は `.gitignore` の対象で、ローカル確認用MP3を誤ってコミットしません。生成後はVOICEVOX確認用サーバーを起動します。

```bash
bun run dev:voicevox
```

通常の`bun run dev`はプレビューMP3を参照せず、ブラウザ読み上げを使います。生成音声を使う表示では、profileに含まれる話者から`VOICEVOX:キャラクター名`のクレジットを重複なく自動表示します。公開前には各話者・キャラクターの最新規約も確認してください。

manifest v2のfingerprintには原稿、speaker UUID、style ID、全調声値、ENGINE／core／話者version、話者catalog、ユーザー辞書、MP3設定を含めます。ローカル生成は`unverified-local`として扱い、将来のCloudflare Container本番cacheとは混ぜません。

### GitHub ActionsでVOICEVOXを試聴する

ローカルへVOICEVOXを導入せず、GitHub Actions上の公式CPU DockerイメージでMP3を生成し、7日間のartifactとして試聴できます。通常のpushでは音声生成せず、次のどちらかで明示的に起動します。

- Actions画面の `Generate VOICEVOX audio` → `Run workflow` から、研究slug・話者・スタイルを指定する
- `voice-*` 形式のタグをpushし、登録済みの全研究を既定の「ずんだもん／ノーマル」で生成する

```bash
git tag voice-2026-08-01
git push origin voice-2026-08-01
```

各segmentの原稿、話者、話速、ENGINEバージョン等からfingerprintを作り、前回と一致するMP3はActionsキャッシュから再利用します。キャッシュがない場合、設定を変更した場合、または `regenerate_all` を選んだ場合は再生成します。

生成したMP3はworkflow runの `Artifacts` に7日間保存されます。このworkflowはCloudflare本番もGitHub Pagesも更新しません。

ローカル確認用・Actions生成用・本番用を問わず、VOICEVOXのMP3はリポジトリへコミットしません。`public/researches/*/audio/*.mp3` も `.gitignore` の対象です。本番の音声は将来Cloudflare Containerで生成してR2へ保存し、fingerprintが一致する限り再利用します。Git LFSも使いません。

音声は意図やイントネーションを人が確認してから公開する必要があるため、Actionからmainへの自動コミットは行いません。また、Release公開とタグpushの両方をトリガーにすると同じ版で二重実行しやすいため、専用タグだけを自動トリガーにしています。

`main` pushのCloudflareデプロイworkflowはVOICEVOX ENGINEを起動しません。したがって、Workerや原稿だけを変更したpushで音声生成時間を消費しません。

ずんだもん等の特徴的な声を使う前に、音声合成ソフト・話者・キャラクターそれぞれの最新の利用規約とクレジット条件を確認してください。

## 資料

- [2026年企画前提](docs/最自由研究2026.md)
- [設計と管理方針](docs/設計.md)
- [Claude向け作業指示](CLAUDE.md)
