// src/app/layout.tsx
import "./globals.css";

export default function RootLayout({children}: {children: React.ReactNode}) {
  // Root layout doit rester simple et stable.
  // La locale est gérée dans src/app/[locale]/layout.tsx via next-intl.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
