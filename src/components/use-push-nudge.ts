"use client";

import { useEffect } from "react";
import { enablePush, pushPermission, pushSupport } from "@/lib/push";
import { useAsk } from "./ask";

// pwa-push: spørger én gang pr. telefon, om man vil have beskeder, når holdet er tjekket ind et sted.
// Knappen i toasten er et tryk, så telefonen må spørge om lov. Kontakten ligger stadig i Holdet > Indstillinger.
// På iPhone i Safari spørger vi ikke: appen skal på hjemmeskærmen for at give besked, og lagt der midt
// på turen starter den som en ny person på holdet.

const ASKED_KEY = "pc-push-asked";
// Efter Tjek ind-toasten med Fortryd, så den ikke bliver skubbet væk.
const DELAY_MS = 8_000;

function asked() {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return true;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {}
}

export function usePushNudge(checkedIn: boolean) {
  const ask = useAsk();

  useEffect(() => {
    if (!checkedIn) return;
    const timer = setTimeout(() => {
      if (pushSupport() !== "supported" || pushPermission() !== "default" || asked()) return;
      markAsked();
      ask.toast("Vil du have besked, når holdet går videre?", {
        duration: 10_000,
        action: {
          label: "Få besked",
          onClick: () =>
            void enablePush().then((result) => {
              if (result === "enabled") ask.toast("Du får besked, når holdet går videre.");
              else if (result === "failed") ask.toast("Det virkede ikke. Prøv under Holdet > Indstillinger.", "danger");
            }),
        },
      });
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [checkedIn, ask]);
}
