# ADR 0009: VOICEVOX音声をQueueとCloudflare Containersで生成する

## 状態

採用（2026-07-29）

## 決定

- Web UIまたは標準MCPの小粒度toolからVOICEVOXの既定profileを設定し、差分生成jobを登録する。
- jobはD1へ先に永続化し、Cloudflare Queueへ区間単位で送る。送信失敗はoutboxを2分ごとに再送する。
- Queue consumerがVOICEVOX ENGINE 0.25.1のCPU imageをCloudflare Containerで起動し、MP3 mono・24 kHz・64 kbpsへ変換する。
- 生成入力は原稿、speaker UUID、style ID、7種の調声値、ENGINE image、辞書、codecを含むfingerprintで識別する。
- 編集中の生成音声はprivate R2 cacheとD1 metadataを正本にし、研究JSONの`audio_src`へ永続化しない。
- 固定プレビュー作成時に使用中の音声をrevision専用R2 keyへ複製し、画像と同様に公開後も不変とする。
- VOICEVOXを設定した発表は全読み上げ区間の生成が完了するまで固定プレビューを作成できない。
- 公開rendererは使用話者を`VOICEVOX:話者名`として表示し、生成済みMP3へブラウザ側の調声音量を重ねて適用しない。

## 初期制限

- 1区間500文字、1job 100区間・30,000文字
- 1利用者あたり月20job・200,000文字
- 生成cacheは1利用者100 MiB
- Containerは`standard-2`、最大1 instance、合成は1並列、5分でsleep
- Queueは1件ずつ処理し、60秒間隔で最大3回試行する

## 理由

MCPやWeb requestの応答時間から音声生成を分離でき、Containerのcold startや一時障害を再試行で吸収できる。fingerprint cacheにより変更のない区間を再生成せず、immutable revisionへの複製により編集cacheの削除や原稿変更が公開済み発表へ影響しない。

## 見送った案

- WorkerからContainerを同期呼び出しして全区間を生成する案は、長時間request、部分失敗、再試行の扱いが不安定になるため採用しない。
- 生成URLを研究JSONへ保存する案は、原稿や調声値変更との整合性を二重管理することになるため採用しない。
- 公開HTMLから編集cacheを直接参照する案は、cache整理によって公開版が壊れるため採用しない。
- 音声未生成時に公開版だけWeb Speechへ黙って切り替える案は、確認した声と公開結果が異なるため採用しない。

## 検証

- Go wrapperのunit test、vet、amd64 image build、実ENGINE合成、ffprobeによるcodec確認を行う。
- Worker側はjob登録、Queue message、Container response、R2保存、D1反映、編集rendererへのhydrateをcontract testで再現する。
- 公開テストでは未生成時の拒否、音声snapshot、private preview、公開後の匿名配信、元cache削除後の再生を確認する。
