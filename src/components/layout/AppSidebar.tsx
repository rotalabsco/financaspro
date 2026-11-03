"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import {
  LayoutDashboard,
  Receipt,
  Landmark,
  CreditCard,
  BarChart3,
  Tags,
  FileCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  Wallet,
  FileText,
  Upload,
  Shield,
  Repeat,
  Banknote,
  CalendarRange,
  CodeXml,
} from "lucide-react";
import { SOURCE_URL } from "@/lib/source-url";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/dashboard/receitas", label: "Receitas", icon: Banknote },
  { href: "/dashboard/recorrentes", label: "Recorrentes", icon: Repeat },
  { href: "/dashboard/contas", label: "Contas Bancárias", icon: Landmark },
  { href: "/dashboard/cartoes", label: "Cartões de Crédito", icon: CreditCard },
  { href: "/dashboard/cartoes/projecao", label: "Projeção de Cartões", icon: CalendarRange },
  { href: "/dashboard/importar", label: "Importar Histórico", icon: Upload },
  { href: "/dashboard/investimentos", label: "Investimentos", icon: Wallet },
  { href: "/dashboard/resumo", label: "Resumo Anual", icon: BarChart3 },
  { href: "/dashboard/categorias", label: "Categorias", icon: Tags },
  { href: "/dashboard/fechamento", label: "Fechamento", icon: FileCheck },
  { href: "/dashboard/irpf", label: "IRPF", icon: FileText },
  { href: "/dashboard/config", label: "Configurações", icon: Settings },
  { href: "/dashboard/admin", label: "Admin", icon: Shield },
];

interface UserData {
  id: string;
  email: string;
  name?: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => data.user && setUser(data.user))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={`flex flex-col bg-surface border-r border-border transition-all duration-300 ease-smooth shrink-0 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="p-4 border-b border-border shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-foreground font-semibold"
        >
          <span className="text-primary text-xl">FP</span>
          {!collapsed && <span>FinancasPro</span>}
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <div
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <User className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <span className="text-xs truncate">
              {user?.name ?? user?.email ?? "Usuário"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors text-sm ${collapsed ? "justify-center" : ""}`}
          title="Sair"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors text-sm ${collapsed ? "justify-center" : ""}`}
          title="Código-fonte (AGPL-3.0)"
        >
          <CodeXml className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Código-fonte</span>}
        </a>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="ml-1 text-xs">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
