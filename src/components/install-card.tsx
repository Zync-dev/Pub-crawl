"use client";

import { Copy, Download, Ellipsis, EllipsisVertical, Menu, Share, SquarePlus, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { dismissInstall, installDismissed, promptInstall, useInstallState, type InstallState } from "@/lib/install";
import { Button, Card, Icon, IconButton } from "./ds";

// Guide til at lægge appen på hjemmeskærmen. Vises kun på telefoner, hvor den ikke er installeret endnu.
// tone="dark" på den grønne baggrund (forsiden og invitationen), "light" i indstillingerne.
// when="before": før man er med på turen. På iPhone har appen på hjemmeskærmen sin egen hukommelse,
// så den starter som en ny person. Derfor skal den lægges der, før man hopper med, og turen åbnes derfra.
// when="joined": man er allerede med (Holdet > Indstillinger), så den advarer om netop det.
// Kun forsidens guide kan lukkes (dismissible). Andre steder står den, så længe den er relevant.
export function InstallCard({
  tone = "light",
  when = "joined",
  code,
  dismissible = false,
}: {
  tone?: "dark" | "light";
  when?: "before" | "joined";
  code?: string;
  dismissible?: boolean;
}) {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(dismissible);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    // localStorage kan først læses i browseren.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(installDismissed());
  }, [dismissible]);

  const show = state.ready && !state.standalone && (state.platform !== "other" || state.canPrompt);
  if (!show || dismissed) return null;

  const dark = tone === "dark";
  const muted = dark ? "text-cream-200/80" : "text-muted";
  const accent = dark ? "var(--gold-500)" : "var(--oxblood-700)";
  const inApp = state.browser === "in-app";
  const ios = state.platform === "ios";

  function close() {
    dismissInstall();
    setDismissed(true);
  }

  async function install() {
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const label = inApp
    ? ios
      ? "Åbn linket i Safari først"
      : "Åbn linket i Chrome først"
    : when === "before"
      ? "Læg den på hjemmeskærmen først"
      : "Læg den på hjemmeskærmen";

  const text = inApp
    ? "Herinde kan appen ikke lægges på hjemmeskærmen."
    : !ios
      ? "Så virker positionen og beskederne bedre i aften."
      : when === "joined"
        ? "Appen derfra starter som en ny person. Gør det helst før turen."
        : code
          ? `Åbn den fra ikonet, og skriv koden ${code}.`
          : "Åbn turen fra ikonet, så du kun er med én gang.";

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 pt-1">
          <p className="pc-label" style={{ color: accent }}>
            {label}
          </p>
          <p className={`mt-2 text-[14px] leading-snug ${muted}`}>{text}</p>
        </div>
        {dismissible && <IconButton icon={X} label="Luk guiden" className="-mr-2 -mt-1" onClick={close} />}
      </div>

      {inApp ? (
        <Button variant={dark ? "gold" : "primary"} icon={Copy} fullWidth onClick={() => void copyLink()}>
          {copied ? "Kopieret" : ios ? "Kopiér linket til Safari" : "Kopiér linket til Chrome"}
        </Button>
      ) : state.canPrompt ? (
        <Button variant={dark ? "gold" : "primary"} icon={Download} fullWidth loading={installing} onClick={() => void install()}>
          Installér
        </Button>
      ) : (
        <ol className="flex flex-col gap-2 text-[15px]">
          {steps(state).map((s, i) => (
            <Step key={i} n={i + 1} icons={s.icons} dark={dark}>
              {s.text}
            </Step>
          ))}
        </ol>
      )}
    </>
  );

  if (dark) {
    return (
      <div className="pc-on-dark pc-enter flex flex-col gap-3 rounded-[var(--radius-md)] border border-gold-500/40 p-4 text-cream-100">
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

type StepText = { text: string; icons: LucideIcon[] };

// Trinene for telefonens browser. Safari på iOS 26 har Del i menuen med de tre prikker.
function steps(state: InstallState): StepText[] {
  if (state.platform === "ios") {
    const add = { text: "Vælg Føj til hjemmeskærm, evt. under Vis mere", icons: [SquarePlus] };
    if (state.browser === "chrome-ios") return [{ text: "Tryk på Del øverst i Chrome", icons: [Share] }, add];
    if (state.browser === "ios-other") return [{ text: "Tryk på Del i browserens menu", icons: [Share] }, add];
    return [{ text: "Tryk på Del eller de tre prikker i Safari", icons: [Share, Ellipsis] }, add];
  }
  if (state.browser === "samsung") {
    return [
      { text: "Åbn menuen nederst i Samsung Internet", icons: [Menu] },
      { text: "Vælg Tilføj side til, og så Startskærm", icons: [SquarePlus] },
    ];
  }
  return [
    { text: "Åbn menuen med de tre prikker i Chrome", icons: [EllipsisVertical] },
    { text: "Vælg Installér app eller Føj til startskærm", icons: [Download] },
  ];
}

function Step({ n, icons, dark, children }: { n: number; icons: LucideIcon[]; dark: boolean; children: ReactNode }) {
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
      {icons.map((icon, i) => (
        <Icon key={i} name={icon} size={20} color={dark ? "var(--gold-500)" : "var(--green-800)"} />
      ))}
    </li>
  );
}
