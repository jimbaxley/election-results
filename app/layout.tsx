import type { ReactNode } from "react";

export const metadata = {
  title: "NC Election Night Dashboard",
  description: "Live NC election dashboard for Team Up NC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, -apple-system" }}>
        {children}
      </body>
    </html>
  );
}