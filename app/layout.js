import "./globals.css";
import "./costing-first.css";
import "./delete-controls.css";
import "./premium-ui.css";
import "./price-import.css";
import "./ingredients-revamp.css";
import { Manrope } from "next/font/google";
import DeleteControls from "./DeleteControls";
import PremiumExperience from "./PremiumExperience";
import PriceImportExperience from "./PriceImportExperience";
import IngredientsPageExperience from "./IngredientsPageExperience";
import ActionDeleteExperience from "./ActionDeleteExperience";

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
  themeColor: "#151a1d"
};

export default function RootLayout({children}) {
  return <html lang="en"><body className={manrope.variable}><PremiumExperience/><IngredientsPageExperience/><PriceImportExperience/><ActionDeleteExperience/><DeleteControls/>{children}</body></html>;
}
