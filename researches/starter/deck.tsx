import { Reveal } from "@/components/presentation/Reveal";
import {
  Accent,
  BigNumber,
  Card,
  Columns,
  Eyebrow,
  Lead
} from "@/components/presentation/SlidePrimitives";
import type { ResearchDeck } from "@/components/presentation/types";

const spoken = (_slideId: string, at: number, text: string) => ({
  at,
  text
});

export const starterDeck: ResearchDeck = {
  slug: "starter",
  title: "研究タイトルをここに",
  shortTitle: "研究タイトル",
  description: "新しい最自由研究を始めるための発表テンプレート。",
  author: "あなたの名前",
  year: 2026,
  accent: "#ffcf32",
  layout: "cinematic",
  narrationDefaults: {
    display: "dialogue",
    credit: "VOICEVOX:ずんだもん"
  },
  voicevox: {
    catalogRevision: "voicevox-engine-0.25.1",
    defaultProfileId: "zundamon-normal",
    profiles: [
      {
        id: "zundamon-normal",
        label: "ずんだもん（ノーマル）",
        speakerUuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
        speakerName: "ずんだもん",
        styleId: 3,
        styleName: "ノーマル",
        tuning: { speedScale: 1.05 }
      },
      {
        id: "metan-normal",
        label: "四国めたん（ノーマル）",
        speakerUuid: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        speakerName: "四国めたん",
        styleId: 2,
        styleName: "ノーマル"
      }
    ]
  },
  slides: [
    {
      id: "title",
      title: "タイトル",
      durationSeconds: 40,
      tone: "dark",
      narration: {
        display: "commentary",
        segments: [
          spoken("title", 0, "研究タイトルをここに。発表者は、あなたの名前です。")
        ]
      },
      content: (
        <div className="title-layout">
          <Eyebrow>最自由研究 2026</Eyebrow>
          <h1>
            研究タイトルを
            <br />
            <Accent>ここに。</Accent>
          </h1>
          <div className="title-meta">
            <span>あなたの名前</span>
            <span>発表予定 08:10</span>
          </div>
        </div>
      )
    },
    {
      id: "question",
      title: "きっかけと問い",
      durationSeconds: 80,
      revealSteps: 3,
      tone: "light",
      narration: {
        display: "dialogue",
        speaker: "研究者",
        segments: [
          {
            ...spoken("question", 0, "まず、なぜこの研究を始めたのかを説明します。"),
            voiceProfileId: "metan-normal",
            voiceTuning: { intonationScale: 1.1 }
          },
          spoken("question", 1, "日常で見つけた小さな違和感。なぜ、こうなる？"),
          spoken("question", 2, "条件を変えたら、結果も変わるだろうか？"),
          spoken("question", 3, "そして、どこまで行けるのか。三つの問いを立てました。")
        ]
      },
      sidebar: (
        <div className="biim-custom-content">
          <p>AUTHOR&apos;S NOTE</p>
          <strong>「当たり前」を一度疑うところから始めました。</strong>
          <ul>
            <li>ここは読み上げない補足欄</li>
            <li>作者コメントや注意点を置ける</li>
            <li>画像などのReact要素も使用可能</li>
          </ul>
          <small>発表中に目で読んでもらう情報</small>
        </div>
      ),
      content: (
        <div className="content-layout">
          <Eyebrow>01 · QUESTION</Eyebrow>
          <h2>すべては、ひとつの<br /><Accent>小さな違和感</Accent>から。</h2>
          <div className="question-grid">
            <Reveal at={1}><Card label="WHY">なぜ、こうなる？</Card></Reveal>
            <Reveal at={2}><Card label="WHAT IF">条件を変えたら？</Card></Reveal>
            <Reveal at={3}><Card label="HOW FAR">どこまで行ける？</Card></Reveal>
          </div>
        </div>
      )
    },
    {
      id: "method",
      title: "研究方法",
      durationSeconds: 90,
      revealSteps: 3,
      tone: "quiet",
      narration: {
        display: "inline",
        segments: [
          spoken("method", 0, "研究は、観察・実行・記録の三段階で進めました。"),
          spoken("method", 1, "最初に対象と条件を決めて観察します。"),
          spoken("method", 2, "次に条件をひとつずつ変えて試します。"),
          spoken("method", 3, "最後に、成功だけでなく失敗も記録します。")
        ]
      },
      content: (
        <div className="content-layout">
          <Eyebrow>02 · METHOD</Eyebrow>
          <h2>やったことは、<Accent>3つ。</Accent></h2>
          <ol className="method-list">
            <Reveal at={1}><li><b>01</b><span><strong>観察する</strong><small>対象と条件を決める</small></span></li></Reveal>
            <Reveal at={2}><li><b>02</b><span><strong>試してみる</strong><small>変化をひとつずつ加える</small></span></li></Reveal>
            <Reveal at={3}><li><b>03</b><span><strong>記録する</strong><small>成功も失敗も残す</small></span></li></Reveal>
          </ol>
        </div>
      )
    },
    {
      id: "result",
      title: "結果",
      durationSeconds: 90,
      revealSteps: 2,
      tone: "signal",
      narration: {
        display: "commentary",
        segments: [
          spoken("result", 0, "結果です。数字で見ていきます。"),
          spoken("result", 1, "試行回数は十二回。記録した時間は四百八十分でした。"),
          spoken("result", 2, "そして、予想外の結果が一つありました。")
        ]
      },
      content: (
        <div className="content-layout result-layout">
          <Eyebrow>03 · RESULT</Eyebrow>
          <h2>結果は、<Accent>予想外。</Accent></h2>
          <Columns>
            <Reveal at={1}>
              <BigNumber value="12" unit="回">試した回数</BigNumber>
            </Reveal>
            <Reveal at={1}>
              <BigNumber value="480" unit="分">記録した時間</BigNumber>
            </Reveal>
            <Reveal at={2}>
              <BigNumber value="1" unit="つ">見つけた発見</BigNumber>
            </Reveal>
          </Columns>
        </div>
      )
    },
    {
      id: "evidence",
      title: "記録と比較",
      durationSeconds: 90,
      revealSteps: 3,
      tone: "dark",
      narration: {
        display: "dialogue",
        segments: [
          spoken("evidence", 0, "三つの条件を順番に比較します。"),
          spoken("evidence", 1, "条件Aは、基準となる四十二でした。"),
          spoken("evidence", 2, "条件Bでは六十八まで伸びました。"),
          spoken("evidence", 3, "条件Cは九十一。ここに最も大きな差が現れました。")
        ]
      },
      content: (
        <div className="content-layout chart-layout">
          <Eyebrow>04 · EVIDENCE</Eyebrow>
          <h2>比べると、<Accent>差が見える。</Accent></h2>
          <div className="bar-chart" aria-label="三条件の比較例">
            <Reveal at={1}><div><span>条件 A</span><i style={{ "--value": "42%" } as React.CSSProperties} /><b>42</b></div></Reveal>
            <Reveal at={2}><div><span>条件 B</span><i style={{ "--value": "68%" } as React.CSSProperties} /><b>68</b></div></Reveal>
            <Reveal at={3}><div><span>条件 C</span><i style={{ "--value": "91%" } as React.CSSProperties} /><b>91</b></div></Reveal>
          </div>
          <p className="annotation">写真・動画・実測値に置き換える</p>
        </div>
      )
    },
    {
      id: "conclusion",
      title: "考察と結論",
      durationSeconds: 70,
      revealSteps: 2,
      tone: "light",
      narration: {
        display: "inline",
        segments: [
          spoken("conclusion", 0, "以上から、最初の予想とは違う結論になりました。"),
          spoken("conclusion", 1, "予想と違った理由を、記録から考察します。"),
          spoken("conclusion", 2, "失敗した条件にも、次の研究につながる発見がありました。")
        ]
      },
      content: (
        <div className="content-layout conclusion-layout">
          <Eyebrow>05 · CONCLUSION</Eyebrow>
          <h2>わかったこと。</h2>
          <Lead>結論を、ひとことで強く書く。</Lead>
          <div className="conclusion-notes">
            <Reveal at={1}><p><span>01</span>予想と違った点、その理由</p></Reveal>
            <Reveal at={2}><p><span>02</span>次に試してみたいこと</p></Reveal>
          </div>
        </div>
      )
    },
    {
      id: "end",
      title: "おわり",
      durationSeconds: 30,
      tone: "dark",
      narration: {
        display: "commentary",
        segments: [spoken("end", 0, "ご覧いただき、ありがとうございました。")]
      },
      content: (
        <div className="end-layout">
          <p>END OF RESEARCH</p>
          <h2>ありがとうございました。</h2>
          <small>資料・引用元・制作記録へのURL</small>
        </div>
      )
    }
  ]
};
