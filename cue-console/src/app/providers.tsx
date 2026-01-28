"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "@/contexts/config-context";
import { AuthProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ConfigProvider>{children}</ConfigProvider>
    </AuthProvider>
  );
}
