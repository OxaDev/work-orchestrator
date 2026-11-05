import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AppProviders } from "../app/AppProviders";
import { routes } from "../app/routes";

import type { UserRead } from "../api/client";
import { resetBackend } from "./server";

/**
 * Renders the full application at `path`, with a fresh query cache and no retries.
 * `user` is the signed-in user in the fake backend (default: a regular user), or null.
 */
export function renderApp(path = "/", options: { user?: UserRead | null } = {}) {
  if (options.user !== undefined) resetBackend(options.user);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <AppProviders queryClient={queryClient} mantineEnv="test">
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}
