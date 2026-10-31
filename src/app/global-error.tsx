"use client";

import { RotateCcw } from "lucide-react";
import { DM_Serif_Display, Libre_Franklin } from "next/font/google";
import { useEffect } from "react";
import { Button } from "@/components/ds";
import { HomeLink, StatusScreen } from "@/components/status-screen";
import { reportError } from "@/lib/report-error";
import "./globals.css";

// Erstatter rodlayoutet, når selve layoutet fejler. Har derfor sine egne skrifter og sit eget dokument.
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

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="da" className={`${dmSerif.variable} ${franklin.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Noget gik galt · Pub Crawl</title>
        <StatusScreen
          eyebrow="Noget gik galt"
          title="Hele turen gik i stå"
          actions={
            <>
              <Button variant="primary" size="lg" fullWidth icon={RotateCcw} onClick={() => retry()}>
                Prøv igen
              </Button>
              <HomeLink />
            </>
          }
        >
          <p>Appen faldt over sine egne ben. Prøv igen om et øjeblik.</p>
        </StatusScreen>
      </body>
    </html>
  );
}
