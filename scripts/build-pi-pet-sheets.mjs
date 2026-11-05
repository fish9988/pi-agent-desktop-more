#!/usr/bin/env node
/**
 * Plus: paint the composer "Pi" pet sprite sheets into lib/pi-pet-sheets.ts.
 *
 * The pet (a friendly little creature built around the pi glyph: a horizontal
 * top bar with a tuft, two legs and big eyes) is authored once as a parametric
 * pixel painter (`drawPet`); every animation is a list of per-frame parameter
 * sets. Nothing is random, so re-running the script regenerates the exact same
 * art and lib/pi-pet-sheets.ts is a pure build artifact.
 *
 *   node scripts/build-pi-pet-sheets.mjs
 *   node scripts/build-pi-pet-sheets.mjs --contact C:/tmp/pi-pet-contact [--scale 4]
 *
 * --contact <dir> additionally writes pi-pet-sheet-<anim>.png previews (every
 * frame at 4x on a cream background, with the ink mask composited), which is how
 * the art is reviewed by eye.
 *
 * Sheet format (matches the mascot CSS in app/plus-theme.css): 8 columns, each
 * cell is (box.w + 2 * gutter) x (box.h + 2 * gutter) px with a 1px gutter,
 * frames ordered row-major; only the `box` sub-rectangle of a cell is shown.
 * `body` is the coloured art, `ink` is an alpha mask that the CSS tints with
 * --text-dim (soft outline plus neutral props: thought dots, Zs, notes, ...).
 *
 * No new dependencies: PNGs are encoded with node:zlib.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 8;
const FRAME_MS = 80;
const GUTTER = 1;
/** Virtual canvas in sprite pixels; the CSS box is 52x36 sprite px (104x72 @2x). */
const CANVAS_W = 52;
const CANVAS_H = 36;

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));

const C = {
  accent: hex("#d97757"), // terracotta body
  deep: hex("#b3563a"), // shaded underside
  soft: hex("#eba287"), // highlight / blush
  cream: hex("#f5efe6"),
  ink: hex("#2f2a26"),
};

// ---------------------------------------------------------------------------
// pixels
// ---------------------------------------------------------------------------

const CORNERS = {
  1: ["01", "11"],
  2: ["001", "011", "111"],
};

function createFrame() {
  return {
    rgba: new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4),
    ink: new Uint8Array(CANVAS_W * CANVAS_H),
    skin: new Uint8Array(CANVAS_W * CANVAS_H),
  };
}

function paint(layer, x, y, color, skin = false) {
  if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) {
    throw new Error(`pixel out of canvas: ${x},${y}`);
  }
  const i = y * CANVAS_W + x;
  layer.rgba[i * 4] = color[0];
  layer.rgba[i * 4 + 1] = color[1];
  layer.rgba[i * 4 + 2] = color[2];
  layer.rgba[i * 4 + 3] = 255;
  if (skin) layer.skin[i] = 1;
}

function inked(layer, x, y, alpha) {
  if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) {
    throw new Error(`ink out of canvas: ${x},${y}`);
  }
  const i = y * CANVAS_W + x;
  layer.ink[i] = Math.max(layer.ink[i], Math.min(255, alpha));
}

function rect(layer, x, y, w, h, color, skin = false) {
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) paint(layer, x + dx, y + dy, color, skin);
}

function inkRect(layer, x, y, w, h, alpha) {
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) inked(layer, x + dx, y + dy, alpha);
}

function roundRect(layer, x, y, w, h, r, color, skin = false) {
  const tpl = CORNERS[r];
  const n = tpl.length;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const ex = Math.min(dx, w - 1 - dx);
      const ey = Math.min(dy, h - 1 - dy);
      if (ex < n && ey < n && tpl[ey][ex] === "0") continue;
      paint(layer, x + dx, y + dy, color, skin);
    }
  }
}

/** Centres a small pixel-glyph (row strings, "1" = on) inside a w x h box. */
function glyph(layer, x, y, w, h, rows, color, skin = false) {
  const gw = rows[0].length;
  const ox = x + Math.floor((w - gw) / 2);
  const oy = y + Math.round((h - rows.length) / 2);
  for (let gy = 0; gy < rows.length; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (rows[gy][gx] === "1") paint(layer, ox + gx, oy + gy, color, skin);
    }
  }
}

/** Centres a small pixel-glyph in a w x h box, in the ink (text-dim) mask. */
function inkGlyph(layer, x, y, w, h, rows, alpha) {
  const gw = rows[0].length;
  const ox = x + Math.floor((w - gw) / 2);
  const oy = y + Math.floor((h - rows.length) / 2);
  for (let gy = 0; gy < rows.length; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (rows[gy][gx] === "1") inked(layer, ox + gx, oy + gy, alpha);
    }
  }
}

/**
 * Soft outline: every skin pixel that touches the transparent background is
 * darkened through the ink mask (stronger on the underside). Props are not skin,
 * so nothing is darkened where the pet is occluded by e.g. a laptop.
 */
function outline(layer) {
  for (let y = 0; y < CANVAS_H; y += 1) {
    for (let x = 0; x < CANVAS_W; x += 1) {
      const i = y * CANVAS_W + x;
      if (!layer.skin[i]) continue;
      const open = (nx, ny) => nx < 0 || ny < 0 || nx >= CANVAS_W || ny >= CANVAS_H || layer.rgba[(ny * CANVAS_W + nx) * 4 + 3] === 0;
      if (open(x, y + 1)) inked(layer, x, y, 118);
      else if (open(x, y - 1)) inked(layer, x, y, 52);
      else if (open(x - 1, y) || open(x + 1, y)) inked(layer, x, y, 82);
    }
  }
}

// ---------------------------------------------------------------------------
// the pet
// ---------------------------------------------------------------------------

const PET = {
  /** canvas x of the bar's left edge at rest */
  x: 25,
  barW: 20,
  barH: 10,
  legW: 4,
  legLen: 9,
  legInset: 3,
  /** feet rest on this row (exclusive) */
  ground: 33,
};

const POSE = {
  /** whole-body offset */
  dx: 0,
  dy: 0,
  /** head-only lean: the bar, tuft, eyes and mouth move while the legs stay */
  barDx: 0,
  barW: PET.barW,
  barH: PET.barH,
  legLen: PET.legLen,
  legSpread: 0,
  liftL: 0,
  liftR: 0,
  eyes: "open",
  eyeDx: 0,
  eyeDy: 0,
  mouth: "none",
  tongue: false,
  blush: false,
  /** tuft lean, -1..1 */
  tuft: 0,
  armL: "rest",
  armR: "rest",
  /** front paws reaching down to a keyboard: none | both | left | right */
  hands: "none",
  /** ground-shadow alpha (0 = airborne / hidden) */
  shadow: 0,
  shadowW: 9,
};

const EYES = {
  open: ["0110", "1111", "1111", "1111", "0110"],
  wide: ["1111", "1111", "1111", "1111", "0110"],
  blink: ["1111"],
  closed: ["1001", "0110"],
  joy: ["0110", "1001"],
  sleepy: ["1111", "1111", "0110"],
  x: ["1001", "0110", "0110", "1001"],
};
const EYE_W = 4;
const EYE_H = 5;

const MOUTHS = {
  none: [],
  smile: ["1001", "0110"],
  smirk: ["0001", "0110"],
  grin: ["0110", "1111", "1111"],
  o: ["0110", "0110"],
  flat: ["1111"],
  frown: ["0110", "1001"],
  wobble: ["1100", "0011"],
  yawn: ["0110", "1111", "0110"],};

// Left-arm shapes: [dx from bar left (outward is negative), dy from bar top, w,
// h]. The first rect is the shoulder (it touches the bar); the arm itself sits
// one pixel away so the outline separates it from the body. Mirrored on the
// right.
const ARMS = {
  rest: [[-2, 6, 2, 1], [-3, 6, 2, 4]],
  out: [[-2, 6, 2, 1], [-4, 6, 2, 3]],
  up: [[-2, 4, 2, 1], [-3, -1, 2, 5]],
  waveA: [[-2, 4, 2, 1], [-3, -1, 2, 5]],
  waveB: [[-2, 4, 2, 1], [-4, 1, 2, 4]],
};

function drawLeg(layer, x, top, bottom, lift) {
  const b = bottom - lift;
  if (b - top < 2) return;
  rect(layer, x, top, PET.legW, b - top - 2, C.accent, true);
  rect(layer, x - 1, b - 2, PET.legW + 2, 1, C.accent, true);
  rect(layer, x, b - 1, PET.legW, 1, C.deep, true);
}

function drawArm(layer, side, pose, bx, barTop, barW) {
  const shape = ARMS[pose];
  if (!shape) throw new Error(`unknown arm pose: ${pose}`);
  for (const [dx, dy, w, h] of shape) {
    const x = side === "L" ? bx + dx : bx + barW - dx - w;
    rect(layer, x, barTop + dy, w, h, C.accent, true);
  }
}

function drawEye(layer, x, y, style, glint) {
  const rows = EYES[style];
  if (!rows) throw new Error(`unknown eye style: ${style}`);
  glyph(layer, x, y, EYE_W, EYE_H, rows, C.ink);
  if (!glint) return;
  if (style === "open" || style === "wide" || style === "sleepy") paint(layer, x + 1, y + 1, C.cream);
}

function mouthRows(style) {
  const rows = MOUTHS[style];
  if (!rows) throw new Error(`unknown mouth: ${style}`);
  return rows.length;
}

function drawMouth(layer, x, y, style, tongue) {
  const rows = MOUTHS[style];
  if (rows.length === 0) return;
  for (let gy = 0; gy < rows.length; gy += 1) {
    for (let gx = 0; gx < rows[gy].length; gx += 1) {
      if (rows[gy][gx] === "1") paint(layer, x + gx, y + gy, C.ink);
    }
  }
  if (tongue) {
    const top = y + rows.length - 1;
    for (let gx = 1; gx < 3; gx += 1) paint(layer, x + gx, top, C.soft);
  }
}

function drawTuft(layer, bx, barTop, lean, barW) {
  const c = bx + Math.floor(barW / 2);
  rect(layer, c - 1, barTop - 1, 2, 1, C.accent, true);
  rect(layer, c + lean, barTop - 2, 2, 1, C.accent, true);
  if (lean !== 0) paint(layer, c + lean + 1, barTop - 3, C.accent, true);
}

function drawShadow(layer, cx, alpha, width, dy) {
  const shrink = Math.min(3, Math.max(0, -dy));
  const w = Math.max(2, Math.round(width - shrink * 1.6));
  const c = Math.round(cx);
  inkRect(layer, c - w, PET.ground, 2 * w + 1, 1, Math.round(alpha * 0.85));
  inkRect(layer, c - w + 2, PET.ground + 1, 2 * w - 3, 1, Math.round(alpha * 0.5));
}

function drawPet(layer, input) {
  const p = { ...POSE, ...input };
  const bx = PET.x + p.dx + p.barDx;
  const feetY = PET.ground + p.dy;
  const barTop = feetY - p.legLen - p.barH;
  const barBottom = barTop + p.barH;

  if (p.shadow > 0) drawShadow(layer, PET.x + p.dx + p.barW / 2, p.shadow, p.shadowW, p.dy);

  drawArm(layer, "L", p.armL, bx, barTop, p.barW);
  drawArm(layer, "R", p.armR, bx, barTop, p.barW);

  drawLeg(layer, bx + PET.legInset - p.legSpread, barBottom, feetY, p.liftL);
  drawLeg(layer, bx + p.barW - PET.legInset - PET.legW + p.legSpread, barBottom, feetY, p.liftR);

  roundRect(layer, bx, barTop, p.barW, p.barH, 2, C.accent, true);
  rect(layer, bx + 2, barTop, p.barW - 4, 1, C.soft, true);
  rect(layer, bx + 1, barTop + p.barH - 1, p.barW - 2, 1, C.deep, true);
  drawTuft(layer, bx, barTop, p.tuft, p.barW);

  const eyeY = barTop + 1 + p.eyeDy;
  drawEye(layer, bx + 3 + p.eyeDx, eyeY, p.eyes, true);
  drawEye(layer, bx + p.barW - 3 - EYE_W + p.eyeDx, eyeY, p.eyes, true);

  if (p.blush) {
    rect(layer, bx + 1, barTop + p.barH - 3, 2, 1, C.soft, true);
    rect(layer, bx + p.barW - 3, barTop + p.barH - 3, 2, 1, C.soft, true);
  }

  drawMouth(layer, bx + Math.round((p.barW - 4) / 2), barTop + p.barH - 1 - mouthRows(p.mouth), p.mouth, p.tongue);

  if (p.hands !== "none") {
    const pressL = p.hands === "left" ? 1 : 0;
    const pressR = p.hands === "right" ? 1 : 0;
    rect(layer, bx, barBottom, 2, 4 + pressL, C.accent, true);
    rect(layer, bx + p.barW - 2, barBottom, 2, 4 + pressR, C.accent, true);
  }
}

// ---------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------

function drawNote(layer, x, y, alpha) {
  if (alpha <= 0) return;
  inkRect(layer, x, y + 3, 2, 2, alpha);
  inkRect(layer, x + 3, y + 2, 2, 2, alpha);
  inkRect(layer, x + 1, y, 1, 4, alpha);
  inkRect(layer, x + 4, y, 1, 3, alpha);
  inkRect(layer, x + 1, y, 4, 1, alpha);
}

function drawZ(layer, x, y, alpha) {
  if (alpha <= 0) return;
  inkRect(layer, x, y, 4, 1, alpha);
  inkRect(layer, x + 2, y + 1, 1, 1, alpha);
  inkRect(layer, x + 1, y + 2, 1, 1, alpha);
  inkRect(layer, x, y + 3, 4, 1, alpha);
}

function drawThought(layer, x, y, rows, alpha) {
  inkGlyph(layer, x, y, rows[0].length, rows.length, rows, alpha);
}

function drawSpark(layer, x, y, alpha) {
  inkRect(layer, x, y + 1, 3, 1, alpha);
  inkRect(layer, x + 1, y, 1, 3, alpha);
}

function drawSweat(layer, x, y, alpha) {
  inkRect(layer, x, y, 1, 1, alpha);
  inkRect(layer, x - 1, y + 1, 3, 1, alpha);
  inkRect(layer, x - 1, y + 2, 3, 1, alpha);
  inkRect(layer, x, y + 3, 1, 1, alpha);
}

function drawKeyboard(layer, x, y, w, h, flash) {
  roundRect(layer, x, y, w, h, 1, C.deep);
  rect(layer, x + 2, y, w - 4, 1, C.soft);
  rect(layer, x + 2, y + 1, w - 4, 1, C.cream);
  for (let i = 3; i < w - 3; i += 2) paint(layer, x + i, y + 1, C.deep);
  if (flash >= 0) rect(layer, x + 3 + ((flash * 3) % (w - 8)), y + 1, 2, 1, C.accent);
}

function drawHammer(layer, x, y, swing) {
  // x, y = top-left of the 5x3 head; the handle runs below it ("up") or down to
  // the right at the block ("down").
  roundRect(layer, x, y, 5, 3, 1, C.deep, true);
  rect(layer, x + 1, y, 3, 1, C.soft, true);
  if (swing === "up") {
    rect(layer, x + 2, y + 3, 1, 6, C.ink, true);
    return;
  }
  for (let i = 0; i < 6; i += 1) paint(layer, x + 4 + i, y - i, C.ink, true);
}

function drawBlock(layer, x, y) {
  roundRect(layer, x, y, 8, 3, 1, C.deep);
  rect(layer, x + 1, y + 1, 2, 1, C.soft);
  rect(layer, x + 5, y + 1, 2, 1, C.soft);
}

// ---------------------------------------------------------------------------
// animations: each is a list of per-frame parameter sets
// ---------------------------------------------------------------------------

const anim = (frames, still, draw) => ({ frames, still, draw });

const ANIMATIONS = {
  idle: anim(24, 0, (f, layer) => {
    drawPet(layer, {
      barH: PET.barH + (Math.sin((f / 24) * Math.PI * 2) > 0.15 ? 1 : 0),
      eyes: f >= 14 && f <= 16 ? "blink" : "open",
      eyeDx: f >= 9 && f <= 11 ? 1 : 0,
      mouth: "smile",
      shadow: 76,
    });
  }),

  "idle-look": anim(24, 2, (f, layer) => {
    const look = f < 7 ? -1 : f < 14 ? 1 : 0;
    const lean = f >= 2 && f < 10 ? -1 : f >= 10 && f < 18 ? 1 : 0;
    drawPet(layer, {
      barH: PET.barH + (f % 12 < 6 ? 1 : 0),
      barDx: lean,
      eyeDx: look,
      tuft: look,
      eyes: f >= 19 && f <= 21 ? "blink" : "open",
      mouth: look === 0 ? "smile" : "flat",
      shadow: 76,
    });
  }),

  "idle-wave": anim(16, 6, (f, layer) => {
    const up = f >= 2 && f <= 13;
    const flick = f % 4 < 2 ? "waveA" : "waveB";
    drawPet(layer, {
      barH: PET.barH + (up ? 1 : 0),
      eyes: f >= 4 && f <= 10 ? "joy" : "open",
      mouth: "smile",
      blush: up,
      tuft: up ? (f % 4 < 2 ? 1 : -1) : 0,
      armR: up ? flick : "rest",
      armL: up ? "out" : "rest",
      shadow: 76,
    });
  }),

  "idle-laptop": anim(20, 16, (f, layer) => {
    const typing = f < 13;
    drawPet(layer, {
      barH: PET.barH + (typing && f % 2 === 0 ? 1 : 0),
      eyes: typing ? "open" : f < 16 ? "wide" : "joy",
      eyeDy: typing ? 1 : 0,
      mouth: typing ? "flat" : "smile",
      hands: typing ? (f % 2 === 0 ? "left" : "right") : "none",
      armL: "rest",
      armR: "rest",
      tuft: typing ? 0 : 1,
    });
    drawKeyboard(layer, 22, 28, 24, 5, typing ? f : -1);
  }),

  thinking: anim(20, 8, (f, layer) => {
    drawPet(layer, {
      barH: PET.barH + (f % 10 < 5 ? 1 : 0),
      eyes: f >= 15 && f <= 16 ? "blink" : "open",
      eyeDy: -1,
      mouth: "flat",
      tuft: 1,
      shadow: 76,
    });
    const dots = [
      [38, 10, ["11", "11"]],
      [42, 6, ["0110", "1111", "1111", "0110"]],
      [46, 1, ["01110", "11111", "11111", "11111", "01110"]],
    ];
    dots.forEach(([x, y, rows], i) => {
      const phase = (f + i * 3) % 12;
      drawThought(layer, x, y, rows, phase < 7 ? 255 : 140);
    });
  }),

  typing: anim(12, 0, (f, layer) => {
    drawPet(layer, {
      barH: PET.barH + (f % 4 === 0 ? 1 : 0),
      eyes: "open",
      eyeDy: 1,
      mouth: "flat",
      hands: f % 2 === 0 ? "left" : "right",
      armL: "rest",
      armR: "rest",
    });
    drawKeyboard(layer, 23, 28, 22, 5, f);
  }),

  music: anim(16, 4, (f, layer) => {
    const sway = Math.round(Math.sin((f / 16) * Math.PI * 2));
    drawPet(layer, {
      barH: PET.barH + (f % 8 < 4 ? 1 : 0),
      barDx: sway,
      tuft: sway,
      eyes: "joy",
      mouth: "o",
      blush: true,
      armR: f % 8 < 4 ? "up" : "waveB",
      armL: f % 8 < 4 ? "rest" : "out",
      shadow: 72,
    });
    [0, 8].forEach((offset, i) => {
      const t = ((f + offset) % 16) / 16;
      const x = 38 + i * 6 + Math.round(t * 2);
      const y = 9 - Math.round(t * 8);
      drawNote(layer, x, y, t < 0.15 || t > 0.8 ? 120 : 255);
    });
  }),

  conducting: anim(16, 2, (f, layer) => {
    const beat = f % 8;
    const left = beat < 4 ? "up" : "out";
    const right = beat < 4 ? "out" : "up";
    drawPet(layer, {
      barH: PET.barH + (beat < 2 ? 1 : 0),
      eyes: "joy",
      mouth: "smile",
      blush: true,
      tuft: beat < 4 ? 1 : -1,
      armL: left,
      armR: right,
      shadow: 76,
    });
    const bx = PET.x;
    if (right === "up") inkRect(layer, bx + PET.barW + 3, 11, 1, 5, 255);
    if (left === "up") inkRect(layer, bx - 5, 12, 1, 4, 255);
  }),

  building: anim(16, 0, (f, layer) => {
    const cycle = f % 8;
    const struck = cycle === 5 || cycle === 6;
    drawPet(layer, {
      barH: PET.barH - (struck ? 1 : 0),
      eyes: "sleepy",
      mouth: "flat",
      barDx: cycle < 4 ? -1 : 0,
      tuft: struck ? -1 : 0,
      armR: cycle < 5 ? "waveA" : "out",
      armL: "rest",
      shadow: 76,
    });
    drawBlock(layer, 36, 30);
    if (cycle < 5) drawHammer(layer, 44, 4 + cycle, "up");
    else drawHammer(layer, 37, 27, "down");
    if (struck) {
      drawSpark(layer, 34, 25, 255);
      drawSpark(layer, 43, 24, 210);
    }
  }),

  error: anim(16, 4, (f, layer) => {
    const jitter = [0, 1, 0, -1][f % 4];
    drawPet(layer, {
      dx: jitter,
      eyes: "x",
      mouth: "frown",
      tuft: f % 2 === 0 ? 1 : -1,
      armL: "out",
      armR: "out",
      shadow: 76,
    });
    drawSweat(layer, 47 + jitter, 13 + (f % 4 === 0 ? 1 : 0), f % 8 < 6 ? 235 : 130);
  }),

  happy: anim(20, 3, (f, layer) => {
    const i = f % 10;
    const curve = [0, -1, -2, -3, -2, -1, 0, 0, 0, 0];
    const squash = i === 6 || i === 7;
    drawPet(layer, {
      dy: curve[i],
      barH: PET.barH - (squash ? 1 : 0),
      legLen: PET.legLen - (squash ? 1 : 0),
      eyes: "joy",
      mouth: "grin",
      tongue: true,
      blush: true,
      tuft: i < 5 ? 1 : 0,
      armL: i < 5 ? "up" : "rest",
      armR: i < 5 ? "up" : "rest",
      shadow: 80,
    });
    if (i === 2 || i === 3) {
      drawSpark(layer, 18, 14, 220);
      drawSpark(layer, 47, 12, 220);
    }
  }),

  notification: anim(16, 6, (f, layer) => {
    drawPet(layer, {
      barH: PET.barH + (f >= 2 && f < 12 ? 1 : 0),
      eyes: f < 10 ? "wide" : "open",
      mouth: f < 10 ? "o" : "smile",
      tuft: 1,
      armR: f >= 2 && f < 13 ? "up" : "rest",
      armL: "rest",
      shadow: 76,
    });
    if (f >= 1 && f < 14) {
      roundRect(layer, 40, 3, 6, 6, 1, C.soft, true);
      rect(layer, 42, 4, 1, 3, C.ink);
      paint(layer, 42, 8, C.ink);
      paint(layer, 41, 9, C.soft, true);
    }
  }),

  compacting: anim(20, 3, (f, layer) => {
    const i = f % 10;
    const squeeze = [0, 0, 1, 2, 2, 1, 0, 0, 0, 0][i];
    drawPet(layer, {
      barH: PET.barH - squeeze,
      legLen: PET.legLen - Math.min(2, squeeze),
      eyes: squeeze > 1 ? "sleepy" : "open",
      mouth: squeeze > 1 ? "wobble" : "flat",
      tuft: -1,
      shadow: 76,
    });
    const inset = Math.min(3, squeeze);
    const y = 18;
    inkRect(layer, PET.x - 4 + inset, y, 2, 9, 200);
    inkRect(layer, PET.x + PET.barW + 2 - inset, y, 2, 9, 200);
  }),

  sleeping: anim(24, 2, (f, layer) => {
    drawPet(layer, {
      barH: PET.barH + (f >= 8 && f < 18 ? 1 : 0),
      barDx: f >= 12 && f < 20 ? 1 : 0,
      eyes: "closed",
      mouth: "none",
      tuft: -1,
      shadow: 76,
    });
    for (let i = 0; i < 2; i += 1) {
      const phase = (f + i * 12) % 24;
      const t = phase / 24;
      if (phase >= 18) continue;
      const x = 40 + Math.round(t * 5);
      const y = 10 - Math.round(t * 8);
      drawZ(layer, x, y, phase > 13 ? 130 : 255);
    }
  }),

  waking: anim(12, 11, (f, layer) => {
    const stretch = f >= 4 && f <= 8;
    drawPet(layer, {
      barH: PET.barH + (stretch ? 1 : 0),
      eyes: f < 3 ? "closed" : f < 5 ? "sleepy" : f < 7 ? "wide" : "open",
      eyeDy: f < 5 ? 1 : 0,
      mouth: f < 4 ? "none" : f < 7 ? "yawn" : "smile",
      tuft: stretch ? 1 : 0,
      armL: stretch ? "up" : "rest",
      armR: stretch ? "up" : "rest",
      shadow: 76,
    });
  }),

  "poke-left": anim(10, 1, (f, layer) => {
    drawPet(layer, {
      dx: [3, 3, 2, 1, 0, 0, 0, 0, 0, 0][f],
      barDx: f < 2 ? -1 : 0,
      eyes: f < 3 ? "wide" : f < 6 ? "blink" : "open",
      mouth: f < 3 ? "o" : "smile",
      tuft: f < 3 ? -1 : 0,
      shadow: 76,
    });
    if (f < 2) {
      inkRect(layer, 21, 20, 3, 1, 220);
      inkRect(layer, 20, 23, 3, 1, 180);
      inkRect(layer, 22, 26, 2, 1, 140);
    }
  }),

  "poke-right": anim(10, 1, (f, layer) => {
    drawPet(layer, {
      dx: [-3, -3, -2, -1, 0, 0, 0, 0, 0, 0][f],
      barDx: f < 2 ? 1 : 0,
      eyes: f < 3 ? "wide" : f < 6 ? "blink" : "open",
      mouth: f < 3 ? "o" : "smile",
      tuft: f < 3 ? 1 : 0,
      shadow: 76,
    });
    if (f < 2) {
      inkRect(layer, 44, 20, 3, 1, 220);
      inkRect(layer, 46, 23, 3, 1, 180);
      inkRect(layer, 44, 26, 2, 1, 140);
    }
  }),

  tickle: anim(16, 2, (f, layer) => {
    const i = f % 8;
    drawPet(layer, {
      dy: [0, -1, 0, -1, 0, -1, 0, 0][i],
      barDx: i % 2 === 0 ? -1 : 1,
      eyes: "joy",
      mouth: "grin",
      tongue: true,
      blush: true,
      tuft: i % 2 === 0 ? -1 : 1,
      armL: i < 4 ? "up" : "out",
      armR: i < 4 ? "out" : "up",
      liftL: i === 1 ? 1 : 0,
      liftR: i === 3 ? 1 : 0,
      shadow: 78,
    });
    if (i === 0 || i === 4) {
      drawSpark(layer, 20, 18, 220);
      drawSpark(layer, 46, 16, 220);
    }
  }),

  drag: anim(8, 0, (f, layer) => {
    const sway = [0, 1, 1, 0, -1, -1, 0, 0][f];
    drawPet(layer, {
      dx: sway,
      dy: -2,
      barH: PET.barH + 1,
      legLen: 7,
      legSpread: 1,
      eyes: "wide",
      mouth: "o",
      tuft: -1,
      armL: "up",
      armR: "up",
    });
    inkRect(layer, 24 + sway, 9, 3, 1, 210);
    inkRect(layer, 40 + sway, 7, 3, 1, 170);
    inkRect(layer, 32 + sway, 5, 2, 1, 130);
  }),
};

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// sheets
// ---------------------------------------------------------------------------

function renderAnimation(key, spec) {
  const frames = [];
  for (let f = 0; f < spec.frames; f += 1) {
    const layer = createFrame();
    try {
      spec.draw(f, layer);
    } catch (error) {
      throw new Error(`${key} frame ${f}: ${error.message}`);
    }
    outline(layer);
    frames.push(layer);
  }
  return frames;
}

function boundsOf(frames) {
  let minX = CANVAS_W;
  let minY = CANVAS_H;
  let maxX = -1;
  let maxY = -1;
  for (const frame of frames) {
    for (let y = 0; y < CANVAS_H; y += 1) {
      for (let x = 0; x < CANVAS_W; x += 1) {
        const i = y * CANVAS_W + x;
        if (frame.rgba[i * 4 + 3] === 0 && frame.ink[i] === 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("empty animation");
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

function packSheet(frames, box) {
  const cellW = box[2] + GUTTER * 2;
  const cellH = box[3] + GUTTER * 2;
  const rows = Math.ceil(frames.length / COLS);
  const width = cellW * COLS;
  const height = cellH * rows;
  const body = new Uint8Array(width * height * 4);
  const ink = new Uint8Array(width * height * 4);
  frames.forEach((frame, f) => {
    const ox = (f % COLS) * cellW + GUTTER;
    const oy = Math.floor(f / COLS) * cellH + GUTTER;
    for (let y = 0; y < box[3]; y += 1) {
      for (let x = 0; x < box[2]; x += 1) {
        const si = (box[1] + y) * CANVAS_W + box[0] + x;
        const di = ((oy + y) * width + ox + x) * 4;
        body[di] = frame.rgba[si * 4];
        body[di + 1] = frame.rgba[si * 4 + 1];
        body[di + 2] = frame.rgba[si * 4 + 2];
        body[di + 3] = frame.rgba[si * 4 + 3];
        ink[di] = 255;
        ink[di + 1] = 255;
        ink[di + 2] = 255;
        ink[di + 3] = frame.ink[si];
      }
    }
  });
  return { width, height, cellW, cellH, body, ink, rows };
}

// ---------------------------------------------------------------------------
// optional contact sheets (visual review aid, never committed)
// ---------------------------------------------------------------------------

const FONT = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"],
};

function contactSheet(frames, box, scale) {
  const cellW = box[2] + GUTTER * 2;
  const cellH = box[3] + GUTTER * 2;
  const rows = Math.ceil(frames.length / COLS);
  const pad = 4;
  const width = pad + COLS * (cellW * scale + pad);
  const height = pad + rows * (cellH * scale + pad) + 10;
  const image = new Uint8ClampedArray(width * height * 4);
  const fill = (x, y, w, h, color) => {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        image.set(color, (py * width + px) * 4);
      }
    }
  };
  fill(0, 0, width, height, [239, 233, 221, 255]);
  frames.forEach((frame, f) => {
    const ox = pad + (f % COLS) * (cellW * scale + pad);
    const oy = pad + Math.floor(f / COLS) * (cellH * scale + pad);
    fill(ox - 1, oy - 1, cellW * scale + 2, cellH * scale + 2, [206, 196, 180, 255]);
    fill(ox, oy, cellW * scale, cellH * scale, [248, 245, 239, 255]);
    for (let y = 0; y < box[3]; y += 1) {
      for (let x = 0; x < box[2]; x += 1) {
        const si = (box[1] + y) * CANVAS_W + box[0] + x;
        const alpha = frame.rgba[si * 4 + 3] / 255;
        if (alpha > 0) {
          const color = [frame.rgba[si * 4], frame.rgba[si * 4 + 1], frame.rgba[si * 4 + 2], 255];
          fill(ox + x * scale, oy + y * scale, scale, scale, color);
        }
        const inkAlpha = (frame.ink[si] / 255) * 0.78;
        if (inkAlpha > 0) {
          const base = (oy + y * scale) * width + ox + x * scale;
          const src = [107, 101, 96];
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              const di = (base + sy * width + sx) * 4;
              for (let c = 0; c < 3; c += 1) {
                image[di + c] = Math.round(image[di + c] * (1 - inkAlpha) + src[c] * inkAlpha);
              }
            }
          }
        }
      }
    }
    const label = String(f);
    let lx = ox + 2;
    for (const ch of label) {
      const rowsOf = FONT[ch] ?? FONT["-"];
      rowsOf.forEach((line, gy) => {
        for (let gx = 0; gx < 3; gx += 1) {
          if (line[gx] === "1") fill(lx + gx * 2, oy + 2 + gy * 2, 2, 2, [120, 110, 100, 255]);
        }
      });
      lx += 8;
    }
  });
  return { width, height, data: image };
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

function emitModule(sheets, urls) {
  const metaLines = Object.keys(sheets).map(
    (key) => `  "${key}": { frames: ${sheets[key].frames}, box: [${sheets[key].box.join(", ")}], still: ${sheets[key].still} },`,
  );
  const urlLines = Object.keys(urls).map(
    (key) => `  "${key}": {\r\n    body: "${urls[key].body}",\r\n    ink: "${urls[key].ink}",\r\n  },`,
  );
  return [
    "/* eslint-disable */",
    "// Generated by scripts/build-pi-pet-sheets.mjs. Do not edit by hand.",
    "//",
    '// Pixel-art "Pi" pet sheets for the composer mascot. Each PNG is a grid of 8',
    "// columns; every cell is (box.w + 2 * PI_PET_GUTTER) x (box.h + 2 *",
    "// PI_PET_GUTTER) px and holds one frame, row-major. Only the `box` rectangle",
    "// of a cell is visible. `body` is the coloured art, `ink` an alpha mask that",
    "// the CSS tints with --text-dim (soft outline plus neutral props).",
    "",
    "export interface PiPetSheetMeta {",
    "  frames: number;",
    "  box: readonly [number, number, number, number];",
    "  still: number;",
    "}",
    "",
    `export const PI_PET_FRAME_MS = ${FRAME_MS};`,
    `export const PI_PET_GUTTER = ${GUTTER};`,
    "",
    "export const PI_PET_SHEETS: Record<string, PiPetSheetMeta> = {",
    ...metaLines,
    "};",
    "",
    "export const PI_PET_SHEET_URLS: Record<string, { body: string; ink: string }> = {",
    ...urlLines,
    "};",
    "",
  ].join("\r\n");
}

function main() {
  const argv = process.argv.slice(2);
  const contactIndex = argv.indexOf("--contact");
  const contactDir = contactIndex >= 0 ? argv[contactIndex + 1] : null;
  const scaleIndex = argv.indexOf("--scale");
  const contactScale = scaleIndex >= 0 ? Math.max(1, Number(argv[scaleIndex + 1]) || 4) : 4;

  const sheets = {};
  const urls = {};
  let total = 0;

  for (const [key, spec] of Object.entries(ANIMATIONS)) {
    const frames = renderAnimation(key, spec);
    const box = boundsOf(frames);
    const packed = packSheet(frames, box);
    const bodyPng = encodePng(packed.width, packed.height, packed.body);
    const inkPng = encodePng(packed.width, packed.height, packed.ink);
    sheets[key] = { frames: spec.frames, box, still: spec.still };
    urls[key] = {
      body: `data:image/png;base64,${bodyPng.toString("base64")}`,
      ink: `data:image/png;base64,${inkPng.toString("base64")}`,
    };
    total += bodyPng.length + inkPng.length;
    console.log(
      `${key.padEnd(13)} ${String(spec.frames).padStart(2)}f  box ${box.join(",").padEnd(14)} ${packed.width}x${packed.height}px  ${(
        (bodyPng.length + inkPng.length) / 1024
      ).toFixed(1)}KB`,
    );
    if (contactDir !== null) {
      const preview = contactSheet(frames, box, contactScale);
      mkdirSync(contactDir, { recursive: true });
      writeFileSync(join(contactDir, `pi-pet-sheet-${key}.png`), encodePng(preview.width, preview.height, preview.data));
    }
  }

  const source = emitModule(sheets, urls);
  const outFile = resolve(dirname(fileURLToPath(import.meta.url)), "../lib/pi-pet-sheets.ts");
  writeFileSync(outFile, source);
  console.log(`\n${Object.keys(ANIMATIONS).length} animations, ${(total / 1024).toFixed(1)}KB of PNG, ${(Buffer.byteLength(source) / 1024).toFixed(1)}KB module`);
  console.log(`wrote ${outFile}`);
}

main();
