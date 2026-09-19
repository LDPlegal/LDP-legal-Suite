import type { Metadata } from "next";
import { Charis_SIL, Libre_Franklin } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

// Interfaz — Libre Franklin (400/500/600). Reemplaza a Inter.
const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-ui",
  display: "swap",
});

// Titulares — Charis SIL, equivalente libre de Charter (la fuente de los
// documentos de la oficina). Solo 400/700 disponibles en Google Fonts.
const charisSil = Charis_SIL({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LDP Legal Suite",
  description: "Sistema de gestión legal para firmas boutique en República Dominicana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Las variables de next/font van en <html>, no en <body>: Tailwind resuelve
  // `@theme inline` contra :root, así que si viven en el body la cadena
  // --font-sans → var(--font-sans-ui) queda sin substituir y no carga nada.
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${libreFranklin.variable} ${charisSil.variable}`}
    >
      <head>
        {/* Material Symbols Sharp (FILL 1) — iconografía sólida de esquinas
            rectas. Se consume con la clase `.ms` (ver globals.css). */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@24,400,1,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
