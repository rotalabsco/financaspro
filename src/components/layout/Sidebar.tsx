"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/resumo", label: "Resumo Anual" },
  { href: "/dashboard/categorias", label: "Categorias" },
  { href: "/dashboard/fechamento", label: "Fechamento" },
  { href: "/dashboard/config", label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-300 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <Link href="/dashboard" className="text-lg font-bold text-white">
          FinancasPro
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === href
                ? "bg-indigo-600 text-white"
                : "hover:bg-gray-800 text-gray-300"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
