interface VaultCardProps {
  name: string;
  balance: number;
  /** Aporte mensal do cofre (opcional, para exibir como subtítulo) */
  monthlyDeposit?: number;
}

export function VaultCard({ name, balance, monthlyDeposit }: VaultCardProps) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(balance);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{name}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">
        {formatted}
      </p>
      {monthlyDeposit != null && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Aporte: R$ {monthlyDeposit.toFixed(2).replace(".", ",")}
        </p>
      )}
    </div>
  );
}
