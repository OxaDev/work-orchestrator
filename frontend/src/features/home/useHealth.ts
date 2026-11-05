import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";

export function useHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: () => unwrap(api.GET("/api/v1/health")),
    retry: false,
  });
}
