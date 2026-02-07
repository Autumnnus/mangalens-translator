import type { Metadata } from "next";
import "react-image-gallery/styles/css/image-gallery.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MangaLens Translator",
  description: "AI-Powered Manga Translation Tool",
  icons: {
    icon: "/favicon.png",
  },
};

import SessionGuard from "@/components/SessionGuard";
import VersionChecker from "@/components/VersionChecker";
import QueryProvider from "@/providers/QueryProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body>
        <QueryProvider>
          <SessionGuard />
          <VersionChecker />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
