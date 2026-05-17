import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Barlow,
  Barlow_Condensed,
  Oswald,
  JetBrains_Mono,
  DM_Serif_Display,
  Space_Grotesk,
  Fraunces,
} from "next/font/google";
import "./globals.css";
import ActiveGameWidget from "./components/ui/ActiveGameWidget";
import AppHeader from "./components/layout/AppHeader";

// Geist stays as the project-wide default; the rest are exposed via CSS
// variables and used through the .font-* utility classes defined in
// globals.css. Loaded swap-display so initial paint never blocks.
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// FACEIT-style screens (Dashboard, Lobby, Profile, Leaderboard).
// Barlow Condensed in heavy weights, uppercase, slightly wide tracking.
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-head",
});

// Body / captions on the same screens.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

// Fallback for head if Barlow Condensed fails to load.
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-oswald",
});

// Numbers — ELO, match IDs, timers, mini-stats.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-num",
});

// Match-screen themes: each visual mood uses its own font family. The
// theme is set per-match later via a wrapper class — for now the
// variables are just available globally.
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-meadow",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-midnight",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-atlas",
});

export const metadata: Metadata = {
  title: "EuropeQuiz",
  description:
    "A Risk-style multiplayer quiz game on the map of Europe.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} ${barlow.variable} ${oswald.variable} ${jetbrainsMono.variable} ${dmSerif.variable} ${spaceGrotesk.variable} ${fraunces.variable} antialiased`}
      >
        <AppHeader />
        {children}
        <ActiveGameWidget />
      </body>
    </html>
  );
}
