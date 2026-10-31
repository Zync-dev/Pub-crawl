import { ImageResponse } from "next/og";

// Det lille ikon i Androids statuslinje. Kun formen tæller, så det er hvidt på gennemsigtigt:
// en pint med skum, tegnet med de samme streger som Lucides øl.
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 52, height: 14, borderRadius: 7, background: "#fff" }} />
          <div
            style={{
              width: 44,
              height: 50,
              marginTop: 4,
              borderRadius: "0 0 8px 8px",
              border: "8px solid #fff",
              borderTop: "0",
            }}
          />
        </div>
      </div>
    ),
    { width: 96, height: 96 },
  );
}
