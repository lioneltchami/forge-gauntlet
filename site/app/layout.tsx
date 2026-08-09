import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Gauntlet — quality loops that beat a real bar",
  description:
    "Six stones. One bar. Blind critic. Binary win. Open quality-loop runtime. Technique by Matt Shumer.",
  metadataBase: new URL("https://gauntlet-runtime.vercel.app"),
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Forge Gauntlet",
    description:
      "Original forge mark. Named bar. Blind critic. Loop until yours wins.",
    type: "website",
    images: [{ url: "/hero-forge.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge Gauntlet",
    description: "Quality ordeal runtime. Technique by Matt Shumer.",
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
