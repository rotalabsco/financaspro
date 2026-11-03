"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: LucideIcon;
  index?: number;
}

export function KPICard({
  label,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  index = 0,
}: KPICardProps) {
  const changeColor =
    changeType === "positive"
      ? "text-success"
      : changeType === "negative"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="card-surface p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="label-style">{label}</p>
          <p className="text-2xl font-semibold tracking-tight font-mono-nums text-foreground mt-1">
            {value}
          </p>
          {change && (
            <p className={`text-sm font-mono-nums mt-1 ${changeColor}`}>
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
