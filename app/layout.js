import "./globals.css";
import "./costing-first.css";
import "./delete-controls.css";
import { Manrope } from "next/font/google";
import DeleteControls from "./DeleteControls";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope"
});

export const metadata = {
  title: "Salted Grills Costing Lab",
  description: "Ingredient, bulk recipe and menu item costing for Salted Grills.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123f31"
};

export default function RootLayout({children}) {
  return <html lang="en"><body className={manrope.variable}><DeleteControls/>{children}</body></html>;
}
