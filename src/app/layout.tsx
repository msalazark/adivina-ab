import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";
import NavLinks from "@/components/NavLinks";
import { getScore, isAdmin } from "@/lib/data";
import { SITE_URL } from "@/lib/env";

// Fuentes autoalojadas (paquetes @fontsource): el build no depende de Google Fonts.
const display = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2",
  variable: "--font-display",
  weight: "100 900",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  display: "swap",
});
const body = localFont({
  src: "../../node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2",
  variable: "--font-body",
  weight: "200 900",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Adivina el A/B", template: "%s · Adivina el A/B" },
  description: "Adivina qué versión ganó en tests A/B reales y aprende de sus resultados.",
};

async function Score() {
  try {
    const s = await getScore();
    return (
      <div className="score" title="Tus aciertos en los tests que jugaste">
        <span className="label">Aciertos</span>
        <span className="mono">
          {s.correct}/{s.played}
        </span>
        {s.aiPlayed > 0 && (
          <span className="mono" title="Veces que coincidiste con la estimación de Claude en tests sin resultado público" style={{ opacity: 0.75 }}>
            · con Claude {s.aiAgree}/{s.aiPlayed}
          </span>
        )}
      </div>
    );
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let admin = false;
  try {
    admin = await isAdmin();
  } catch {
    admin = false;
  }
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <div className="wrap top-in">
            <Link className="brand" href="/">
              <span className="mark" aria-hidden="true">
                <span>A</span>
                <span>B</span>
              </span>
              <b>Adivina el A/B</b>
            </Link>
            <NavLinks admin={admin} />
            <Score />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
