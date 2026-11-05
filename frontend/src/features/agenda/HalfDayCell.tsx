import { UnstyledButton } from "@mantine/core";
import type { KeyboardEvent, PointerEvent } from "react";

import type { HalfDay } from "./api";
import { halfDayBackground } from "./kinds";

interface HalfDayCellProps {
  halfDay: HalfDay | undefined;
  missionColor?: string;
  label: string;
  /** Short text drawn inside solid cells (mission name). */
  text?: string;
  selected: boolean;
  disabled?: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerEnter: () => void;
  onKeyboardSelect: (shift: boolean) => void;
}

/** One half-day (P4-7): coloured (and patterned) by kind, selectable by mouse or keyboard. */
export function HalfDayCell({
  halfDay,
  missionColor,
  label,
  text,
  selected,
  disabled,
  onPointerDown,
  onPointerEnter,
  onKeyboardSelect,
}: HalfDayCellProps) {
  const solid = halfDay?.kind === "MISSION" || halfDay?.kind === "INTERCONTRACT";
  return (
    <UnstyledButton
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        onPointerDown(event);
      }}
      onPointerEnter={onPointerEnter}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onKeyboardSelect(event.shiftKey);
        }
      }}
      style={{
        display: "block",
        width: "100%",
        height: 22,
        borderRadius: 4,
        padding: "0 4px",
        fontSize: 11,
        lineHeight: "22px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        color: solid ? "white" : undefined,
        background: halfDay ? halfDayBackground(halfDay.kind, missionColor) : "transparent",
        border: halfDay
          ? "1px solid transparent"
          : "1px dashed var(--mantine-color-default-border)",
        outline: selected ? "2px solid var(--mantine-color-blue-filled)" : undefined,
        outlineOffset: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "none",
      }}
    >
      {solid ? text : null}
    </UnstyledButton>
  );
}
