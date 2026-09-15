import "./cost-control-v2.css";
import "./bulk-menu-actions.css";
import { Manrope } from "next/font/google";
import MenuImportActions from "./MenuImportActions";
import BulkMenuActions from "./BulkMenuActions";

const manrope=Manrope({subsets:["latin"],display:"swap",variable:"--font-manrope"});

export const metadata={
 title:"Salted Grills Cost Control",
 description:"Operational ingredient pricing, prepared-component costing and menu cost analysis for Salted Grills.",
 manifest:"/manifest.webmanifest",
 icons:{icon:"/icon.svg",apple:"/icon.svg"}
};
export const viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#11181a"};
export default function RootLayout({children}){return <html lang="en"><body className={manrope.variable}><MenuImportActions/><BulkMenuActions/>{children}</body></html>}