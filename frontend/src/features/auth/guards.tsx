import { Center, Loader, useMantineColorScheme } from "@mantine/core";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { setLocale } from "../../i18n";
import { useCurrentUser } from "./useAuth";

export function FullPageLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}

/** Applies the signed-in user's stored language and theme (ADR-0013). */
function UserPreferencesSync() {
  const { data: user } = useCurrentUser();
  const { setColorScheme } = useMantineColorScheme();
  const locale = user?.locale;
  const theme = user?.theme;

  useEffect(() => {
    if (locale) void setLocale(locale);
  }, [locale]);
  useEffect(() => {
    if (theme) setColorScheme(theme);
  }, [theme, setColorScheme]);
  return null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <FullPageLoader />;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    const search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
    return <Navigate to={`/login${search}`} replace />;
  }
  return (
    <>
      <UserPreferencesSync />
      {children}
    </>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  if (user?.role !== "ADMIN") return <Navigate to="/settings" replace />;
  return <>{children}</>;
}
