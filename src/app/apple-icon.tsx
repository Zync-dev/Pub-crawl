import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Samme ølkrus som icon.svg, tegnet med bokse.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1020",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 64,
              height: 96,
              display: "flex",
              flexDirection: "column",
              borderRadius: "6px 6px 14px 14px",
              overflow: "hidden",
            }}
          >
            <div style={{ height: 22, background: "#f4f1ea" }} />
            <div style={{ flex: 1, background: "#f5b83d" }} />
          </div>
          <div
            style={{
              width: 22,
              height: 44,
              border: "10px solid #f5b83d",
              borderLeft: "none",
              borderRadius: "0 14px 14px 0",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
