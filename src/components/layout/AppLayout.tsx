"use client";

import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppLayout({ children }: { children: React.ReactNode }) {
  // Abaixo de md a sidebar vira gaveta: o cabeçalho abre, a própria sidebar fecha.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
