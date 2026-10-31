import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Henter DM Serif Display Italic fra Google Fonts, når ikonet bygges.
async function loadFont() {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@1&text=Pc",
  ).then((res) => res.text());
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) return null;
  return fetch(url).then((res) => res.arrayBuffer());
}

// Designsystemets monogram: "Pc" i en grøn flise med dobbelt guldkant.
export default async function AppleIcon() {
  const font = await loadFont().catch(() => null);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1F3B2D",
        }}
      >
        {/* To streger i stedet for "double", som ImageResponse ikke kan tegne. */}
        <div
          style={{
            width: 156,
            height: 156,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 32,
            border: "3px solid #C9A24A",
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 25,
              border: "3px solid #C9A24A",
              color: "#C9A24A",
              fontSize: 76,
              fontFamily: font ? "DM Serif Display" : "serif",
              fontStyle: "italic",
            }}
          >
            Pc
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "DM Serif Display", data: font, style: "italic", weight: 400 }] : undefined,
    },
  );
}
