import type { Metadata } from "next";
import type { ReactNode } from "react";
import './globals.css';

export const metadata: Metadata = {
  title: "ROVA Operations",
  description: "ROVA road-safety operations dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
