import { useSearchParams } from "react-router";

/**
 * `?new=1` asks a list page to open its creation form (the `Ctrl+K` palette links there).
 * Returns whether it is requested and a function that drops it once the form closes.
 */
export function useCreateParam(): [boolean, () => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("new") === "1";
  const clear = () => {
    if (!requested) return;
    setParams(
      (current) => {
        current.delete("new");
        return current;
      },
      { replace: true },
    );
  };
  return [requested, clear];
}
