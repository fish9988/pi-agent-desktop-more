/**
 * Plus design scale: the only font sizes, radii, spacing steps and motion
 * durations new interface code should use.
 *
 * The same values are CSS variables in app/plus-theme.css (`--plus-fs-*`,
 * `--plus-r-*`, `--plus-s*`, `--plus-dur-*`); prefer those in CSS and use
 * `scaleVar()` for inline styles so a theme or a later retune moves every
 * element at once. lib/plus-design-scale.test.mjs keeps the two in step and
 * stops the number of off-scale literals from growing.
 *
 * Origin: the redesign mockup in .design/ui-demo (Fluent 2 shell, reading
 * first body). The audit before it counted 29 font sizes and 53 radii.
 */

/** 12 meta · 13 UI default · 14 emphasis · 16 reading/section · 20 page title. */
export const FONT_SIZES = { 1: 12, 2: 13, 3: 14, 4: 16, 5: 20 } as const;

/** Controls (buttons, inputs, chips), cards, overlays (menus, dialogs, panels). */
export const RADII = { ctl: 4, card: 8, overlay: 12 } as const;

/** Multiples of 4. */
export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 } as const;

/** Hover and press feedback · panels and expanding content. */
export const DURATIONS = { 1: 120, 2: 200 } as const;

export type FontStep = keyof typeof FONT_SIZES;
export type RadiusStep = keyof typeof RADII;
export type SpaceStep = keyof typeof SPACING;

/** Pixel values that are on the scale (also accepted: full pill radii). */
export const SCALE_FONT_PX: ReadonlySet<number> = new Set(Object.values(FONT_SIZES));
export const SCALE_RADIUS_PX: ReadonlySet<number> = new Set(Object.values(RADII));

/** CSS variable for a step, for inline styles: `fontSize: scaleVar("fs", 2)`. */
export function scaleVar(kind: "fs", step: FontStep): string;
export function scaleVar(kind: "r", step: RadiusStep): string;
export function scaleVar(kind: "s", step: SpaceStep): string;
export function scaleVar(kind: "fs" | "r" | "s", step: FontStep | RadiusStep | SpaceStep): string {
  if (kind === "fs") return `var(--plus-fs-${step}, ${FONT_SIZES[step as FontStep]}px)`;
  if (kind === "r") return `var(--plus-r-${step}, ${RADII[step as RadiusStep]}px)`;
  return `var(--plus-s${step}, ${SPACING[step as SpaceStep]}px)`;
}
