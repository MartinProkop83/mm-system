import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700", "800", "900"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MM System | Macháč Motors",
  description: "Provozní systém pro správu závodů, motorů a servisu Macháč Motors.",
  icons: {
    icon: "/machac-motors-symbol.jpg",
    apple: "/machac-motors-symbol.jpg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
