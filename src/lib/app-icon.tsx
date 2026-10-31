import { ImageResponse } from "next/og";
import { MONOGRAM_PATH } from "./monogram";

// Appens ikon som PNG til manifestet (Android vil have 192 og 512). Tegnet som stier, så det ligner
// apple-icon og logoet uden at skulle hente skrifttypen.
// maskable: grøn helt ud til kanten og monogrammet inden for de midterste 80 %, som Android kan skære til.
export function appIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  return new ImageResponse(
    (
      <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
        {maskable && <rect width="96" height="96" fill="#1F3B2D" />}
        <g transform={maskable ? "translate(19.2 19.2) scale(0.6)" : undefined}>
          <rect width="96" height="96" rx="22" fill="#1F3B2D" />
          <rect x="6" y="6" width="84" height="84" rx="17" fill="none" stroke="#C9A24A" strokeWidth="2" />
          <rect x="11" y="11" width="74" height="74" rx="13" fill="none" stroke="#C9A24A" strokeWidth="2" />
          <path fill="#C9A24A" d={MONOGRAM_PATH} />
        </g>
      </svg>
    ),
    { width: size, height: size },
  );
}
