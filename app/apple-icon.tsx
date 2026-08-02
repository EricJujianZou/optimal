import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#2a241c",
          color: "#c4a574",
          fontSize: 108,
          fontWeight: 600,
          fontFamily: "Georgia, serif",
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}
