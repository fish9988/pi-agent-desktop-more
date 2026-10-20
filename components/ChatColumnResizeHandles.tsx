"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useChatAppearance } from "../hooks/useChatAppearance";
import { useI18n } from "../hooks/useI18n";

interface Props {
  /** The centred chat column whose max width is being resized. */
  columnRef: RefObject<HTMLDivElement | null>;
}

/**
 * Drag handles on both edges of the chat column (Plus).
 *
 * The column is centred, so dragging either edge changes the width
 * symmetrically: the new width is twice the pointer's distance from the
 * column's centre. In percent mode the width is stored as a share of the
 * space the column can occupy; in px mode as a fixed maximum. Double-click
 * resets the active unit to its default.
 */
export function ChatColumnResizeHandles({ columnRef }: Props) {
  const { t } = useI18n();
  const { widthUnit, setWidth, setWidthPercent, resetWidth } = useChatAppearance();
  const dragRef = useRef<{ center: number; available: number } | null>(null);

  const measure = useCallback(() => {
    const column = columnRef.current;
    const parent = column?.parentElement;
    if (!column || !parent) return null;
    const rect = column.getBoundingClientRect();
    const style = window.getComputedStyle(parent);
    const available = parent.clientWidth
      - (Number.parseFloat(style.paddingLeft) || 0)
      - (Number.parseFloat(style.paddingRight) || 0);
    return { center: rect.left + rect.width / 2, available: Math.max(1, available) };
  }, [columnRef]);

  const applyPointer = useCallback((clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = Math.min(drag.available, Math.abs(clientX - drag.center) * 2);
    if (widthUnit === "percent") setWidthPercent((width / drag.available) * 100);
    else setWidth(width);
  }, [setWidth, setWidthPercent, widthUnit]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const measured = measure();
    if (!measured) return;
    event.preventDefault();
    dragRef.current = measured;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("is-resizing-chat-column");
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.documentElement.classList.remove("is-resizing-chat-column");
  };

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": t("chat.resizeColumn"),
    title: t("chat.resizeColumn"),
    onPointerDown,
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => applyPointer(event.clientX),
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: () => resetWidth(),
  };

  return (
    <>
      <div className="chat-column-resize-handle is-left" {...handleProps} />
      <div className="chat-column-resize-handle is-right" {...handleProps} />
    </>
  );
}
