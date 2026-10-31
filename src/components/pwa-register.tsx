"use client";

import { useEffect } from "react";
import { listenForInstallPrompt } from "@/lib/install";

// Registrerer service workeren (kun til push, ingen cache) og fanger Androids installér-dialog.
// Ligger i rodlayoutet og tegner ingenting.
export function PwaRegister() {
  useEffect(() => {
    const stop = listenForInstallPrompt();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return stop;
  }, []);
  return null;
}
