import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "最自由研究 Web Presentation",
    template: "%s | 最自由研究"
  },
  description:
    "最自由研究の制作、記録、発表に使うクリック進行型Webスライド。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
