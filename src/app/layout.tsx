import type { Metadata, Viewport } from "next";
import { Tiny5 } from "next/font/google";
import "./globals.css";
import "./game.css";

// Tiny5 keeps C, 5 and S apart at small sizes, which matters in a game made of numbers
const pixel = Tiny5({ subsets: ["latin"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "Timber Tycoon",
  description: "Chop wood between prompts. A Hack Canada minigame.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b2414",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={pixel.className}>{children}</body>
    </html>
  );
}
