import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "react-image-gallery/styles/css/image-gallery.css";
import "./globals.css";

import QueryProvider from "@/providers/QueryProvider";
import SessionGuard from "@/components/SessionGuard";
import ThemeApplier from "@/components/ThemeApplier";
import VersionChecker from "@/components/VersionChecker";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MangaLens",
  description: "Manga translation workspace",
  icons: {
    icon: "/favicon.png",
  },
};

/**
 * Applies the persisted theme before hydration so a light-theme user never
 * sees a dark flash. Reads the same localStorage key zustand persists to.
 */
const themeBootScript = `
(function () {
  try {
    var raw = localStorage.getItem("mangalens_settings");
    if (!raw) return;
    var theme = JSON.parse(raw).state && JSON.parse(raw).state.theme;
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <QueryProvider>
          <SessionGuard />
          <ThemeApplier />
          <VersionChecker />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
