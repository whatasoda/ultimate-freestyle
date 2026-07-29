export type VoicevoxCatalogProfile = {
  id: string;
  label: string;
  speakerUuid: string;
  speakerName: string;
  styleId: number;
  styleName: string;
};

export const VOICEVOX_CATALOG_REVISION = "voicevox-engine-0.25.1" as const;

export const VOICEVOX_CATALOG = [
  {
    "id": "voicevox-style-0",
    "label": "四国めたん・あまあま",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 0,
    "styleName": "あまあま"
  },
  {
    "id": "voicevox-style-1",
    "label": "ずんだもん・あまあま",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 1,
    "styleName": "あまあま"
  },
  {
    "id": "voicevox-style-2",
    "label": "四国めたん・ノーマル",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 2,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-3",
    "label": "ずんだもん・ノーマル",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 3,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-4",
    "label": "四国めたん・セクシー",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 4,
    "styleName": "セクシー"
  },
  {
    "id": "voicevox-style-5",
    "label": "ずんだもん・セクシー",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 5,
    "styleName": "セクシー"
  },
  {
    "id": "voicevox-style-6",
    "label": "四国めたん・ツンツン",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 6,
    "styleName": "ツンツン"
  },
  {
    "id": "voicevox-style-7",
    "label": "ずんだもん・ツンツン",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 7,
    "styleName": "ツンツン"
  },
  {
    "id": "voicevox-style-8",
    "label": "春日部つむぎ・ノーマル",
    "speakerUuid": "35b2c544-660e-401e-b503-0e14c635303a",
    "speakerName": "春日部つむぎ",
    "styleId": 8,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-9",
    "label": "波音リツ・ノーマル",
    "speakerUuid": "b1a81618-b27b-40d2-b0ea-27a9ad408c4b",
    "speakerName": "波音リツ",
    "styleId": 9,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-10",
    "label": "雨晴はう・ノーマル",
    "speakerUuid": "3474ee95-c274-47f9-aa1a-8322163d96f1",
    "speakerName": "雨晴はう",
    "styleId": 10,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-11",
    "label": "玄野武宏・ノーマル",
    "speakerUuid": "c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f",
    "speakerName": "玄野武宏",
    "styleId": 11,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-12",
    "label": "白上虎太郎・ふつう",
    "speakerUuid": "e5020595-5c5d-4e87-b849-270a518d0dcf",
    "speakerName": "白上虎太郎",
    "styleId": 12,
    "styleName": "ふつう"
  },
  {
    "id": "voicevox-style-13",
    "label": "青山龍星・ノーマル",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 13,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-14",
    "label": "冥鳴ひまり・ノーマル",
    "speakerUuid": "8eaad775-3119-417e-8cf4-2a10bfd592c8",
    "speakerName": "冥鳴ひまり",
    "styleId": 14,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-15",
    "label": "九州そら・あまあま",
    "speakerUuid": "481fb609-6446-4870-9f46-90c4dd623403",
    "speakerName": "九州そら",
    "styleId": 15,
    "styleName": "あまあま"
  },
  {
    "id": "voicevox-style-16",
    "label": "九州そら・ノーマル",
    "speakerUuid": "481fb609-6446-4870-9f46-90c4dd623403",
    "speakerName": "九州そら",
    "styleId": 16,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-17",
    "label": "九州そら・セクシー",
    "speakerUuid": "481fb609-6446-4870-9f46-90c4dd623403",
    "speakerName": "九州そら",
    "styleId": 17,
    "styleName": "セクシー"
  },
  {
    "id": "voicevox-style-18",
    "label": "九州そら・ツンツン",
    "speakerUuid": "481fb609-6446-4870-9f46-90c4dd623403",
    "speakerName": "九州そら",
    "styleId": 18,
    "styleName": "ツンツン"
  },
  {
    "id": "voicevox-style-19",
    "label": "九州そら・ささやき",
    "speakerUuid": "481fb609-6446-4870-9f46-90c4dd623403",
    "speakerName": "九州そら",
    "styleId": 19,
    "styleName": "ささやき"
  },
  {
    "id": "voicevox-style-20",
    "label": "もち子さん・ノーマル",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 20,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-21",
    "label": "剣崎雌雄・ノーマル",
    "speakerUuid": "1a17ca16-7ee5-4ea5-b191-2f02ace24d21",
    "speakerName": "剣崎雌雄",
    "styleId": 21,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-22",
    "label": "ずんだもん・ささやき",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 22,
    "styleName": "ささやき"
  },
  {
    "id": "voicevox-style-23",
    "label": "WhiteCUL・ノーマル",
    "speakerUuid": "67d5d8da-acd7-4207-bb10-b5542d3a663b",
    "speakerName": "WhiteCUL",
    "styleId": 23,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-24",
    "label": "WhiteCUL・たのしい",
    "speakerUuid": "67d5d8da-acd7-4207-bb10-b5542d3a663b",
    "speakerName": "WhiteCUL",
    "styleId": 24,
    "styleName": "たのしい"
  },
  {
    "id": "voicevox-style-25",
    "label": "WhiteCUL・かなしい",
    "speakerUuid": "67d5d8da-acd7-4207-bb10-b5542d3a663b",
    "speakerName": "WhiteCUL",
    "styleId": 25,
    "styleName": "かなしい"
  },
  {
    "id": "voicevox-style-26",
    "label": "WhiteCUL・びえーん",
    "speakerUuid": "67d5d8da-acd7-4207-bb10-b5542d3a663b",
    "speakerName": "WhiteCUL",
    "styleId": 26,
    "styleName": "びえーん"
  },
  {
    "id": "voicevox-style-27",
    "label": "後鬼・人間ver.",
    "speakerUuid": "0f56c2f2-644c-49c9-8989-94e11f7129d0",
    "speakerName": "後鬼",
    "styleId": 27,
    "styleName": "人間ver."
  },
  {
    "id": "voicevox-style-28",
    "label": "後鬼・ぬいぐるみver.",
    "speakerUuid": "0f56c2f2-644c-49c9-8989-94e11f7129d0",
    "speakerName": "後鬼",
    "styleId": 28,
    "styleName": "ぬいぐるみver."
  },
  {
    "id": "voicevox-style-29",
    "label": "No.7・ノーマル",
    "speakerUuid": "044830d2-f23b-44d6-ac0d-b5d733caa900",
    "speakerName": "No.7",
    "styleId": 29,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-30",
    "label": "No.7・アナウンス",
    "speakerUuid": "044830d2-f23b-44d6-ac0d-b5d733caa900",
    "speakerName": "No.7",
    "styleId": 30,
    "styleName": "アナウンス"
  },
  {
    "id": "voicevox-style-31",
    "label": "No.7・読み聞かせ",
    "speakerUuid": "044830d2-f23b-44d6-ac0d-b5d733caa900",
    "speakerName": "No.7",
    "styleId": 31,
    "styleName": "読み聞かせ"
  },
  {
    "id": "voicevox-style-32",
    "label": "白上虎太郎・わーい",
    "speakerUuid": "e5020595-5c5d-4e87-b849-270a518d0dcf",
    "speakerName": "白上虎太郎",
    "styleId": 32,
    "styleName": "わーい"
  },
  {
    "id": "voicevox-style-33",
    "label": "白上虎太郎・びくびく",
    "speakerUuid": "e5020595-5c5d-4e87-b849-270a518d0dcf",
    "speakerName": "白上虎太郎",
    "styleId": 33,
    "styleName": "びくびく"
  },
  {
    "id": "voicevox-style-34",
    "label": "白上虎太郎・おこ",
    "speakerUuid": "e5020595-5c5d-4e87-b849-270a518d0dcf",
    "speakerName": "白上虎太郎",
    "styleId": 34,
    "styleName": "おこ"
  },
  {
    "id": "voicevox-style-35",
    "label": "白上虎太郎・びえーん",
    "speakerUuid": "e5020595-5c5d-4e87-b849-270a518d0dcf",
    "speakerName": "白上虎太郎",
    "styleId": 35,
    "styleName": "びえーん"
  },
  {
    "id": "voicevox-style-36",
    "label": "四国めたん・ささやき",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 36,
    "styleName": "ささやき"
  },
  {
    "id": "voicevox-style-37",
    "label": "四国めたん・ヒソヒソ",
    "speakerUuid": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "speakerName": "四国めたん",
    "styleId": 37,
    "styleName": "ヒソヒソ"
  },
  {
    "id": "voicevox-style-38",
    "label": "ずんだもん・ヒソヒソ",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 38,
    "styleName": "ヒソヒソ"
  },
  {
    "id": "voicevox-style-39",
    "label": "玄野武宏・喜び",
    "speakerUuid": "c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f",
    "speakerName": "玄野武宏",
    "styleId": 39,
    "styleName": "喜び"
  },
  {
    "id": "voicevox-style-40",
    "label": "玄野武宏・ツンギレ",
    "speakerUuid": "c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f",
    "speakerName": "玄野武宏",
    "styleId": 40,
    "styleName": "ツンギレ"
  },
  {
    "id": "voicevox-style-41",
    "label": "玄野武宏・悲しみ",
    "speakerUuid": "c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f",
    "speakerName": "玄野武宏",
    "styleId": 41,
    "styleName": "悲しみ"
  },
  {
    "id": "voicevox-style-42",
    "label": "ちび式じい・ノーマル",
    "speakerUuid": "468b8e94-9da4-4f7a-8715-a22a48844f9e",
    "speakerName": "ちび式じい",
    "styleId": 42,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-43",
    "label": "櫻歌ミコ・ノーマル",
    "speakerUuid": "0693554c-338e-4790-8982-b9c6d476dc69",
    "speakerName": "櫻歌ミコ",
    "styleId": 43,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-44",
    "label": "櫻歌ミコ・第二形態",
    "speakerUuid": "0693554c-338e-4790-8982-b9c6d476dc69",
    "speakerName": "櫻歌ミコ",
    "styleId": 44,
    "styleName": "第二形態"
  },
  {
    "id": "voicevox-style-45",
    "label": "櫻歌ミコ・ロリ",
    "speakerUuid": "0693554c-338e-4790-8982-b9c6d476dc69",
    "speakerName": "櫻歌ミコ",
    "styleId": 45,
    "styleName": "ロリ"
  },
  {
    "id": "voicevox-style-46",
    "label": "小夜/SAYO・ノーマル",
    "speakerUuid": "a8cc6d22-aad0-4ab8-bf1e-2f843924164a",
    "speakerName": "小夜/SAYO",
    "styleId": 46,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-47",
    "label": "ナースロボ＿タイプＴ・ノーマル",
    "speakerUuid": "882a636f-3bac-431a-966d-c5e6bba9f949",
    "speakerName": "ナースロボ＿タイプＴ",
    "styleId": 47,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-48",
    "label": "ナースロボ＿タイプＴ・楽々",
    "speakerUuid": "882a636f-3bac-431a-966d-c5e6bba9f949",
    "speakerName": "ナースロボ＿タイプＴ",
    "styleId": 48,
    "styleName": "楽々"
  },
  {
    "id": "voicevox-style-49",
    "label": "ナースロボ＿タイプＴ・恐怖",
    "speakerUuid": "882a636f-3bac-431a-966d-c5e6bba9f949",
    "speakerName": "ナースロボ＿タイプＴ",
    "styleId": 49,
    "styleName": "恐怖"
  },
  {
    "id": "voicevox-style-50",
    "label": "ナースロボ＿タイプＴ・内緒話",
    "speakerUuid": "882a636f-3bac-431a-966d-c5e6bba9f949",
    "speakerName": "ナースロボ＿タイプＴ",
    "styleId": 50,
    "styleName": "内緒話"
  },
  {
    "id": "voicevox-style-51",
    "label": "†聖騎士 紅桜†・ノーマル",
    "speakerUuid": "471e39d2-fb11-4c8c-8d89-4b322d2498e0",
    "speakerName": "†聖騎士 紅桜†",
    "styleId": 51,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-52",
    "label": "雀松朱司・ノーマル",
    "speakerUuid": "0acebdee-a4a5-4e12-a695-e19609728e30",
    "speakerName": "雀松朱司",
    "styleId": 52,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-53",
    "label": "麒ヶ島宗麟・ノーマル",
    "speakerUuid": "7d1e7ba7-f957-40e5-a3fc-da49f769ab65",
    "speakerName": "麒ヶ島宗麟",
    "styleId": 53,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-54",
    "label": "春歌ナナ・ノーマル",
    "speakerUuid": "ba5d2428-f7e0-4c20-ac41-9dd56e9178b4",
    "speakerName": "春歌ナナ",
    "styleId": 54,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-55",
    "label": "猫使アル・ノーマル",
    "speakerUuid": "00a5c10c-d3bd-459f-83fd-43180b521a44",
    "speakerName": "猫使アル",
    "styleId": 55,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-56",
    "label": "猫使アル・おちつき",
    "speakerUuid": "00a5c10c-d3bd-459f-83fd-43180b521a44",
    "speakerName": "猫使アル",
    "styleId": 56,
    "styleName": "おちつき"
  },
  {
    "id": "voicevox-style-57",
    "label": "猫使アル・うきうき",
    "speakerUuid": "00a5c10c-d3bd-459f-83fd-43180b521a44",
    "speakerName": "猫使アル",
    "styleId": 57,
    "styleName": "うきうき"
  },
  {
    "id": "voicevox-style-58",
    "label": "猫使ビィ・ノーマル",
    "speakerUuid": "c20a2254-0349-4470-9fc8-e5c0f8cf3404",
    "speakerName": "猫使ビィ",
    "styleId": 58,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-59",
    "label": "猫使ビィ・おちつき",
    "speakerUuid": "c20a2254-0349-4470-9fc8-e5c0f8cf3404",
    "speakerName": "猫使ビィ",
    "styleId": 59,
    "styleName": "おちつき"
  },
  {
    "id": "voicevox-style-60",
    "label": "猫使ビィ・人見知り",
    "speakerUuid": "c20a2254-0349-4470-9fc8-e5c0f8cf3404",
    "speakerName": "猫使ビィ",
    "styleId": 60,
    "styleName": "人見知り"
  },
  {
    "id": "voicevox-style-61",
    "label": "中国うさぎ・ノーマル",
    "speakerUuid": "1f18ffc3-47ea-4ce0-9829-0576d03a7ec8",
    "speakerName": "中国うさぎ",
    "styleId": 61,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-62",
    "label": "中国うさぎ・おどろき",
    "speakerUuid": "1f18ffc3-47ea-4ce0-9829-0576d03a7ec8",
    "speakerName": "中国うさぎ",
    "styleId": 62,
    "styleName": "おどろき"
  },
  {
    "id": "voicevox-style-63",
    "label": "中国うさぎ・こわがり",
    "speakerUuid": "1f18ffc3-47ea-4ce0-9829-0576d03a7ec8",
    "speakerName": "中国うさぎ",
    "styleId": 63,
    "styleName": "こわがり"
  },
  {
    "id": "voicevox-style-64",
    "label": "中国うさぎ・へろへろ",
    "speakerUuid": "1f18ffc3-47ea-4ce0-9829-0576d03a7ec8",
    "speakerName": "中国うさぎ",
    "styleId": 64,
    "styleName": "へろへろ"
  },
  {
    "id": "voicevox-style-65",
    "label": "波音リツ・クイーン",
    "speakerUuid": "b1a81618-b27b-40d2-b0ea-27a9ad408c4b",
    "speakerName": "波音リツ",
    "styleId": 65,
    "styleName": "クイーン"
  },
  {
    "id": "voicevox-style-66",
    "label": "もち子さん・セクシー／あん子",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 66,
    "styleName": "セクシー／あん子"
  },
  {
    "id": "voicevox-style-67",
    "label": "栗田まろん・ノーマル",
    "speakerUuid": "04dbd989-32d0-40b4-9e71-17c920f2a8a9",
    "speakerName": "栗田まろん",
    "styleId": 67,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-68",
    "label": "あいえるたん・ノーマル",
    "speakerUuid": "dda44ade-5f9c-4a3a-9d2c-2a976c7476d9",
    "speakerName": "あいえるたん",
    "styleId": 68,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-69",
    "label": "満別花丸・ノーマル",
    "speakerUuid": "287aa49f-e56b-4530-a469-855776c84a8d",
    "speakerName": "満別花丸",
    "styleId": 69,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-70",
    "label": "満別花丸・元気",
    "speakerUuid": "287aa49f-e56b-4530-a469-855776c84a8d",
    "speakerName": "満別花丸",
    "styleId": 70,
    "styleName": "元気"
  },
  {
    "id": "voicevox-style-71",
    "label": "満別花丸・ささやき",
    "speakerUuid": "287aa49f-e56b-4530-a469-855776c84a8d",
    "speakerName": "満別花丸",
    "styleId": 71,
    "styleName": "ささやき"
  },
  {
    "id": "voicevox-style-72",
    "label": "満別花丸・ぶりっ子",
    "speakerUuid": "287aa49f-e56b-4530-a469-855776c84a8d",
    "speakerName": "満別花丸",
    "styleId": 72,
    "styleName": "ぶりっ子"
  },
  {
    "id": "voicevox-style-73",
    "label": "満別花丸・ボーイ",
    "speakerUuid": "287aa49f-e56b-4530-a469-855776c84a8d",
    "speakerName": "満別花丸",
    "styleId": 73,
    "styleName": "ボーイ"
  },
  {
    "id": "voicevox-style-74",
    "label": "琴詠ニア・ノーマル",
    "speakerUuid": "97a4af4b-086e-4efd-b125-7ae2da85e697",
    "speakerName": "琴詠ニア",
    "styleId": 74,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-75",
    "label": "ずんだもん・ヘロヘロ",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 75,
    "styleName": "ヘロヘロ"
  },
  {
    "id": "voicevox-style-76",
    "label": "ずんだもん・なみだめ",
    "speakerUuid": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
    "speakerName": "ずんだもん",
    "styleId": 76,
    "styleName": "なみだめ"
  },
  {
    "id": "voicevox-style-77",
    "label": "もち子さん・泣き",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 77,
    "styleName": "泣き"
  },
  {
    "id": "voicevox-style-78",
    "label": "もち子さん・怒り",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 78,
    "styleName": "怒り"
  },
  {
    "id": "voicevox-style-79",
    "label": "もち子さん・喜び",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 79,
    "styleName": "喜び"
  },
  {
    "id": "voicevox-style-80",
    "label": "もち子さん・のんびり",
    "speakerUuid": "9f3ee141-26ad-437e-97bd-d22298d02ad2",
    "speakerName": "もち子さん",
    "styleId": 80,
    "styleName": "のんびり"
  },
  {
    "id": "voicevox-style-81",
    "label": "青山龍星・熱血",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 81,
    "styleName": "熱血"
  },
  {
    "id": "voicevox-style-82",
    "label": "青山龍星・不機嫌",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 82,
    "styleName": "不機嫌"
  },
  {
    "id": "voicevox-style-83",
    "label": "青山龍星・喜び",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 83,
    "styleName": "喜び"
  },
  {
    "id": "voicevox-style-84",
    "label": "青山龍星・しっとり",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 84,
    "styleName": "しっとり"
  },
  {
    "id": "voicevox-style-85",
    "label": "青山龍星・かなしみ",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 85,
    "styleName": "かなしみ"
  },
  {
    "id": "voicevox-style-86",
    "label": "青山龍星・囁き",
    "speakerUuid": "4f51116a-d9ee-4516-925d-21f183e2afad",
    "speakerName": "青山龍星",
    "styleId": 86,
    "styleName": "囁き"
  },
  {
    "id": "voicevox-style-87",
    "label": "後鬼・人間（怒り）ver.",
    "speakerUuid": "0f56c2f2-644c-49c9-8989-94e11f7129d0",
    "speakerName": "後鬼",
    "styleId": 87,
    "styleName": "人間（怒り）ver."
  },
  {
    "id": "voicevox-style-88",
    "label": "後鬼・鬼ver.",
    "speakerUuid": "0f56c2f2-644c-49c9-8989-94e11f7129d0",
    "speakerName": "後鬼",
    "styleId": 88,
    "styleName": "鬼ver."
  },
  {
    "id": "voicevox-style-89",
    "label": "Voidoll・ノーマル",
    "speakerUuid": "0ebe2c7d-96f3-4f0e-a2e3-ae13fe27c403",
    "speakerName": "Voidoll",
    "styleId": 89,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-90",
    "label": "ぞん子・ノーマル",
    "speakerUuid": "0156da66-4300-474a-a398-49eb2e8dd853",
    "speakerName": "ぞん子",
    "styleId": 90,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-91",
    "label": "ぞん子・低血圧",
    "speakerUuid": "0156da66-4300-474a-a398-49eb2e8dd853",
    "speakerName": "ぞん子",
    "styleId": 91,
    "styleName": "低血圧"
  },
  {
    "id": "voicevox-style-92",
    "label": "ぞん子・覚醒",
    "speakerUuid": "0156da66-4300-474a-a398-49eb2e8dd853",
    "speakerName": "ぞん子",
    "styleId": 92,
    "styleName": "覚醒"
  },
  {
    "id": "voicevox-style-93",
    "label": "ぞん子・実況風",
    "speakerUuid": "0156da66-4300-474a-a398-49eb2e8dd853",
    "speakerName": "ぞん子",
    "styleId": 93,
    "styleName": "実況風"
  },
  {
    "id": "voicevox-style-94",
    "label": "中部つるぎ・ノーマル",
    "speakerUuid": "4614a7de-9829-465d-9791-97eb8a5f9b86",
    "speakerName": "中部つるぎ",
    "styleId": 94,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-95",
    "label": "中部つるぎ・怒り",
    "speakerUuid": "4614a7de-9829-465d-9791-97eb8a5f9b86",
    "speakerName": "中部つるぎ",
    "styleId": 95,
    "styleName": "怒り"
  },
  {
    "id": "voicevox-style-96",
    "label": "中部つるぎ・ヒソヒソ",
    "speakerUuid": "4614a7de-9829-465d-9791-97eb8a5f9b86",
    "speakerName": "中部つるぎ",
    "styleId": 96,
    "styleName": "ヒソヒソ"
  },
  {
    "id": "voicevox-style-97",
    "label": "中部つるぎ・おどおど",
    "speakerUuid": "4614a7de-9829-465d-9791-97eb8a5f9b86",
    "speakerName": "中部つるぎ",
    "styleId": 97,
    "styleName": "おどおど"
  },
  {
    "id": "voicevox-style-98",
    "label": "中部つるぎ・絶望と敗北",
    "speakerUuid": "4614a7de-9829-465d-9791-97eb8a5f9b86",
    "speakerName": "中部つるぎ",
    "styleId": 98,
    "styleName": "絶望と敗北"
  },
  {
    "id": "voicevox-style-99",
    "label": "離途・ノーマル",
    "speakerUuid": "3b91e034-e028-4acb-a08d-fbdcd207ea63",
    "speakerName": "離途",
    "styleId": 99,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-100",
    "label": "黒沢冴白・ノーマル",
    "speakerUuid": "0b466290-f9b6-4718-8d37-6c0c81e824ac",
    "speakerName": "黒沢冴白",
    "styleId": 100,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-101",
    "label": "離途・シリアス",
    "speakerUuid": "3b91e034-e028-4acb-a08d-fbdcd207ea63",
    "speakerName": "離途",
    "styleId": 101,
    "styleName": "シリアス"
  },
  {
    "id": "voicevox-style-102",
    "label": "ユーレイちゃん・ノーマル",
    "speakerUuid": "462cd6b4-c088-42b0-b357-3816e24f112e",
    "speakerName": "ユーレイちゃん",
    "styleId": 102,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-103",
    "label": "ユーレイちゃん・甘々",
    "speakerUuid": "462cd6b4-c088-42b0-b357-3816e24f112e",
    "speakerName": "ユーレイちゃん",
    "styleId": 103,
    "styleName": "甘々"
  },
  {
    "id": "voicevox-style-104",
    "label": "ユーレイちゃん・哀しみ",
    "speakerUuid": "462cd6b4-c088-42b0-b357-3816e24f112e",
    "speakerName": "ユーレイちゃん",
    "styleId": 104,
    "styleName": "哀しみ"
  },
  {
    "id": "voicevox-style-105",
    "label": "ユーレイちゃん・ささやき",
    "speakerUuid": "462cd6b4-c088-42b0-b357-3816e24f112e",
    "speakerName": "ユーレイちゃん",
    "styleId": 105,
    "styleName": "ささやき"
  },
  {
    "id": "voicevox-style-106",
    "label": "ユーレイちゃん・ツクモちゃん",
    "speakerUuid": "462cd6b4-c088-42b0-b357-3816e24f112e",
    "speakerName": "ユーレイちゃん",
    "styleId": 106,
    "styleName": "ツクモちゃん"
  },
  {
    "id": "voicevox-style-107",
    "label": "東北ずん子・ノーマル",
    "speakerUuid": "80802b2d-8c75-4429-978b-515105017010",
    "speakerName": "東北ずん子",
    "styleId": 107,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-108",
    "label": "東北きりたん・ノーマル",
    "speakerUuid": "1bd6b32b-d650-4072-bbe5-1d0ef4aaa28b",
    "speakerName": "東北きりたん",
    "styleId": 108,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-109",
    "label": "東北イタコ・ノーマル",
    "speakerUuid": "ab4c31a3-8769-422a-b412-708f5ae637e8",
    "speakerName": "東北イタコ",
    "styleId": 109,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-110",
    "label": "猫使アル・つよつよ",
    "speakerUuid": "00a5c10c-d3bd-459f-83fd-43180b521a44",
    "speakerName": "猫使アル",
    "styleId": 110,
    "styleName": "つよつよ"
  },
  {
    "id": "voicevox-style-111",
    "label": "猫使アル・へろへろ",
    "speakerUuid": "00a5c10c-d3bd-459f-83fd-43180b521a44",
    "speakerName": "猫使アル",
    "styleId": 111,
    "styleName": "へろへろ"
  },
  {
    "id": "voicevox-style-112",
    "label": "猫使ビィ・つよつよ",
    "speakerUuid": "c20a2254-0349-4470-9fc8-e5c0f8cf3404",
    "speakerName": "猫使ビィ",
    "styleId": 112,
    "styleName": "つよつよ"
  },
  {
    "id": "voicevox-style-113",
    "label": "あんこもん・ノーマル",
    "speakerUuid": "3be49e15-34bb-48a0-9e2f-9b80c96e9905",
    "speakerName": "あんこもん",
    "styleId": 113,
    "styleName": "ノーマル"
  },
  {
    "id": "voicevox-style-114",
    "label": "あんこもん・つよつよ",
    "speakerUuid": "3be49e15-34bb-48a0-9e2f-9b80c96e9905",
    "speakerName": "あんこもん",
    "styleId": 114,
    "styleName": "つよつよ"
  },
  {
    "id": "voicevox-style-115",
    "label": "あんこもん・よわよわ",
    "speakerUuid": "3be49e15-34bb-48a0-9e2f-9b80c96e9905",
    "speakerName": "あんこもん",
    "styleId": 115,
    "styleName": "よわよわ"
  },
  {
    "id": "voicevox-style-116",
    "label": "あんこもん・けだるげ",
    "speakerUuid": "3be49e15-34bb-48a0-9e2f-9b80c96e9905",
    "speakerName": "あんこもん",
    "styleId": 116,
    "styleName": "けだるげ"
  },
  {
    "id": "voicevox-style-117",
    "label": "あんこもん・ささやき",
    "speakerUuid": "3be49e15-34bb-48a0-9e2f-9b80c96e9905",
    "speakerName": "あんこもん",
    "styleId": 117,
    "styleName": "ささやき"
  }
] as const satisfies readonly VoicevoxCatalogProfile[];

export function findVoicevoxCatalogProfile(
  profileId: string
): VoicevoxCatalogProfile | undefined {
  return VOICEVOX_CATALOG.find((profile) => profile.id === profileId);
}

