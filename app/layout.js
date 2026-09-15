import "./cost-control-v2.css";
import "./bulk-menu-actions.css";
import "./safety-confirm.css";
import "./shelfsense-ops.css";
import "./app-wide-ux.css";
import { Manrope } from "next/font/google";
import MenuImportActions from "./MenuImportActions";
import BulkMenuActions from "./BulkMenuActions";
import SafetyConfirmation from "./SafetyConfirmation";
import CostControlUX from "./CostControlUX";
import ShelfSenseOperations from "./ShelfSenseOperations";
import IngredientPriceShelfSense from "./IngredientPriceShelfSense";
import IngredientPurchaseDisplay from "./IngredientPurchaseDisplay";
import AppInputFocusGuard from "./AppInputFocusGuard";
import SearchFilters from "./SearchFilters";

const manrope=Manrope({subsets:["latin"],display:"swap",variable:"--font-manrope"});

export const metadata={
 title:"Salted Grills Cost Control",
 description:"Operational ingredient pricing, bulk-recipe costing and menu cost analysis for Salted Grills.",
 manifest:"/manifest.webmanifest",
 icons:{icon:"/icon.svg",apple:"/icon.svg"}
};
export const viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#11181a"};
export default function RootLayout({children}){return <html lang="en"><body className={manrope.variable}><AppInputFocusGuard/><MenuImportActions/><BulkMenuActions/><SafetyConfirmation/><CostControlUX/><ShelfSenseOperations/><IngredientPriceShelfSense/><IngredientPurchaseDisplay/><SearchFilters/>{children}</body></html>}
