"use client";
import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <main className={`min-h-screen transition-all duration-300 ${collapsed ? "md:ml-20" : "md:ml-72"}`}>
        <ThemeToggle />
        <CommandPalette />
        {children}
      </main>
    </>
  );
}
