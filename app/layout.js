import "./globals.css";

export const metadata = {
  title: "Salted Grills Recipe Lab",
  description: "Recipe engineering, bulk prep and optional costing."
};

export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
