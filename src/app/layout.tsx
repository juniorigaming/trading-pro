import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Trading Pro — Trading Journal & Intelligence",
  description: "Diário profissional de trading com análise SMC, gestão de risco, planejamento de trades e dashboard completo.",
};

// Inline script runs before paint to avoid flash of incorrect theme (FOUC).
const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("theme")||"system";var a=localStorage.getItem("accentColor")||"green";var den=localStorage.getItem("density")||"comfortable";var r="dark";if(t==="light"){r="light"}else if(t==="dark"){r="dark"}else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches){r="light"}d.setAttribute("data-theme",r);d.setAttribute("data-accent",a);d.setAttribute("data-density",den);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <meta name="theme-color" content="#07090d" />
      </head>
      <body className="min-h-screen text-text-primary antialiased">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
