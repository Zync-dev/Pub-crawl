"use client";

import { fitText, SHARE_LINES, type ShareCard } from "./recap";

// Delebilledet til Aftenens regnskab: 1080 × 1350, racing green med dobbelt guldstreg,
// DM Serif Display i kursiv til overskrifter og Libre Franklin til resten.

export const RECAP_IMAGE_WIDTH = 1080;
export const RECAP_IMAGE_HEIGHT = 1350;

type Fonts = { serif: string; sans: string };
type Palette = Record<"green" | "gold" | "goldLight" | "cream" | "creamMuted", string>;

function cssVar(name: string, fallback: string) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

// next/font giver skrifterne egne navne ("'DM Serif Display', 'DM Serif Display Fallback'").
// De står i CSS-variablerne fra layout.tsx, så vi læser dem derfra og venter på, at de er hentet.
async function loadFonts(): Promise<Fonts> {
  const serif = `${cssVar("--font-dm-serif", "'DM Serif Display'")}, Georgia, serif`;
  const sans = `${cssVar("--font-franklin", "'Libre Franklin'")}, "Helvetica Neue", Arial, sans-serif`;
  try {
    await Promise.all([
      document.fonts.load(`italic 100px ${serif}`, "Aftenens regnskab"),
      document.fonts.load(`100px ${serif}`, "0123456789"),
      document.fonts.load(`600 24px ${sans}`, "Pub Crawl"),
      document.fonts.load(`700 24px ${sans}`, "PUB CRAWL"),
    ]);
    await document.fonts.ready;
  } catch {
    // Uden skrifterne tegner vi med reserverne. Billedet bliver stadig til.
  }
  return { serif, sans };
}

function palette(): Palette {
  return {
    green: cssVar("--green-800", "#1F3B2D"),
    gold: cssVar("--gold-500", "#C9A24A"),
    goldLight: cssVar("--gold-300", "#E2C987"),
    cream: cssVar("--cream-100", "#FBF5E6"),
    creamMuted: cssVar("--cream-300", "#E6D8B5"),
  };
}

// Spærret tekst tegnet bogstav for bogstav, fordi ctx.letterSpacing ikke findes i alle browsere.
function tracked(ctx: CanvasRenderingContext2D, text: string, tracking: number) {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + tracking * Math.max(0, chars.length - 1);
  return {
    width,
    draw(x: number, y: number, align: "left" | "center" = "left") {
      let cx = align === "center" ? x - width / 2 : x;
      const prev = ctx.textAlign;
      ctx.textAlign = "left";
      for (const c of chars) {
        ctx.fillText(c, cx, y);
        cx += ctx.measureText(c).width + tracking;
      }
      ctx.textAlign = prev;
    },
  };
}

function trackedFit(ctx: CanvasRenderingContext2D, text: string, tracking: number, maxWidth: number) {
  const measure = (s: string) => tracked(ctx, s, tracking).width;
  return tracked(ctx, fitText(text, maxWidth, measure), tracking);
}

// Den dobbelte guldstreg, vandret.
function doubleRule(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x1, y - 6, x2 - x1, 3);
  ctx.fillRect(x1, y + 3, x2 - x1, 3);
}

// Størst mulig skrift, der passer i bredden, men ikke under min.
function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, min: number, width: number) {
  let px = max;
  ctx.font = font(px);
  while (px > min && ctx.measureText(text).width > width) {
    px -= 2;
    ctx.font = font(px);
  }
  return px;
}

export async function renderRecapImage(card: ShareCard): Promise<Blob> {
  const { serif, sans } = await loadFonts();
  const c = palette();
  const W = RECAP_IMAGE_WIDTH;
  const H = RECAP_IMAGE_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.textBaseline = "alphabetic";

  // Flad grøn baggrund og den dobbelte guldramme.
  ctx.fillStyle = c.green;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = c.gold;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeRect(54, 54, W - 108, H - 108);

  const left = 112;
  const right = W - 112;
  const width = right - left;
  const cx = W / 2;

  // Eyebrow
  ctx.fillStyle = c.gold;
  ctx.font = `700 26px ${sans}`;
  trackedFit(ctx, card.eyebrow.toUpperCase(), 9, width).draw(cx, 160, "center");

  // Turens navn i kursiv
  ctx.fillStyle = c.cream;
  ctx.textAlign = "center";
  fitFont(ctx, card.title, (px) => `italic ${px}px ${serif}`, 108, 64, width);
  ctx.fillText(fitText(card.title, width, (s) => ctx.measureText(s).width), cx, 282);

  // Dato og status
  ctx.fillStyle = c.goldLight;
  ctx.font = `600 24px ${sans}`;
  trackedFit(ctx, card.subtitle.toUpperCase(), 5, width).draw(cx, 344, "center");

  doubleRule(ctx, left, right, 398, c.gold);

  // De store tal
  const cols = Math.max(1, card.figures.length);
  const colW = width / cols;
  card.figures.forEach((f, i) => {
    const x = left + colW * i + colW / 2;
    ctx.fillStyle = c.cream;
    ctx.textAlign = "center";
    fitFont(ctx, f.value, (px) => `${px}px ${serif}`, 92, 48, colW - 16);
    ctx.fillText(f.value, x, 528);
    ctx.fillStyle = c.gold;
    ctx.font = `700 20px ${sans}`;
    trackedFit(ctx, f.label.toUpperCase(), 6, colW - 12).draw(x, 574, "center");
  });

  doubleRule(ctx, left, right, 628, c.gold);

  // Højdepunkterne. Der er plads til SHARE_LINES over ruten, og shareCard vælger dem.
  // Lange linjer (fx top 3 med fulde navne) får mindre skrift, før de klippes.
  ctx.textAlign = "left";
  let y = 694;
  for (const line of card.lines.slice(0, SHARE_LINES)) {
    ctx.fillStyle = c.goldLight;
    ctx.font = `700 20px ${sans}`;
    trackedFit(ctx, line.label.toUpperCase(), 6, width).draw(left, y);
    ctx.fillStyle = c.cream;
    fitFont(ctx, line.value, (px) => `italic ${px}px ${serif}`, 44, 30, width);
    ctx.fillText(fitText(line.value, width, (s) => ctx.measureText(s).width), left, y + 50);
    y += 94;
  }

  // Ruten på én linje
  if (card.route) {
    const ry = Math.max(y + 2, 1166);
    ctx.fillStyle = c.goldLight;
    ctx.font = `700 20px ${sans}`;
    trackedFit(ctx, "RUTEN", 6, width).draw(left, ry);
    ctx.fillStyle = c.creamMuted;
    ctx.font = `600 26px ${sans}`;
    ctx.fillText(fitText(card.route, width, (s) => ctx.measureText(s).width), left, ry + 38);
  }

  // Skiltet nederst
  ctx.fillStyle = c.gold;
  ctx.textAlign = "center";
  ctx.font = `italic 40px ${serif}`;
  ctx.fillText("Pub Crawl", cx, H - 104);
  ctx.font = `600 16px ${sans}`;
  trackedFit(ctx, card.footer.toUpperCase(), 6, width).draw(cx, H - 76, "center");

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas_empty"))), "image/png");
  });
}

export type ShareResult = "shared" | "downloaded" | "cancelled" | "retry";

// Del billedet med telefonens deleark. Kan browseren ikke dele filer, hentes billedet i stedet.
export async function shareRecapImage(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: "image/png" });
  const data: ShareData = { files: [file], title };
  let canShare = false;
  try {
    canShare = typeof navigator.share === "function" && Boolean(navigator.canShare?.(data));
  } catch {
    canShare = false;
  }
  if (canShare) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return "cancelled";
      // Safari kræver et frisk tryk. Billedet er klar, så næste tryk deler med det samme.
      if (name === "NotAllowedError") return "retry";
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
