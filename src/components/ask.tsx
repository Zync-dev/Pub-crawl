"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button, Dialog, Input, Toast } from "./ds";

type ConfirmOptions = {
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  confirm: string;
  cancel?: string;
  danger?: boolean;
};

type PromptOptions = {
  eyebrow?: string;
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  confirm: string;
  maxLength?: number;
};

type Pending =
  | ({ kind: "confirm"; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

type Ask = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
  toast: (message: string, tone?: "default" | "danger") => void;
};

const AskContext = createContext<Ask | null>(null);

export function useAsk() {
  const ask = useContext(AskContext);
  if (!ask) throw new Error("useAsk skal bruges inden i AskProvider");
  return ask;
}

// Designsystemets dialog og toast i stedet for browserens confirm/prompt.
export function AskProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "default" | "danger";
    id: number;
    leaving: boolean;
  } | null>(null);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const open = useCallback((next: Pending) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeaving(false);
    setPending(next);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => open({ kind: "confirm", resolve, ...o })),
    [open],
  );
  const prompt = useCallback(
    (o: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(o.initial ?? "");
        open({ kind: "prompt", resolve, ...o });
      }),
    [open],
  );
  const showToast = useCallback((message: string, tone: "default" | "danger" = "default") => {
    toastTimers.current.forEach(clearTimeout);
    setToast({ message, tone, id: Date.now(), leaving: false });
    toastTimers.current = [
      setTimeout(() => setToast((t) => (t ? { ...t, leaving: true } : t)), 2600),
      setTimeout(() => setToast(null), 2760),
    ];
  }, []);

  // Svaret gives med det samme. Dialogen bliver lidt længere, så den kan glide ud.
  function close(result: boolean) {
    if (!pending || leaving) return;
    if (pending.kind === "confirm") pending.resolve(result);
    else pending.resolve(result && value.trim() ? value.trim() : null);
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setPending(null);
      setLeaving(false);
    }, 150);
  }

  const ask = useMemo(() => ({ confirm, prompt, toast: showToast }), [confirm, prompt, showToast]);

  function submit(e: FormEvent) {
    e.preventDefault();
    close(true);
  }

  return (
    <AskContext.Provider value={ask}>
      {children}
      <Dialog
        open={pending !== null}
        eyebrow={pending?.eyebrow}
        title={pending?.title}
        onClose={() => close(false)}
        leaving={leaving}
      >
        {pending?.kind === "confirm" && (
          <>
            {pending.body}
            <div className="pc-dialog__actions">
              <Button variant={pending.danger ? "danger" : "gold"} fullWidth onClick={() => close(true)}>
                {pending.confirm}
              </Button>
              <Button variant="ghost" fullWidth onClick={() => close(false)}>
                {pending.cancel ?? "Fortryd"}
              </Button>
            </div>
          </>
        )}
        {pending?.kind === "prompt" && (
          <form onSubmit={submit} style={{ textAlign: "left" }}>
            <Input
              label={pending.label}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={pending.placeholder}
              maxLength={pending.maxLength ?? 60}
              autoFocus
            />
            <div className="pc-dialog__actions">
              <Button type="submit" variant="gold" fullWidth disabled={!value.trim()}>
                {pending.confirm}
              </Button>
              <Button variant="ghost" fullWidth onClick={() => close(false)}>
                Fortryd
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      {toast && (
        <div
          key={toast.id}
          className="pointer-events-none fixed inset-x-0 z-[2100] flex justify-center px-4"
          style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
        >
          <Toast message={toast.message} tone={toast.tone} leaving={toast.leaving} />
        </div>
      )}
    </AskContext.Provider>
  );
}
