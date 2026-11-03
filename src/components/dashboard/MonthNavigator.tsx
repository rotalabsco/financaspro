"use client";

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface MonthNavigatorProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  status?: string;
}

export function MonthNavigator({
  year,
  month,
  onPrev,
  onNext,
  status,
}: MonthNavigatorProps) {
  const label = `${MONTHS[month - 1]} ${year}`;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onPrev}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        aria-label="Mês anterior"
      >
        <span className="text-xl">‹</span>
      </button>
      <div className="text-center min-w-[140px]">
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {label}
        </span>
        {status && (
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            ({status})
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        aria-label="Próximo mês"
      >
        <span className="text-xl">›</span>
      </button>
    </div>
  );
}
