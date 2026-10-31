"use client";

import { useEffect, useState } from "react";
import { installPlatform } from "@/lib/install";
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
    // Browserens push-evner kan først læses efter første render. De læses igen, når man kommer tilbage
    // til appen, fx efter at have slået beskeder til i telefonens indstillinger.
    const read = () => {
      setSupport(pushSupport());
      setDenied(pushPermission() === "denied");
      void pushEnabled().then((enabled) => {
        if (alive) setOn(enabled);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function change(next: boolean) {
    setBusy(true);
    // enablePush spørger om lov med det samme, så det stadig tæller som brugerens tryk.
    const work = next ? enablePush() : disablePush().then((ok) => (ok ? "disabled" : "not-disabled"));
    void work.then((result) => {
      setBusy(false);
      if (result === "enabled") {
        setOn(true);
        ask.toast("Du får besked, når holdet går videre.");
      } else if (result === "disabled") {
        setOn(false);
      } else if (result === "not-disabled") {
        // Telefonen får stadig beskeder, så kontakten bliver stående.
        ask.toast("Beskederne kunne ikke slås fra. Prøv igen.", "danger");
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
    if (denied) {
      return installPlatform() === "ios"
        ? "Du har sagt nej til beskeder. Slå dem til under Indstillinger > Notifikationer."
        : "Du har sagt nej til beskeder. Slå dem til under webstedets indstillinger i Chrome.";
    }
    return null;
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
      {note ? (
        <p className="text-[13px] text-oxblood-500">{note}</p>
      ) : (
        // "Sidste omgang" sendes af en åben telefon på holdet, så det løfter vi ikke for lukkede apps.
        <p className="text-[13px] text-muted">
          Ved Videre og ved Er alle med?, også når appen er lukket. Sidste omgang kommer, når en af jer har appen
          åben.
        </p>
      )}
    </Card>
  );
}
