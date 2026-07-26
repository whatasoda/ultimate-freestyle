import type { ReactNode } from "react";

export type SlideTone = "dark" | "light" | "signal" | "quiet";

export type NarrationDisplay = "dialogue" | "commentary" | "inline";

export type PresentationLayout =
  | "cinematic"
  | "biim"
  | "broadcast"
  | "minimal";

export type NarrationSegment = {
  /** この段階表示になった時に有効になる。最初の文は0。 */
  at: number;
  text: string;
  /** public/ からの絶対パス。未指定ならブラウザ標準読み上げを使う。 */
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
