import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createQueryClient } from "./queryClient";
import { theme } from "./theme";

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
  /** "test" disables Mantine transitions and portals (component tests only). */
  mantineEnv?: "default" | "test";
}

export function AppProviders({ children, queryClient, mantineEnv }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" env={mantineEnv}>
      <Notifications />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
