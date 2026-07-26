import { Presentation } from "@/components/presentation/Presentation";
import { defaultDeck } from "@/researches/registry";

export default function Home() {
  return <Presentation deck={defaultDeck} />;
}
