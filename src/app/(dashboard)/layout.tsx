"use client";

import { MonthProvider } from "@/contexts/MonthContext";
import { AppLayout } from "@/components/layout/AppLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MonthProvider>
      <AppLayout>{children}</AppLayout>
    </MonthProvider>
  );
}
