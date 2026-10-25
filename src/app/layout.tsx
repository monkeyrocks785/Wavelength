import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "Wavelength — One screen. Every earbud.",
  description:
    "Group sound sessions for movie night. One laptop relays studio-grade audio to every phone in the room, phase-locked in real time — no Bluetooth limits, no lag, no apps.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${space.variable} ${plex.variable}`}>
      <body className="noise bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
