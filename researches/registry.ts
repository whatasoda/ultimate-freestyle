import type { ResearchDeck } from "@/components/presentation/types";
import { starterDeck } from "./starter/deck";

/**
 * 新しい研究を追加したら、この配列へ登録する。
 * 発表URLは /present/<slug>。発表物間のナビゲーションは意図的に持たない。
 */
export const researchDecks: ResearchDeck[] = [starterDeck];

export const defaultDeck = starterDeck;

export function getDeck(slug: string) {
  return researchDecks.find((deck) => deck.slug === slug);
}
