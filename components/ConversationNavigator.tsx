"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useI18n } from "../hooks/useI18n";

export interface ConversationTurnLocation {
  index: number;
  question: string;
  answer: string | null;
}

interface Props {
  turns: ConversationTurnLocation[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
}

function nearestTurnIndex(event: ReactPointerEvent<HTMLDivElement>, count: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)));
  return Math.min(count - 1, Math.round(ratio * (count - 1)));
}

export function ConversationNavigator({ turns, scrollContainerRef, onSelect }: Props) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  // Plus: list of every question, opened from the button above the rail.
  const [listOpen, setListOpen] = useState(false);
  const listTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const openList = useCallback(() => {
    if (listTimerRef.current !== null) window.clearTimeout(listTimerRef.current);
    listTimerRef.current = null;
    setListOpen(true);
  }, []);
  const closeListSoon = useCallback(() => {
    if (listTimerRef.current !== null) window.clearTimeout(listTimerRef.current);
    listTimerRef.current = window.setTimeout(() => {
      listTimerRef.current = null;
      setListOpen(false);
    }, 300);
  }, []);
  useEffect(() => () => { if (listTimerRef.current !== null) window.clearTimeout(listTimerRef.current); }, []);
  const draggingRef = useRef(false);
  // Plus: the preview card sits beside the rail with a gap, so leaving the
  // rail used to unmount the card before the pointer could reach it, and the
  // card could never be clicked (#130 regressed for mouse users). Hide it after
  // a short grace period instead; entering the card cancels the hide.
  const hideTimerRef = useRef<number | null>(null);
  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setIsHovering(false);
      if (!draggingRef.current) setPreviewIndex(null);
    }, 350);
  }, [cancelHide]);
  useEffect(() => cancelHide, [cancelHide]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || turns.length < 2) return;

    const updateActive = () => {
      const containerTop = container.getBoundingClientRect().top;
      const anchors = Array.from(container.querySelectorAll<HTMLElement>("[data-conversation-turn]"));
      if (anchors.length === 0) return;
      let closest = Number(anchors[0].dataset.conversationTurn ?? 0);
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const anchor of anchors) {
        const index = Number(anchor.dataset.conversationTurn);
        const distance = Math.abs(anchor.getBoundingClientRect().top - containerTop - 28);
        if (distance < closestDistance) {
          closest = index;
          closestDistance = distance;
        }
      }
      setActiveIndex(closest);
    };

    updateActive();
    container.addEventListener("scroll", updateActive, { passive: true });
    const observer = new ResizeObserver(updateActive);
    observer.observe(container);
    return () => {
      container.removeEventListener("scroll", updateActive);
      observer.disconnect();
    };
  }, [scrollContainerRef, turns.length]);

  const selectFromPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (turns.length === 0) return;
    const index = nearestTurnIndex(event, turns.length);
    setPreviewIndex(index);
    setActiveIndex(index);
    onSelect(index);
  }, [onSelect, turns.length]);

  // Keep the current question in view when the list opens.
  useEffect(() => {
    if (!listOpen) return;
    listRef.current?.querySelector<HTMLElement>(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [listOpen]);

  const preview = previewIndex == null ? null : turns[previewIndex];
  const navigatorHeight = turns.length * 2 + (turns.length - 1) * 8;
  const tickPositions = useMemo(() => turns.map((turn, index) => ({
    ...turn,
    top: 1 + index * 10,
  })), [turns]);

  if (turns.length < 2) return null;

  return (
    <div
      className={`conversation-navigator${isHovering ? " is-hovering" : ""}`}
      style={{ height: navigatorHeight }}
      onPointerEnter={() => {
        cancelHide();
        setIsHovering(true);
      }}
      onPointerLeave={scheduleHide}
    >
      <button
        type="button"
        className={`conversation-navigator-list-button${listOpen ? " is-open" : ""}`}
        title={t("chat.conversationNavigatorList")}
        aria-label={t("chat.conversationNavigatorList")}
        aria-expanded={listOpen}
        onPointerEnter={openList}
        onPointerLeave={closeListSoon}
        onClick={() => setListOpen((open) => !open)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></svg>
      </button>
      {listOpen && (
        <div
          ref={listRef}
          className="conversation-navigator-list"
          role="menu"
          aria-label={t("chat.conversationNavigatorList")}
          onPointerEnter={openList}
          onPointerLeave={closeListSoon}
        >
          {turns.map((turn, index) => (
            <button
              key={turn.index}
              type="button"
              role="menuitem"
              className={`conversation-navigator-list-item${turn.index === activeIndex ? " is-active" : ""}`}
              title={turn.question}
              onClick={() => {
                setActiveIndex(index);
                onSelect(index);
                setListOpen(false);
              }}
            >
              <span className="conversation-navigator-list-number">{index + 1}</span>
              <span className="conversation-navigator-list-text">{turn.question}</span>
            </button>
          ))}
        </div>
      )}
      {preview && !listOpen && (
        // Clicking the card jumps to its turn, like clicking the tick beside it.
        // It is not a tab stop: the track's arrow keys already move between turns.
        <button
          type="button"
          className="conversation-navigator-preview"
          tabIndex={-1}
          title={t("chat.conversationNavigatorJump")}
          onPointerEnter={cancelHide}
          onClick={() => {
            if (previewIndex == null) return;
            setActiveIndex(previewIndex);
            onSelect(previewIndex);
            cancelHide();
            setIsHovering(false);
            setPreviewIndex(null);
          }}
        >
          <span className="conversation-navigator-question">{preview.question}</span>
          <span className="conversation-navigator-answer">
            {preview.answer || "…"}
          </span>
        </button>
      )}
      <div
        className="conversation-navigator-track"
        role="slider"
        aria-label={t("chat.conversationNavigator")}
        aria-valuemin={1}
        aria-valuemax={turns.length}
        aria-valuenow={activeIndex + 1}
        tabIndex={0}
        onBlur={() => { if (!draggingRef.current) setPreviewIndex(null); }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const next = Math.max(0, Math.min(turns.length - 1, activeIndex + (event.key === "ArrowUp" ? -1 : 1)));
          setActiveIndex(next);
          setPreviewIndex(next);
          onSelect(next);
        }}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          selectFromPointer(event);
        }}
        onPointerMove={(event) => {
          const index = nearestTurnIndex(event, turns.length);
          setPreviewIndex(index);
          if (draggingRef.current && index !== activeIndex) {
            setActiveIndex(index);
            onSelect(index);
          }
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { draggingRef.current = false; }}
      >
        {tickPositions.map((turn, index) => {
          const previewDistance = previewIndex == null ? null : Math.abs(index - previewIndex);
          return (
            <span
              key={turn.index}
              className={`conversation-navigator-tick${previewDistance === 1 ? " is-near-preview-1" : ""}${previewDistance === 2 ? " is-near-preview-2" : ""}${index === previewIndex ? " is-preview" : ""}${turn.index === activeIndex ? " is-active" : ""}`}
              style={{ top: turn.top }}
            />
          );
        })}
      </div>
    </div>
  );
}
