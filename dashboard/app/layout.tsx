import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

// spec_identidad_visual_day2day.md: Day2Day Design System — un solo peso por familia, el mismo
// que valida el canvas "Day2Day — Primera muestra" (700 para el display, 400/600 para el texto de
// UI, 500 para los datos reales).
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

// next/font/google no expone "Big Shoulders Display" como familia separada en esta versión de
// Next.js (su font-data.json solo trae Big Shoulders / Inline / Stencil) — "Big Shoulders" a
// secas es el mismo corte que Google Fonts mostraba como "Display" antes de reorganizar la
// familia, así que es la sustitución correcta, no una aproximación.
const bigShouldersDisplay = Big_Shoulders({
  variable: "--font-big-shoulders-display",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "app-transp | Dashboard",
  description: "Control de jornadas y flotas de transporte",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bigShouldersDisplay.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
