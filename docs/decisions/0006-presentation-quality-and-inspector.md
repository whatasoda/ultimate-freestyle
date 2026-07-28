# ADR 0006: スライド枠基準の表示品質と実効設定インスペクター

- 状態: 採用
- 日付: 2026-07-28
- 対象: project schema、発表renderer、MCP、Web UI

## 解決する問題

発表枠は16:9で高さにも制約される一方、flow、canvas、読み上げ欄の文字サイズはbrowser viewportの幅を基準にしていた。横長画面やWeb UI内のiframeでは、発表枠だけが縮み文字が過大になり、`overflow: hidden`によって見切れが発見できなかった。

また、template、VOICEVOX profile、segment別調声値は保存できるが、Web UIでは実効値の大部分を確認・編集できない。読み上げ欄も話者名を描画せず、VOICEVOX音声が存在してもbrowser読み上げだけを使っていた。

## 決定

### 1. 発表枠を寸法の正本にする

`.stage`をsize containerとし、flow、canvas、scene、読み上げ欄の文字、余白、gapを発表枠基準へ統一する。template倍率とcomponent倍率はleaf要素で一度だけ適用し、入れ子による倍率の累積を避ける。

rendererは表示中の本文、補足、読み上げ欄、leaf componentについて、font読込後とresize後にoverflowを測定する。収まらない場合は安全な下限まで文字を縮小し、それでも収まらない箇所を`data-overflow`で示す。編集用frameだけが診断結果を親Web UIへ`postMessage`し、公開画面へ編集警告を表示しない。

### 2. 見た目とfontは安全なpresetで増やす

templateへvisual、本文font、見出しfont、density、文字weight、行間、字間、motionの任意tokenを追加する。既存templateはrenderer既定値で同じschema versionのまま読み取る。

任意のfont名、font URL、CSS、HTML、JavaScriptは保存しない。font presetはrendererが管理する日本語向けfont stackへ解決する。初期実装はsystem fontで成立させ、将来自身で配信するWOFF2へ実装を差し替えても保存schemaを変えない。

visual presetは色の自由指定と共存し、背景装飾、surface、境界、影、角、見出し表現を一貫した組としてflow、canvas、sceneへ適用する。

### 3. 読み上げ表示と音声設定を分離する

読み上げ本文、表示方式、枠の外観、話者、VOICEVOX profile、segment別調声値を別々に更新できるようにする。表示方式はADV会話枠、実況字幕、映像字幕、全文追従、最小表示を扱う。枠には配置、寸法、文字揃え、話者表示、進捗表示、文字倍率、最大行数の検証済みtokenを持たせる。

実効値は「renderer既定 → deck既定 → slide設定」と「VOICEVOX標準値 → profile基準値 → segment上書き値」の順で解決する。Web UIは値だけでなく継承元も示す。

音声再生は管理済み`audio_src`があれば音声fileを優先し、なければWeb Speech APIへfallbackする。Web Speechでは話速と音高を安全な範囲で近似し、実音声ではdurationとtimeupdateから進捗を表示する。本文、profile、調声値が変わったsegmentの既存音声参照は無効化する。

### 4. Web UIを確認可能な制作画面にする

一枚編集画面は現在のfilmstrip、16:9 preview、inspectorを維持し、inspectorを内容、デザイン、読み上げ、構造、品質確認へ整理する。

- 現在有効なlayout、template、font、tone、animation、読み上げ方式、音声profileを要約する。
- template、slide外観、読み上げ枠、segment音声を小粒度のPATCHで保存する。
- componentの全設定を少なくとも読み取り可能にする。
- STEP切替はiframeを再読込せず、固定message schemaでrendererへ通知する。
- overflow診断、未生成音声、代替テキスト不足等を品質確認欄へ表示する。
- 保存中、成功、競合、未保存、frame更新をその場で通知する。

### 5. MCPも小粒度編集を維持する

既存の全量upsertは互換用に残し、template項目、読み上げ枠、segment音声、VOICEVOX profile調声値を個別に更新するtoolを追加する。各toolは`expected_version`を必須とし、成功時は変更後versionを返す。

保存schema上の`audio_src`は既存データの読み取り用に残すが、一般のMCP入力から任意URLを設定させない。音声生成経路だけが同一host内の管理済み参照を設定する。

## 品質条件

- 代表的な16:9枠とWeb UI内iframeで、各visual/font/narration presetを実寸確認する。
- 日本語長文、改行不能な英数字、BIIM補足、長い話者名、複数segmentを含むfixtureを使う。
- 自動fit後に残るoverflowは編集画面へ対象付きで通知する。
- 既存projectは追加fieldなしでparse・renderできる。
- Web更新はCSRF、入力上限、schema検証、version競合防止を維持する。
- reduced motionでは読み上げを含む全animationとtransitionを止める。
- 任意CSS、任意font URL、任意script、外部音声URLを受け付けない。

## 後続

system font presetの実機差を測定した後、必要な日本語fontのweightとsubsetだけをself-hostする。公開履歴、component property editor、音声生成Containerは別の段階として接続する。
