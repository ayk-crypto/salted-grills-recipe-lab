import "./globals.css";

export const metadata = {
  title: "Salted Grills Recipe Lab",
  description: "Recipe engineering, bulk prep and optional costing.",
  manifest: "/manifest.webmanifest",
  themeColor: "#111827",
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#111827" };

export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
