# ADR 0001: Web・画像・音声基盤のリリース前構成

- 状態: Accepted（リリース前のため訂正可能）
- 決定日: 2026-07-27
- 対象: Web UI、Web session、画像upload、VOICEVOX、Cloudflare配置

## 参加した検討

Codex本体に加え、次の3観点を独立したエージェントで調査し、相互の提案を照合した。

1. `daifuku-tw`比較: workspace分離、Cloudflare Worker、D1、認証、CI、入力上限、テストを比較
2. 画像基盤: R2、Cloudflare Images、direct upload、quota、所有権、整合性、費用を比較
3. VOICEVOX基盤: 話者catalog、調声、fingerprint、Queue、Container、ライセンスを比較

比較対象の`daifuku-tw`は`whatasoda/daifuku-tw`の`main`、commit `8410cef`を参照した。同repoには画像uploadの完成実装はなく、R2自己hostingとhot-link禁止が将来方針として記録されていた。

## 決定

### 1. Web UIとMCPは同一host、責務は分離する

- `saijiyu-kenkyu.2764.moe`のpath routingは維持する。
- OAuth、Twitch state、Web session、Web routing、HTML生成を別moduleへ分ける。
- Web UIは一覧、詳細、asset、音声jobの状態を明示し、loading、未認証、空、再試行可能errorを区別する。
- 次段階でtyped JSON APIを追加し、静的UIをWorkers Static Assetsへ移せる境界を作る。
- API responseはZod等で検証し、HTTP status、安定error code、`request_id`を失わない。

### 2. Web sessionはD1へ移す

KV sessionは即時失効とread-after-writeに向かない。OAuthの一回限りstateはKVに残し、Web sessionは`0003_web_sessions.sql`でD1へ移した。

- Cookieには256 bitの不透明tokenだけを置く。
- D1にはtoken hash、user ID、CSRF hash、認証時刻、期限を保存する。
- Twitch login名はsessionへ複製せず、表示時に`users`から読む。
- 一覧閲覧は24時間sessionを許可する。
- 画像upload、公開、VOICEVOX生成など費用または公開状態を変える操作は、資格確認から30分を超えていればTwitch再認証を要求する。
- Twitch tokenの長期保存は現段階では行わない。

### 3. request bodyはstream中にも上限を強制する

`Content-Length`だけを信頼しない。headerがないchunked bodyも読み取り中にbyte数を数え、上限を超えた時点でstreamをcancelする。認可form、logout、将来のJSON、画像uploadで同じreaderを使う。

### 4. 画像はprivate R2へ正規化済みの一枚だけ保存する

初期フローは次の通り。

```text
Web UIの認証済みsession + CSRF付きraw upload
  -> hard byte cap付きWorker
  -> hard byte cap
  -> Images binding .info()で形式・寸法検査
  -> scale-down + WebP quality 85 + anim false
  -> private R2
  -> D1 asset metadataをreadyへ更新
```

初期制限:

- JPEG、PNG、static WebPのみ。SVG、GIF、animated WebPは拒否する。
- 入力10 MiB、40 megapixel、1辺10,000 pxまで。
- 保存は最大2,560 x 2,560、WebP quality 85、最大2 MiB。
- 原本、EXIF、任意metadataは保存しない。
- 100画像/project、300画像/user、画像150 MiB/user、全media 250 MiB/user、同時pending 3件/user。
- object keyはserver生成とし、元filenameや任意pathを使わない。
- project documentは任意URLやbase64でなく`asset_id`を参照する。
- alt textは公開前に必須とする。

MAU 30人が全media quotaを使っても7.5 GBで、現在のR2 Standard free tier 10 GB以内に収まる。閲覧時に毎回変換せずupload時に一度だけ正規化し、変換数を予測可能にする。

MCP upload intent、Direct Creator Upload、presigned R2 uploadは、AIクライアントからのbinary転送、10 MiB超、resume、動画対応が必要になった場合だけprivate staging + Queueとして導入する。初期には検査前objectと掃除対象が増えるため採用しない。

### 5. VOICEVOXは全talk styleと複数voice profileへ対応する

- ずんだもんを特別扱いしない。
- `/speakers`の`speaker_uuid`と`styles[].id`を安定参照に使い、名前は表示snapshotとする。
- `talk` styleだけを初期対象にし、singingとmorphingは後段に分ける。
- project既定profile、複数profile、segment単位のprofile選択と調声上書きを持つ。
- 話速0.50..2.00、音高-0.15..0.15、抑揚・音量・pause倍率0.00..2.00、前後無音0.00..1.50秒を0.01刻みで検証する。
- fingerprintには原稿、speaker UUID、style ID、全調声値、ENGINE image digest／version、core version、speaker version、辞書revision、codec設定を含める。
- 人に見せるspeaker labelやprofile labelはfingerprintへ含めない。
- `audio_src`を執筆データの正本にせず、project versionへ結合した生成manifestで管理する。
- 使用したキャラクターの`VOICEVOX:キャラクター名`クレジットとpolicy snapshotを自動生成し、利用者が削除できないようにする。

ローカルpreviewはENGINE buildを`unverified-local`として本番cacheと分離する。本番ContainerはVOICEVOX ENGINE 0.25.1の`linux/amd64` imageをdigest固定する。

### 6. 非同期処理はsegment単位で冪等にする

- Queue messageへ原稿本文を入れず、job ID、segment ID、project version、fingerprintだけを入れる。
- D1のatomic state transitionでat-least-once配送を冪等化する。
- VOICEVOXはsegment単位、画像はupload単位の状態機械を持つ。
- D1とR2の更新失敗は補償deleteとcron cleanupで収束させる。

## 今回採用しないもの

- 画像や音声のbase64をMCP JSONへ直接入れる
- 任意の外部画像URLやhot-link
- 画像原本と多数variantの無期限保存
- private R2 bucketの`r2.dev`公開
- 画像処理へのDurable Object導入
- 即時失効できない自己完結signed Web session
- VOICEVOXの`latest` image
- speaker名だけによる音声参照
- 利用規約確認前のportrait／公式voice sample再配信

## 人間操作が必要だが実装を止めない項目

1. ~~Cloudflare DashboardでR2 subscriptionを有効化~~（2026-07-26完了）
2. ~~private R2 bucket作成とbinding追加~~（`ultimate-freestyle-media`、2026-07-26完了）
3. Images bindingの本番動作確認
4. Queue、DLQ、Containerの作成
5. VOICEVOX image digestの確定

これらが未完了の間はadapter、D1 migration、schema、MCP contract、Web UI、fixture testまで進める。実bindingが必要なrouteは安定した`MEDIA_UNAVAILABLE`または`VOICE_UNAVAILABLE`を返し、既存機能を巻き込んで停止させない。

## 参考資料

- `docs/remote-mcp-plan.html`
- [Cloudflare Images Workers binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [VOICEVOX ENGINE API](https://voicevox.github.io/voicevox_engine/api/)
- [VOICEVOX ENGINE](https://github.com/VOICEVOX/voicevox_engine)
