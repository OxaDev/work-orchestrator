import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components } from "../../api/schema";

export type UserCreate = components["schemas"]["UserCreate"];
export type UserUpdate = components["schemas"]["UserUpdate"];

const USERS_KEY = ["users"] as const;

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: () => unwrap(api.GET("/api/v1/users", { params: { query: { limit: 200 } } })),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreate) => unwrap(api.POST("/api/v1/users", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: UserUpdate }) =>
      unwrap(
        api.PATCH("/api/v1/users/{user_id}", { params: { path: { user_id: id } }, body: changes }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      unwrap(
        api.POST("/api/v1/users/{user_id}/reset-password", {
          params: { path: { user_id: id } },
          body: { new_password: password },
        }),
      ),
  });
}
