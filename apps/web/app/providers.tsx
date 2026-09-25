"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { SignInProvider } from "@/components/sign-in";
import { ToastProvider } from "@/components/toast";
import { SessionProvider } from "@/lib/client/session";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <SessionProvider>
          <ToastProvider>
            <SignInProvider>{children}</SignInProvider>
          </ToastProvider>
        </SessionProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
