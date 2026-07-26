import type { ReactNode } from "react";

export type SlideTone = "dark" | "light" | "signal" | "quiet";

export type NarrationDisplay = "dialogue" | "commentary" | "inline";

export type PresentationLayout =
  | "cinematic"
  | "biim"
  | "minimal";

export type NarrationSegment = {
  /** この段階表示になった時に有効になる。最初の文は0。 */
  at: number;
  text: string;
  /**
   * public/ からの任意の固定音声パス。配信先のbase pathは自動付与される。
   * 通常のVOICEVOX生成音声は命名規則から解決するため指定不要。
   */
  audioSrc?: string;
};

export type Narration = {
  /** ADV風、実況字幕風、スライド本文型から選ぶ。 */
  display?: NarrationDisplay;
  speaker?: string;
  segments: NarrationSegment[];
};

export type ResearchSlide = {
  id: string;
  title: string;
  /** このスライドに割り当てる想定秒数。 */
  durationSeconds: number;
  /** クリックで順番に出す Reveal の最大 at 値。 */
  revealSteps?: number;
  tone?: SlideTone;
  narration?: Narration;
  /** BIIMレイアウトの右欄。読み上げ対象には含まれない任意の補足表示。 */
  sidebar?: ReactNode;
  content: ReactNode;
};

export type ResearchDeck = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  author: string;
  year: number;
  accent: string;
  /** 発表全体の既定レイアウト。画面上からも一時的に切り替えられる。 */
  layout?: PresentationLayout;
  narrationDefaults?: {
    display: NarrationDisplay;
    speaker?: string;
    /** 最終スライド等に表示するクレジット。 */
    credit?: string;
  };
  slides: ResearchSlide[];
};
