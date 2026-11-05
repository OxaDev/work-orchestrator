import { useCallback, useEffect, useRef, useState } from "react";

import type { Slot } from "./api";
import { keyToSlot, slotKey, slotRange } from "./calendar";

/**
 * Half-day selection for the month view (P4-9): click toggles, shift-click selects a range
 * from the last clicked half-day, dragging paints the selection (adds or removes).
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<Slot | null>(null);
  const drag = useRef<"add" | "remove" | null>(null);

  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const apply = useCallback((slots: Slot[], mode: "add" | "remove") => {
    setSelected((current) => {
      const next = new Set(current);
      for (const slot of slots) {
        if (mode === "add") next.add(slotKey(slot));
        else next.delete(slotKey(slot));
      }
      return next;
    });
  }, []);

  const press = useCallback(
    (slot: Slot, shift: boolean) => {
      if (shift && anchor.current) {
        apply(slotRange(anchor.current, slot), "add");
        return;
      }
      const mode = selected.has(slotKey(slot)) ? "remove" : "add";
      apply([slot], mode);
      anchor.current = slot;
      return mode;
    },
    [apply, selected],
  );

  return {
    selected,
    slots: [...selected].sort().map(keyToSlot),
    isSelected: (slot: Slot) => selected.has(slotKey(slot)),
    /** Mouse down on a half-day: toggles (or extends with shift) and starts a drag. */
    pointerDown: (slot: Slot, shift: boolean) => {
      const mode = press(slot, shift);
      drag.current = mode ?? null;
    },
    pointerEnter: (slot: Slot) => {
      if (drag.current) apply([slot], drag.current);
    },
    keyboard: (slot: Slot, shift: boolean) => {
      press(slot, shift);
    },
    /** Selects (or unselects) both halves of a day. */
    toggleDay: (slots: Slot[]) => {
      const allSelected = slots.every((s) => selected.has(slotKey(s)));
      apply(slots, allSelected ? "remove" : "add");
      anchor.current = slots[slots.length - 1] ?? null;
    },
    clear: () => {
      setSelected(new Set());
      anchor.current = null;
    },
  };
}
