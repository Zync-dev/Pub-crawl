"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ds";
import { HomeLink, StatusScreen } from "@/components/status-screen";
import { reportError } from "@/lib/report-error";

// Fejlgrænsen for hele appen under rodlayoutet. Rapporterer fejlen og lader holdet prøve igen.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <StatusScreen
      eyebrow="Noget gik galt"
      title="Vi snublede på vejen"
      actions={
        <>
          <Button variant="primary" size="lg" fullWidth icon={RotateCcw} onClick={() => retry()}>
            Prøv igen
          </Button>
          <HomeLink />
        </>
      }
    >
      <p>Siden gik i stå. Prøv igen, så går vi videre.</p>
    </StatusScreen>
  );
}
