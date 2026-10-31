"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Fanger fejl, som ingen fejlgrænse ser (event handlers, timere, afviste promises), og sender dem videre.
// Ligger i rodlayoutet, så lytterne kun sættes op én gang.
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportError(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
