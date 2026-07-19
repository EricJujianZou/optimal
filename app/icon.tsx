import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Home-screen / PWA icon: emerald "O" on the app's near-black background,
// matching the UI accent (emerald-500 on zinc-950).
export default function Icon() {
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
          fontSize: 320,
          fontWeight: 700,
        }}
      >
        O
      </div>
    ),
    { ...size }
  );
}
