import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, ApiRequestError, sessionEvents, unwrap, type UserRead } from "../../api/client";

export const ME_QUERY_KEY = ["auth", "me"] as const;

/** Current user, or null when there is no valid session. */
export function useCurrentUser() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onExpired = () => queryClient.setQueryData(ME_QUERY_KEY, null);
    sessionEvents.addEventListener("expired", onExpired);
    return () => sessionEvents.removeEventListener("expired", onExpired);
  }, [queryClient]);

  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<UserRead | null> => {
      try {
        return await unwrap(api.GET("/api/v1/auth/me"));
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      unwrap(api.POST("/api/v1/auth/login", { body: credentials })),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/auth/logout")),
    onSettled: () => {
      // Drop every cached resource of the previous session, then mark it anonymous.
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}

export type ProfileChanges = {
  display_name?: string;
  locale?: UserRead["locale"];
  theme?: UserRead["theme"];
};

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: ProfileChanges) => unwrap(api.PATCH("/api/v1/me", { body: changes })),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      unwrap(api.POST("/api/v1/me/password", { body })),
  });
}
