"use client";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";
import { PortfolioProvider } from "./PortfolioProvider";
import PwaRegister from "./PwaRegister";

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Tela de login: sem menu lateral nem atalhos (a página cuida do próprio layout)
  if (pathname === "/login") return <>{children}</>;

  return (
    <PortfolioProvider>
      <PwaRegister />
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <main className={`min-h-screen transition-all duration-300 ${collapsed ? "md:ml-20" : "md:ml-72"}`}>
        <ThemeToggle />
        <CommandPalette />
        {children}
      </main>
    </PortfolioProvider>
  );
}
