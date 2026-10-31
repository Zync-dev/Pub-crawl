import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Libre_Franklin } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pub Crawl",
  description: "Ruten, omgangene og holdet til J-dag.",
  appleWebApp: { capable: true, title: "Pub Crawl", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1F3B2D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className={`${dmSerif.variable} ${franklin.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        {/* pwa-push: service worker og installér-dialog */}
        <PwaRegister />
      </body>
    </html>
  );
}
