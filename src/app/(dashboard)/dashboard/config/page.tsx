"use client";

import { useState } from "react";
import Link from "next/link";
import { Tags, Wallet, TrendingUp, Calendar, PieChart } from "lucide-react";
import { ForecastCategoriesModal } from "@/components/settings/ForecastCategoriesModal";
import { SystemConfigModal } from "@/components/settings/SystemConfigModal";
import { DistributionGroupsModal } from "@/components/settings/DistributionGroupsModal";
import { ChangePasswordCard } from "@/components/settings/ChangePasswordCard";

export default function ConfigPage() {
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [showSystemConfigModal, setShowSystemConfigModal] = useState(false);
  const [showDistributionModal, setShowDistributionModal] = useState(false);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-6">
        Configurações
      </h1>
      <div className="grid gap-4 max-w-md">
        <ChangePasswordCard />
        <button
          type="button"
          onClick={() => setShowSystemConfigModal(true)}
          className="card-surface p-4 flex items-center gap-4 text-left w-full no-underline text-foreground hover:bg-[hsl(var(--surface-hover))] transition-colors rounded-lg border-0 bg-transparent cursor-pointer"
        >
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-medium">Mês Inicial e Referência</h2>
            <p className="text-sm text-muted-foreground">
              Mês inicial do sistema e mês de referência para a previsão
            </p>
          </div>
        </button>
        <Link
          href="/dashboard/categorias"
          className="card-surface p-4 flex items-center gap-4 no-underline text-foreground hover:bg-[hsl(var(--surface-hover))] transition-colors rounded-lg"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Tags className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-medium">Gestão de Categorias</h2>
            <p className="text-sm text-muted-foreground">
              Criar, editar e arquivar categorias
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setShowDistributionModal(true)}
          className="card-surface p-4 flex items-center gap-4 text-left w-full no-underline text-foreground hover:bg-[hsl(var(--surface-hover))] transition-colors rounded-lg border-0 bg-transparent cursor-pointer"
        >
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-medium">Distribuição do portfólio</h2>
            <p className="text-sm text-muted-foreground">
              Grupos para o gráfico de distribuição dos investimentos
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setShowForecastModal(true)}
          className="card-surface p-4 flex items-center gap-4 text-left w-full no-underline text-foreground hover:bg-[hsl(var(--surface-hover))] transition-colors rounded-lg border-0 bg-transparent cursor-pointer"
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-medium">Categorias para Previsão</h2>
            <p className="text-sm text-muted-foreground">
              Selecionar categorias para média nas previsões de despesas (últimos 3 meses)
            </p>
          </div>
        </button>
        <div className="card-surface p-4 flex items-center gap-4 opacity-75 rounded-lg">
          <div className="p-2 rounded-lg bg-muted-foreground/20 text-muted-foreground">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-medium text-muted-foreground">Cofres</h2>
            <p className="text-sm text-muted-foreground">
              Configuração de aportes — em breve
            </p>
          </div>
        </div>
      </div>

      {showDistributionModal && (
        <DistributionGroupsModal
          onClose={() => setShowDistributionModal(false)}
          onSuccess={() => setShowDistributionModal(false)}
        />
      )}
      {showForecastModal && (
        <ForecastCategoriesModal
          onClose={() => setShowForecastModal(false)}
          onSuccess={() => setShowForecastModal(false)}
        />
      )}
      {showSystemConfigModal && (
        <SystemConfigModal
          onClose={() => setShowSystemConfigModal(false)}
          onSuccess={() => setShowSystemConfigModal(false)}
        />
      )}
    </div>
  );
}
