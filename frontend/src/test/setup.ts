import "@testing-library/jest-dom/vitest";
import "../i18n";

import { notifications } from "@mantine/notifications";

import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import i18n from "../i18n";
import { resetBackend, server } from "./server";

// Pages chain several queries before their first render (session, holidays, half-days...):
// under the load of parallel test files, the default 1 s of findBy* is sometimes too short.
configure({ asyncUtilTimeout: 3000 });

// jsdom lacks these browser APIs used by Mantine.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;

// Mantine's combobox scrolls the active option into view; jsdom lacks the API.
Element.prototype.scrollIntoView = () => {};

// Mantine's autosize Textarea listens to font loading; jsdom has no document.fonts.
Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { addEventListener: () => {}, removeEventListener: () => {}, ready: Promise.resolve() },
});

// Any translation key rendered by a test but missing from the catalogues fails that test.
const missingKeys: string[] = [];
i18n.options.saveMissing = true;
i18n.options.missingKeyHandler = (languages, namespace, key) => {
  missingKeys.push(`${languages.join(",")}:${namespace}:${key}`);
};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(async () => {
  resetBackend();
  // Mantine's notification store is global: toasts of a previous test would fill the queue.
  notifications.clean();
  notifications.cleanQueue();
  window.localStorage.clear();
  await i18n.changeLanguage("fr");
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  const missing = missingKeys.splice(0);
  if (missing.length)
    throw new Error(`Missing translation keys: ${[...new Set(missing)].join(", ")}`);
});
afterAll(() => server.close());
