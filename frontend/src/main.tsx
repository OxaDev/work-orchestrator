import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { AppProviders } from "./app/AppProviders";
import { routes } from "./app/routes";
import { ROUTER_BASENAME } from "./config";

const router = createBrowserRouter(routes, { basename: ROUTER_BASENAME });

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
