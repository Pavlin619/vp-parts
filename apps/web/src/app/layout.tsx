import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { CartDrawer, CartSync } from "@/components/cart";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VP Parts — Резервни части",
  description: "Онлайн магазин за авточасти",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bg"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}

          {/* Mounted once at the root rather than per route group: the
              marketing and shop layouts each have their own header with a
              cart icon, and both need the same drawer to open from it. */}
          <CartDrawer />

          {/* The cart lives on the server; this reconciles the copy the
              browser paints from. Renders nothing. */}
          <CartSync />
        </Providers>
      </body>
    </html>
  );
}
