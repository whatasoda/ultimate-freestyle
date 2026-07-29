# VOICEVOX Container wrapper

Cloudflare Containersから内部利用するVOICEVOX ENGINE 0.25.1用のHTTP wrapperです。外部公開を前提としません。

## Endpoint

- `GET /health`: ENGINEのversion取得まで成功した場合だけ`200`。
- `GET /speakers`: ENGINEの話者catalogを返す。
- `POST /synthesize`: 500文字以内の原稿と解決済みtalk style・全調声値を受け取り、MP3 mono 24kHz 64kbpsを返す。

`POST /synthesize`の入力例です。

```json
{
  "text": "最自由研究です。",
  "style_id": 3,
  "tuning": {
    "speedScale": 1.05,
    "pitchScale": 0,
    "intonationScale": 1.1,
    "volumeScale": 1,
    "pauseLengthScale": 1,
    "prePhonemeLength": 0.1,
    "postPhonemeLength": 0.1
  }
}
```

ENGINEの標準出力と標準エラーは、`audio_query`のURLに含まれる原稿をCloudflare Logsへ流さないため破棄します。wrapperのerror responseとlogにも原稿は含めません。

## 検証

```sh
cd apps/mcp-server/voicevox
go test ./...
docker build --platform linux/amd64 -t ultimate-freestyle-voicevox .
```
