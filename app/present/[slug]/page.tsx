import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Presentation } from "@/components/presentation/Presentation";
import { getDeck, researchDecks } from "@/researches/registry";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return researchDecks.map((deck) => ({ slug: deck.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const deck = getDeck((await params).slug);
  return deck ? { title: deck.title, description: deck.description } : {};
}

export default async function ResearchPage({ params }: Props) {
  const deck = getDeck((await params).slug);
  if (!deck) notFound();
  return <Presentation deck={deck} />;
}
