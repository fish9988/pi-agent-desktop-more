"use client";

import { useCallback, useEffect, useRef } from "react";
import { CRAB_FRAME_MS, CRAB_GUTTER, CRAB_SHEETS, CRAB_SHEET_URLS } from "@/lib/crab-sheets";

type PlayMode = "loop" | "once";

interface MascotPick {
  key: string;
  mode: PlayMode;
  priority: number;
}

const MIN_SHOW_MS = 1000;
const SLEEP_AFTER_MS = 60000;
const EXTRA_MIN_MS = 18000;
const EXTRA_SPAN_MS = 18000;
const TICKLE_GAP_MS = 450;
const TICKLE_CLICKS = 4;
const LIFT_PX = 4;
const REACTION_PRIORITY = 10;
const EXTRAS = ["idle-look", "idle-wave", "idle-laptop"] as const;

export interface ComposerMascotProps {
  isStreaming?: boolean;
  isCompacting?: boolean;
  hasError?: boolean;
  hasSubagentsRunning?: boolean;
}

function isReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cellSize(key: string): [number, number] {
  const sheet = CRAB_SHEETS[key] ?? CRAB_SHEETS.idle;
  return [sheet.box[2] + CRAB_GUTTER * 2, sheet.box[3] + CRAB_GUTTER * 2];
}

function frameOffset(key: string, frame: number): string {
  const [cellWidth, cellHeight] = cellSize(key);
  return `translate(${-((frame % 8) * cellWidth + CRAB_GUTTER) * 2}px, ${-(Math.floor(frame / 8) * cellHeight + CRAB_GUTTER) * 2}px)`;
}

export function ComposerMascot({
  isStreaming = false,
  isCompacting = false,
  hasError = false,
  hasSubagentsRunning = false,
}: ComposerMascotProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const stripRef = useRef<HTMLSpanElement | null>(null);

  const stageRef = useRef<{
    level: MascotPick;
    moment: (MascotPick & { until: number }) | null;
    reaction: { key: string; mode: PlayMode; fresh: boolean } | null;
    extra: string | null;
    waking: boolean;
    asleep: boolean;
    quietSince: number;
    nextExtraAt: number;
    current: (MascotPick & { start: number; done?: boolean }) | null;
    animation: Animation | null;
    timer: ReturnType<typeof setTimeout> | null;
    clicks: number[];
    press: { id: number; x: number; y: number; lifted: boolean } | null;
  }>({
    level: { key: "idle", mode: "loop", priority: 1 },
    moment: null,
    reaction: null,
    extra: null,
    waking: false,
    asleep: false,
    quietSince: 0,
    nextExtraAt: 0,
    current: null,
    animation: null,
    timer: null,
    clicks: [],
    press: null,
  });

  const prevStreamingRef = useRef(isStreaming);
  const prevErrorRef = useRef(hasError);

  const stepRef = useRef<() => void>(() => {});

  const finishOnce = useCallback((key: string, now: number) => {
    const s = stageRef.current;
    if (s.reaction !== null && s.reaction.key === key && !s.reaction.fresh) {
      s.reaction = null;
    }
    if (s.extra === key) {
      s.extra = null;
      s.nextExtraAt = now + EXTRA_MIN_MS + Math.random() * EXTRA_SPAN_MS;
    }
    if (key === "waking") {
      s.waking = false;
    }
  }, []);

  const playStrip = useCallback((strip: HTMLElement, key: string, mode: PlayMode) => {
    const s = stageRef.current;
    if (s.animation !== null) {
      s.animation.cancel();
      s.animation = null;
    }
    const sheet = CRAB_SHEETS[key] ?? CRAB_SHEETS.idle;
    const still = isReducedMotion() && s.reaction === null;
    if (still || typeof strip.animate !== "function") {
      strip.style.transform = frameOffset(key, sheet.still);
      return;
    }
    strip.style.transform = "";
    const keyframes: Keyframe[] = [];
    for (let frame = 0; frame < sheet.frames; frame += 1) {
      keyframes.push({
        offset: frame / sheet.frames,
        transform: frameOffset(key, frame),
        easing: "steps(1)",
      });
    }
    keyframes.push({
      offset: 1,
      transform: frameOffset(key, mode === "loop" ? 0 : sheet.frames - 1),
    });
    const anim = strip.animate(keyframes, {
      duration: sheet.frames * CRAB_FRAME_MS,
      iterations: mode === "loop" ? Infinity : 1,
      fill: "forwards",
    });
    s.animation = anim;
    if (mode !== "once") return;
    anim.finished.then(
      () => {
        if (s.animation !== anim || s.current === null || s.current.key !== key || s.current.done) return;
        s.current.done = true;
        finishOnce(key, Date.now());
        stepRef.current();
      },
      () => {},
    );
  }, [finishOnce]);

  const showPick = useCallback((root: HTMLElement, strip: HTMLElement, next: MascotPick, now: number) => {
    const s = stageRef.current;
    const sheet = CRAB_SHEETS[next.key] ?? CRAB_SHEETS.idle;
    const urls = CRAB_SHEET_URLS[next.key] ?? CRAB_SHEET_URLS.idle;
    const [cellWidth, cellHeight] = cellSize(next.key);
    s.current = { key: next.key, mode: next.mode, priority: next.priority, start: now };
    if (s.reaction !== null && s.reaction.key === next.key) {
      s.reaction.fresh = false;
    }
    const style = root.style;
    style.setProperty("--plus-crab-sheet", `url("${urls.body}")`);
    style.setProperty("--plus-crab-ink", `url("${urls.ink}")`);
    style.setProperty("--plus-crab-x", String(sheet.box[0]));
    style.setProperty("--plus-crab-y", String(sheet.box[1]));
    style.setProperty("--plus-crab-w", String(sheet.box[2]));
    style.setProperty("--plus-crab-h", String(sheet.box[3]));
    style.setProperty("--plus-crab-cell-w", String(cellWidth));
    style.setProperty("--plus-crab-strip-h", String(cellHeight * Math.ceil(sheet.frames / 8)));
    root.setAttribute("data-animation", next.key);
    root.setAttribute("data-ready", "");
    playStrip(strip, next.key, next.mode);
  }, [playStrip]);

  const step = useCallback(() => {
    const root = rootRef.current;
    const strip = stripRef.current;
    if (!root || !strip) return;
    const s = stageRef.current;
    const now = Date.now();
    if (s.quietSince === 0) s.quietSince = now;

    if (s.current !== null && s.current.mode === "once" && !s.current.done) {
      const dur = (CRAB_SHEETS[s.current.key]?.frames ?? 24) * CRAB_FRAME_MS;
      if (now - s.current.start >= dur) {
        s.current.done = true;
        finishOnce(s.current.key, now);
      }
    }

    if (s.moment !== null && now >= s.moment.until) {
      s.moment = null;
    }

    let next: MascotPick;
    if (s.reaction !== null) {
      next = { key: s.reaction.key, mode: s.reaction.mode, priority: REACTION_PRIORITY };
    } else {
      const held = s.moment;
      const pick = held !== null && held.priority >= s.level.priority ? held : s.level;
      if (pick.key !== "idle") {
        s.asleep = false;
        s.waking = false;
        s.extra = null;
        s.nextExtraAt = 0;
        s.quietSince = now;
        next = pick;
      } else {
        if (!s.asleep && now - s.quietSince >= SLEEP_AFTER_MS) {
          s.asleep = true;
          s.extra = null;
        }
        if (s.asleep) {
          next = { key: "sleeping", mode: "loop", priority: 1 };
        } else if (s.waking) {
          next = { key: "waking", mode: "once", priority: 1 };
        } else {
          const extrasAllowed = !isReducedMotion() && (typeof document === "undefined" || !document.hidden);
          if (s.extra === null && extrasAllowed) {
            if (s.nextExtraAt === 0) {
              s.nextExtraAt = now + EXTRA_MIN_MS + Math.random() * EXTRA_SPAN_MS;
            } else if (now >= s.nextExtraAt) {
              s.extra = EXTRAS[Math.floor(Math.random() * EXTRAS.length)];
            }
          }
          next = s.extra !== null
            ? { key: s.extra, mode: "once", priority: 1 }
            : { key: "idle", mode: "loop", priority: 1 };
        }
      }
    }

    const switching = s.current === null || next.key !== s.current.key || Boolean(s.reaction?.fresh);
    const settled = s.current === null
      || s.current.mode !== "loop"
      || s.current.priority === REACTION_PRIORITY
      || next.priority > s.current.priority
      || now - s.current.start >= MIN_SHOW_MS;

    if (switching && settled) {
      showPick(root, strip, next, now);
    }

    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;

    let wakeAt = Infinity;
    if (s.moment !== null) wakeAt = Math.min(wakeAt, s.moment.until);
    if (switching && !settled && s.current !== null) wakeAt = Math.min(wakeAt, s.current.start + MIN_SHOW_MS);
    if (s.current !== null && s.current.mode === "once" && !s.current.done) {
      const dur = (CRAB_SHEETS[s.current.key]?.frames ?? 24) * CRAB_FRAME_MS;
      wakeAt = Math.min(wakeAt, s.current.start + dur);
    }
    if (!s.asleep && s.level.key === "idle") {
      wakeAt = Math.min(wakeAt, s.quietSince + SLEEP_AFTER_MS);
    }
    if (s.extra === null && s.nextExtraAt > now) {
      wakeAt = Math.min(wakeAt, s.nextExtraAt);
    }
    if (wakeAt < Infinity) {
      s.timer = setTimeout(() => {
        s.timer = null;
        stepRef.current();
      }, Math.max(16, wakeAt - now));
    }
  }, [finishOnce, showPick]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    const s = stageRef.current;
    const now = Date.now();

    if (hasError && !prevErrorRef.current) {
      s.moment = { key: "error", mode: "loop", priority: 8, until: now + 4800 };
    }
    prevErrorRef.current = hasError;

    if (!isStreaming && prevStreamingRef.current && !hasError) {
      s.moment = { key: "happy", mode: "loop", priority: 5, until: now + 4200 };
    }
    prevStreamingRef.current = isStreaming;

    if (isCompacting) {
      s.level = { key: "compacting", mode: "loop", priority: 7 };
    } else if (hasSubagentsRunning) {
      s.level = { key: "conducting", mode: "loop", priority: 6 };
    } else if (isStreaming) {
      s.level = { key: "thinking", mode: "loop", priority: 4 };
    } else {
      s.level = { key: "idle", mode: "loop", priority: 1 };
    }

    step();
  }, [hasError, hasSubagentsRunning, isCompacting, isStreaming, step]);

  useEffect(() => {
    const s = stageRef.current;
    step();
    const onUserActivity = () => {
      s.quietSince = Date.now();
      if (!s.asleep) return;
      s.asleep = false;
      s.waking = !isReducedMotion();
      stepRef.current();
    };
    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
      if (s.timer !== null) clearTimeout(s.timer);
      if (s.animation !== null) s.animation.cancel();
    };
  }, [step]);

  const react = useCallback((key: string, mode: PlayMode) => {
    stageRef.current.reaction = { key, mode, fresh: true };
    stepRef.current();
  }, []);

  return (
    <span ref={rootRef} className="plus-composer-crab" aria-hidden="true">
      <span className="plus-composer-crab-sprite">
        <span ref={stripRef} className="plus-composer-crab-strip" />
      </span>
      <span
        className="plus-composer-crab-hit"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          stageRef.current.press = { id: e.pointerId, x: e.clientX, y: e.clientY, lifted: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = stageRef.current.press;
          if (!p || p.lifted || e.pointerId !== p.id) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < LIFT_PX) return;
          p.lifted = true;
          stageRef.current.clicks = [];
          react("drag", "loop");
        }}
        onPointerUp={(e) => {
          const s = stageRef.current;
          const p = s.press;
          if (!p || e.pointerId !== p.id) return;
          const lifted = p.lifted;
          s.press = null;
          if (lifted) {
            s.reaction = null;
            stepRef.current();
            return;
          }
          const now = Date.now();
          if (s.clicks.length > 0 && now - s.clicks[s.clicks.length - 1] > TICKLE_GAP_MS) {
            s.clicks = [];
          }
          s.clicks.push(now);
          if (s.clicks.length >= TICKLE_CLICKS) {
            s.clicks = [];
            react("tickle", "once");
            return;
          }
          if (s.clicks.length === 2) {
            react("idle-laptop", "once");
            return;
          }
          const box = e.currentTarget.getBoundingClientRect();
          react(e.clientX - box.left < box.width / 2 ? "poke-left" : "poke-right", "once");
        }}
        onPointerCancel={(e) => {
          const s = stageRef.current;
          if (!s.press || e.pointerId !== s.press.id) return;
          const lifted = s.press.lifted;
          s.press = null;
          if (lifted) {
            s.reaction = null;
            stepRef.current();
          }
        }}
      />
    </span>
  );
}
