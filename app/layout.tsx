import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "NC Election Night Dashboard",
  description: "Live NC election dashboard for Team Up NC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={montserrat.className}>
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
