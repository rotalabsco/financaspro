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
  X,
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

interface AppSidebarProps {
  /** Gaveta aberta (só tem efeito abaixo de md). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
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

  // Gaveta aberta: Esc fecha e a página de trás não rola.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMobileClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen, onMobileClose]);

  // Na gaveta (mobile) os rótulos aparecem sempre; "recolher" é coisa do desktop.
  const showLabels = !collapsed || mobileOpen;

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
    <aside
      id="app-sidebar"
      className={`flex flex-col bg-surface border-r border-border shrink-0 transition-[transform,width] duration-300 ease-smooth
        fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:sticky md:top-0 md:h-screen md:max-w-none md:translate-x-0 md:z-auto ${collapsed ? "md:w-16" : "md:w-64"}`}
    >
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <Link
          href="/dashboard"
          onClick={onMobileClose}
          className="flex items-center gap-2 text-foreground font-semibold"
        >
          <span className="text-primary text-xl">FP</span>
          {showLabels && <span>FinancasPro</span>}
        </Link>
        <button
          type="button"
          onClick={onMobileClose}
          className="p-2 -m-2 rounded-lg text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              title={showLabels ? undefined : label}
              className={`flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {showLabels && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <div
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground ${
            showLabels ? "" : "justify-center"
          }`}
        >
          <User className="w-5 h-5 shrink-0" />
          {showLabels && (
            <span className="text-xs truncate">
              {user?.name ?? user?.email ?? "Usuário"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors text-sm ${showLabels ? "" : "justify-center"}`}
          title="Sair"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {showLabels && <span>Sair</span>}
        </button>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors text-sm ${showLabels ? "" : "justify-center"}`}
          title="Código-fonte (AGPL-3.0)"
        >
          <CodeXml className="w-5 h-5 shrink-0" />
          {showLabels && <span>Código-fonte</span>}
        </a>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-[hsl(var(--surface-hover))] hover:text-foreground transition-colors"
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
    </>
  );
}
