"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, pushEnabled, pushPermission, pushSupport, type PushSupport } from "@/lib/push";
import { useAsk } from "./ask";
import { Card, Switch } from "./ds";

// "Giv besked på telefonen" under Holdet > Indstillinger.
export function PushSettings() {
  const ask = useAsk();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Browserens push-evner kan først læses efter første render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupport(pushSupport());
    setDenied(pushPermission() === "denied");
    /* eslint-enable react-hooks/set-state-in-effect */
    void pushEnabled().then((enabled) => {
      if (alive) setOn(enabled);
    });
    return () => {
      alive = false;
    };
  }, []);

  function change(next: boolean) {
    setBusy(true);
    // enablePush spørger om lov med det samme, så det stadig tæller som brugerens tryk.
    const work = next ? enablePush() : disablePush().then((ok) => (ok ? "disabled" : "failed"));
    void work.then((result) => {
      setBusy(false);
      if (result === "enabled") {
        setOn(true);
        ask.toast("Du får besked, når holdet rykker");
      } else if (result === "disabled") {
        setOn(false);
      } else if (result === "denied") {
        setDenied(true);
        setOn(false);
      } else {
        ask.toast("Beskederne kunne ikke slås til. Prøv igen.", "danger");
      }
    });
  }

  const note = (() => {
    if (support === "needs-install") return "På iPhone virker det først, når appen ligger på hjemmeskærmen.";
    if (support === "unsupported") return "Din browser kan ikke give besked. Prøv Chrome eller Safari.";
    if (support === "unconfigured") return "Beskeder er ikke sat op på serveren endnu.";
    if (denied) return "Du har sagt nej til beskeder. Slå dem til i telefonens indstillinger.";
    return "Når tiden er gået, og når holdet går videre. Også når appen er lukket.";
  })();

  const usable = support === "supported" && !denied;

  return (
    <Card className="flex flex-col gap-1">
      <Switch
        checked={on && usable}
        onChange={change}
        disabled={!usable || busy}
        label="Giv besked på telefonen"
      />
      <p className={`text-[13px] ${usable || support === null ? "text-muted" : "text-oxblood-500"}`}>{note}</p>
    </Card>
  );
}
