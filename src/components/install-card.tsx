"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dismissInstall, installDismissed, promptInstall, useInstallState } from "@/lib/install";
import { Button, Card, Icon, IconButton } from "./ds";

// Guide til at lægge appen på hjemmeskærmen. Vises kun på telefoner, hvor den ikke er installeret endnu.
// tone="dark" på forsidens grønne baggrund, "light" i indstillingerne.
export function InstallCard({ tone = "light" }: { tone?: "dark" | "light" }) {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // localStorage kan først læses i browseren.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(installDismissed());
  }, []);

  const show = state.ready && !state.standalone && (state.platform !== "other" || state.canPrompt);
  if (!show || dismissed) return null;

  const dark = tone === "dark";
  const muted = dark ? "text-cream-200/80" : "text-muted";
  const accent = dark ? "var(--gold-500)" : "var(--oxblood-700)";

  function close() {
    dismissInstall();
    setDismissed(true);
  }

  async function install() {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  }

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 pt-1">
          <p className="pc-label" style={{ color: accent }}>
            Læg den på hjemmeskærmen
          </p>
          <p className={`mt-2 text-[14px] leading-snug ${muted}`}>
            Så virker positionen og beskederne bedre i aften.
          </p>
        </div>
        <IconButton icon={X} label="Luk guiden" className="-mr-2 -mt-1" onClick={close} />
      </div>

      {state.canPrompt ? (
        <Button variant={dark ? "gold" : "primary"} icon={Download} fullWidth loading={installing} onClick={() => void install()}>
          Installér
        </Button>
      ) : state.platform === "ios" ? (
        <ol className="flex flex-col gap-2 text-[15px]">
          <Step n={1} icon={Share} dark={dark}>
            Tryk på Del nederst i Safari
          </Step>
          <Step n={2} icon={SquarePlus} dark={dark}>
            Vælg Føj til hjemmeskærm
          </Step>
        </ol>
      ) : (
        <ol className="flex flex-col gap-2 text-[15px]">
          <Step n={1} dark={dark}>
            Åbn menuen med de tre prikker i Chrome
          </Step>
          <Step n={2} icon={Download} dark={dark}>
            Vælg Installér app
          </Step>
        </ol>
      )}
    </>
  );

  if (dark) {
    return (
      <div className="pc-enter flex flex-col gap-3 rounded-[var(--radius-md)] border border-gold-500/40 p-4 text-cream-100">
        {body}
      </div>
    );
  }
  return (
    <Card className="pc-enter flex flex-col gap-3" padding="14px 16px">
      {body}
    </Card>
  );
}

function Step({
  n,
  icon,
  dark,
  children,
}: {
  n: number;
  icon?: typeof Share;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3">
      <span
        className="flex size-7 flex-none items-center justify-center rounded-full font-serif text-[15px]"
        style={{
          background: dark ? "var(--gold-500)" : "var(--green-800)",
          color: dark ? "var(--green-900)" : "var(--gold-300)",
        }}
        aria-hidden
      >
        {n}
      </span>
      <span className="flex-1">{children}</span>
      {icon && <Icon name={icon} size={20} color={dark ? "var(--gold-500)" : "var(--green-800)"} />}
    </li>
  );
}
