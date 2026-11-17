import { type ReactNode, useCallback, useMemo, useState } from "react";

import { EMPTY_SCOPE, WorkContext, type WorkScope } from "./scope";

const STORAGE_KEY = "wo.workContext";

function load(): WorkScope {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<WorkScope>) : {};
    const missionId = typeof value.missionId === "string" ? value.missionId : null;
    const projectId = missionId && typeof value.projectId === "string" ? value.projectId : null;
    return { missionId, projectId };
  } catch {
    return EMPTY_SCOPE;
  }
}

function store(scope: WorkScope): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } catch {
    // Storage unavailable (private mode): the scope lasts for the session only.
  }
}

/** Holds the current mission and project (ADR-0042), remembered in the browser. */
export function WorkContextProvider({ children }: { children: ReactNode }) {
  const [scope, setState] = useState<WorkScope>(load);
  const setScope = useCallback((next: WorkScope) => {
    const value = { missionId: next.missionId, projectId: next.missionId ? next.projectId : null };
    store(value);
    setState((current) =>
      current.missionId === value.missionId && current.projectId === value.projectId
        ? current
        : value,
    );
  }, []);
  const value = useMemo(() => ({ ...scope, setScope }), [scope, setScope]);
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}
