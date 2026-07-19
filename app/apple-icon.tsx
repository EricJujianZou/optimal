import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon. iOS applies its own rounded-rect mask, so we fill the full
// square with the app background and center the emerald "O".
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
          background: "#09090b",
          color: "#10b981",
          fontSize: 118,
          fontWeight: 700,
        }}
      >
        O
      </div>
    ),
    { ...size }
  );
}
