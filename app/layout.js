import "./globals.css";
import "./category-fixes.css";
import "./searchable-ingredient.css";
import "./packaging.css";
import "./kitchen-workflow.css";
import "./units.css";
import "./mobile-nav.css";
import "./autosave.css";
import "./mobile-stabilization.css";
import { Manrope } from "next/font/google";
import DeleteEnhancer from "./DeleteEnhancer";
import SearchableIngredientSelect from "./SearchableIngredientSelect";
import PackagingEnhancer from "./PackagingEnhancer";
import KitchenWorkflowEnhancer from "./KitchenWorkflowEnhancer";
import UnitsEnhancer from "./UnitsEnhancer";
import NavigationCoordinator from "./NavigationCoordinator";
import MobileNavigation from "./MobileNavigation";
import AutosaveRecovery from "./AutosaveRecovery";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope"
});

export const metadata = {
  title: "Salted Grills Recipe Lab",
  description: "Recipe engineering, bulk prep and optional costing.",
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
  return <html lang="en"><body className={manrope.variable}><MobileNavigation/><NavigationCoordinator/><DeleteEnhancer/><SearchableIngredientSelect/><PackagingEnhancer/><KitchenWorkflowEnhancer/><UnitsEnhancer/><AutosaveRecovery/>{children}</body></html>;
}
