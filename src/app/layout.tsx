import type { Metadata, Viewport } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./game.css";

const pixel = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

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
