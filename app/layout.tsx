import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Neue Montreal is a licensed face; Manrope is the closest free
// geometric grotesque and carries the same regular/medium pairing.
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const display = Manrope({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "SAKSHA",
  description: "Less chasing. More filing. Practice management for CA firms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
