import { createContext, useContext } from "react";

/**
 * The mission and project the user is working in (ADR-0042). Documents and architectures pages
 * show this scope by default. Remembered in the browser only: a convenience, not data.
 */
export interface WorkScope {
  missionId: string | null;
  projectId: string | null;
}

export interface WorkContextValue extends WorkScope {
  setScope: (scope: WorkScope) => void;
}

export const EMPTY_SCOPE: WorkScope = { missionId: null, projectId: null };

export const WorkContext = createContext<WorkContextValue>({
  ...EMPTY_SCOPE,
  setScope: () => undefined,
});

export function useWorkContext(): WorkContextValue {
  return useContext(WorkContext);
}
