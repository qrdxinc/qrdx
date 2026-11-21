// Layouts for the shape, object and playful frames (catalogue-objects.mjs):
// the code held by an everyday thing or set in a scene. Same conventions as
// layouts.mjs: each takes options and returns { w, h, qr, shapes, labels },
// the code is 1000 wide (800 in landscape layouts), and the plate around it
// is the engine's. layouts.mjs re-exports these, so build.mjs finds them by
// name.
//
// Every drawing here is original: the idea of the object (a mug, a rocket
// window, a cat holding a card) drawn from scratch with the path helpers.
//
// Options: cta, note and m as in layouts.mjs, plus `light` for a light
// body with a solid outline where a layout offers it.
import { bezier, mix, path, quad, shape, strokeLine, text } from "./lib.mjs";
import { motif } from "./motifs.mjs";

const F = "frame";
const T = "text";
const AC = "accent";
const BG = "background";
const tint = (n) => mix(F, BG, n);
const shade = (n) => mix(F, "#000000", n);

const QR = 1000;
const PAD = 80;
const qrAt = (x, y) => ({ x, y, size: QR, padding: PAD, radius: 24 });
const wideQr = (x, y) => ({ x, y, size: 800, padding: 64, radius: 19.2 });
/** A code `size` wide (artboards are at most 2000 units, so tall or wide objects use a smaller code). */
const qrSized = (x, y, size) => ({
  x,
  y,
  size,
  padding: size * 0.08,
  radius: size * 0.024,
});

const isLight = (paint) =>
  paint === BG ||
  (typeof paint === "object" && paint.mix?.[1] === BG && paint.amount >= 0.6);
const ink = (on) => (isLight(on) ? F : T);

const cta = (o, box, on, extra = {}) =>
  text("cta", "primary", o.cta, box, { color: ink(on), on, ...extra });
const note = (o, box, on, extra = {}) =>
  o.note === undefined || o.note === null
    ? []
    : [
        text("note", "secondary", o.note, box, {
          color: ink(on),
          on,
          weight: "regular",
          ...extra,
        }),
      ];

/** A polyline as a round-ended stroke shape. */
const line = (points, width, fill) =>
  shape.path(strokeLine(points, width, { round: true }), fill);

/** Points of a regular polygon (circumradius `rad`, first point at `start`°). */
function polygon(cx, cy, rad, n, start) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((start + (360 / n) * i) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** A pointy-top hexagon around the code, the label in its lower half. */
export function hexagon(o) {
  const R = 1000;
  const w = Math.round(R * Math.sqrt(3));
  const h = 2 * R;
  const cx = w / 2;
  const cy = R;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.poly(polygon(cx, cy, R, 6, -90), F)];
  if (o.light) shapes.push(shape.poly(polygon(cx, cy, R - 40, 6, -90), fill));
  const size = 900;
  const qy = cy - 600 + 72;
  const pb = qy + size + 72;
  const labels = [cta(o, [cx - 450, pb + 36, 900, 170], fill)];
  labels.push(...note(o, [cx - 310, 230, 620, 100], fill));
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A flat-top octagon, like a road sign, with a hairline inside its edge. */
export function octagon(o) {
  const R = 1060;
  const w = Math.round(2 * R * Math.cos(Math.PI / 8));
  const cx = w / 2;
  const cy = w / 2;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.poly(polygon(cx, cy, R, 8, 22.5), F)];
  shapes.push(shape.poly(polygon(cx, cy, R - 44, 8, 22.5), o.light ? fill : T));
  shapes.push(shape.poly(polygon(cx, cy, R - 60, 8, 22.5), fill));
  const qy = cy - 640;
  const pb = qy + QR + PAD;
  const labels = [cta(o, [cx - 500, pb + 40, 1000, 180], fill)];
  labels.push(...note(o, [cx - 350, cy - 940, 700, 100], fill));
  return { w, h: w, qr: qrAt(cx - 500, qy), shapes, labels };
}

/** A heart around the code, the label in its point. */
export function heart(o) {
  const w = 2000;
  const h = 1800;
  const cx = w / 2;
  const heartPath = (g) => {
    const left = g;
    const right = w - g;
    const top = g;
    const lobeY = 500 + g * 0.4;
    const notch = 230 + g * 0.8;
    const tip = h - g * 1.7;
    return path()
      .M(cx, notch)
      .C(cx, top + 60, cx - 240, top, cx - 500, top)
      .C(cx - 760 + g * 0.5, top, left, 200 + g * 0.6, left, lobeY)
      .C(left, 1150, cx - 400 + g * 0.3, 1620 - g * 0.6, cx, tip)
      .C(cx + 400 - g * 0.3, 1620 - g * 0.6, right, 1150, right, lobeY)
      .C(right, 200 + g * 0.6, cx + 760 - g * 0.5, top, cx + 500, top)
      .C(cx + 240, top, cx, top + 60, cx, notch)
      .Z();
  };
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.path(heartPath(0), F)];
  if (o.light) shapes.push(shape.path(heartPath(44), fill));
  const size = 900;
  const qy = 352;
  const pb = qy + size + 72;
  const labels = [cta(o, [cx - 410, pb + 36, 820, 150], fill)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A parchment scroll with rolled ends top and bottom. */
export function scroll(o) {
  const w = 1480;
  const roll = 200;
  const bodyX = 150;
  const bodyW = w - 2 * bodyX;
  const head = o.note ? 180 : 60;
  const bodyY = roll - 30;
  const qy = bodyY + head + PAD;
  const pb = qy + QR + PAD;
  const bodyBottom = pb + 260;
  const h = bodyBottom + roll - 30;
  const paper = tint(0.92);
  const shapes = [
    shape.rect(bodyX, bodyY, bodyW, bodyBottom - bodyY, paper),
    // Fold shadows where the paper leaves each roll
    shape.rect(bodyX, bodyY, bodyW, 28, tint(0.7)),
    shape.rect(bodyX, bodyBottom - 28, bodyW, 28, tint(0.7)),
  ];
  for (const y of [0, h - roll]) {
    shapes.push(shape.rect(0, y, w, roll, F, roll / 2));
    shapes.push(shape.rect(60, y + 40, w - 120, 36, tint(0.35), 18));
    shapes.push(shape.circle(roll / 2, y + roll / 2, 58, tint(0.55)));
    shapes.push(shape.circle(w - roll / 2, y + roll / 2, 58, tint(0.55)));
  }
  const labels = [cta(o, [bodyX + 60, pb + 40, bodyW - 120, 170], paper)];
  labels.push(...note(o, [bodyX + 80, bodyY + 60, bodyW - 160, 100], paper));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A pennant on a pole: the code at the hoist, the label along the fly. Wide. */
export function pennant(o) {
  const w = 2000;
  const h = 1400;
  const poleX = 70;
  const flagY = 130;
  const flagH = 1120;
  const notch = 300;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(poleX - 24, 60, 48, h - 60, shade(0.3), 12),
    shape.circle(poleX, 60, 56, shade(0.3)),
  ];
  const flag = (inset) =>
    path().poly([
      [poleX + 24 + inset, flagY + inset],
      [w - inset * 1.8, flagY + inset * 1.2],
      [w - notch + inset * 0.6, flagY + flagH / 2],
      [w - inset * 1.8, flagY + flagH - inset * 1.2],
      [poleX + 24 + inset, flagY + flagH - inset],
    ]);
  shapes.push(shape.path(flag(0), F));
  if (o.light) shapes.push(shape.path(flag(36), fill));
  // Hoist rings on the pole
  for (const y of [flagY + 60, flagY + flagH - 60])
    shapes.push(shape.circle(poleX, y, 30, tint(0.45), 14));
  const size = 700;
  const pad = size * 0.08;
  const qx = poleX + 24 + 100 + pad;
  const qy = flagY + (flagH - size) / 2;
  const tx = qx + size + pad + 50;
  const tw = w - notch - tx - 40;
  const labels = [cta(o, [tx, flagY + flagH / 2 - 200, tw, 200], fill)];
  labels.push(...note(o, [tx, flagY + flagH / 2 + 20, tw, 100], fill));
  return { w, h, qr: qrSized(qx, qy, size), shapes, labels };
}

// ── Gadgets ─────────────────────────────────────────────────────────────────

/** A tablet standing upright: a thin bezel, a camera dot and side buttons. */
export function tablet(o) {
  const w = 1520;
  const bezel = 60;
  const head = o.note ? 200 : 110;
  const qy = bezel + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 270 + bezel;
  const shapes = [
    shape.rect(w - 14, 300, 14, 160, shade(0.2), 7),
    shape.rect(w - 14, 500, 14, 160, shade(0.2), 7),
    shape.rect(0, 0, w, h, F, 120),
    shape.rect(bezel, bezel, w - 2 * bezel, h - 2 * bezel, BG, 70),
    shape.circle(w / 2, 34, 12, tint(0.5)),
  ];
  const labels = [cta(o, [160, pb + 40, w - 320, 180], BG)];
  labels.push(...note(o, [200, bezel + 60, w - 400, 100], BG));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A laptop seen from the front: the code on its screen, a deck below. */
export function laptop(o) {
  const w = 2000;
  const sx = 260;
  const sw = w - 2 * sx;
  const bezel = 50;
  const head = o.note ? 190 : 90;
  const qy = bezel + head + PAD;
  const pb = qy + QR + PAD;
  const screenH = pb + 250 + bezel;
  const deckY = screenH;
  const h = deckY + 150;
  const shapes = [
    shape.rect(sx, 0, sw, screenH + 30, F, 60),
    shape.rect(sx + bezel, bezel, sw - 2 * bezel, screenH - 2 * bezel, BG, 24),
    shape.circle(w / 2, bezel / 2, 10, tint(0.5)),
    // The deck, a little wider than the screen, with a trackpad lip
    shape.path(
      path().poly([
        [0, deckY + 150],
        [40, deckY],
        [w - 40, deckY],
        [w, deckY + 150],
      ]),
      shade(0.2)
    ),
    shape.rect(w / 2 - 170, deckY, 340, 40, tint(0.4), 20),
    shape.rect(0, deckY + 110, w, 40, shade(0.35)),
  ];
  const labels = [cta(o, [sx + 120, pb + 40, sw - 240, 170], BG)];
  labels.push(...note(o, [sx + 160, bezel + 50, sw - 320, 100], BG));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A desktop monitor on a stand, the code on its screen. */
export function monitor(o) {
  const w = 1700;
  const bezel = 44;
  const head = o.note ? 190 : 90;
  const qy = bezel + head + PAD;
  const pb = qy + QR + PAD;
  const screenH = pb + 250 + bezel;
  const h = screenH + 270;
  const shapes = [
    shape.rect(0, 0, w, screenH + 70, F, 40),
    shape.rect(bezel, bezel, w - 2 * bezel, screenH - 2 * bezel, BG, 12),
    shape.circle(w / 2, screenH + 35, 16, tint(0.5)),
    shape.rect(w / 2 - 70, screenH + 70, 140, 130, shade(0.25)),
    shape.rect(w / 2 - 420, h - 80, 840, 80, shade(0.25), 40),
  ];
  const labels = [cta(o, [120, pb + 40, w - 240, 170], BG)];
  labels.push(...note(o, [160, bezel + 50, w - 320, 100], BG));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

// ── Things ──────────────────────────────────────────────────────────────────

/** A mug with a big handle and steam, the code on its side. */
export function mug(o) {
  const bodyW = 1360;
  const w = bodyW + 300;
  const top = 300;
  const head = o.note ? 200 : 100;
  const qy = top + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 290;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [];
  // Steam: three rising curls
  for (const x of [bodyW / 2 - 260, bodyW / 2, bodyW / 2 + 260]) {
    shapes.push(
      line(
        bezier([x, 240], [x - 90, 170], [x + 90, 90], [x, 10], 18),
        34,
        tint(0.5)
      )
    );
  }
  // Handle: a thick ring arc on the right
  shapes.push(shape.circle(bodyW - 10, top + (h - top) / 2 - 60, 280, F, 165));
  shapes.push(shape.rect(0, top, bodyW, h - top, F, 90));
  if (o.light)
    shapes.push(shape.rect(44, top + 44, bodyW - 88, h - top - 88, fill, 60));
  // Rim
  shapes.push(shape.rect(0, top, bodyW, 70, shade(0.3), 35));
  shapes.push(shape.rect(40, top + 20, bodyW - 80, 30, tint(0.5), 15));
  const labels = [cta(o, [120, pb + 40, bodyW - 240, 180], fill)];
  labels.push(...note(o, [160, top + 110, bodyW - 320, 100], fill));
  return { w, h, qr: qrAt((bodyW - QR) / 2, qy), shapes, labels };
}

/** A delivery box with a tape strip and a shipping label holding the code. */
export function deliveryBox(o) {
  const w = 1500;
  const flap = 120;
  const labelX = 150;
  const labelW = w - 2 * labelX;
  const labelY = flap + 150;
  const head = o.note ? 180 : 60;
  const qy = labelY + head + PAD;
  const pb = qy + QR + PAD;
  const labelH = pb - labelY + 250;
  const h = labelY + labelH + 120;
  const card = o.light ? tint(0.85) : tint(0.4);
  const shapes = [
    shape.rect(0, flap, w, h - flap, card, 24),
    // Lid flaps folded over the top edge
    shape.path(
      path().poly([
        [0, flap],
        [w / 2, flap],
        [w / 2 - 60, 0],
        [60, 0],
      ]),
      o.light ? tint(0.75) : tint(0.3)
    ),
    shape.path(
      path().poly([
        [w / 2, flap],
        [w, flap],
        [w - 60, 0],
        [w / 2 + 60, 0],
      ]),
      o.light ? tint(0.75) : tint(0.3)
    ),
    // Tape down the middle of the lid and the box
    shape.rect(w / 2 - 90, 0, 180, labelY - 40, F),
    shape.rect(
      w / 2 - 90,
      labelY + labelH + 40,
      180,
      h - labelY - labelH - 40,
      F
    ),
    // The shipping label
    shape.rect(labelX, labelY, labelW, labelH, BG, 16),
  ];
  const labels = [cta(o, [labelX + 60, pb + 40, labelW - 120, 170], BG)];
  labels.push(
    ...note(o, [labelX + 80, labelY + 50, labelW - 160, 100], BG, {
      align: "start",
    })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A delivery scooter with a big box on the back holding the code. Wide. */
export function scooter(o) {
  const w = 2000;
  const boxW = 1300;
  const boxX = 40;
  const boxY = 0;
  const head = o.note ? 150 : 60;
  const qy = boxY + head + PAD;
  const pb = qy + QR + PAD;
  const boxH = pb - boxY + 230;
  const groundY = boxY + boxH + 440;
  const h = groundY + 20;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [];
  // Scooter: a seat under the box, a floorboard, a front shield and bars
  const seatY = boxY + boxH + 10;
  shapes.push(shape.rect(boxX + 200, seatY, 720, 80, shade(0.3), 40));
  shapes.push(
    shape.path(
      path()
        .M(boxX + 860, seatY + 50)
        .L(w - 470, seatY + 50)
        .L(w - 280, seatY - 330)
        .L(w - 190, seatY - 330)
        .L(w - 380, seatY + 170)
        .L(boxX + 540, seatY + 170)
        .Z(),
      F
    )
  );
  shapes.push(
    line(
      [
        [w - 310, seatY - 330],
        [w - 130, seatY - 450],
      ],
      36,
      F
    )
  );
  shapes.push(shape.circle(w - 120, seatY - 458, 40, F));
  shapes.push(shape.circle(w - 280, seatY - 300, 60, tint(0.6)));
  for (const x of [boxX + 380, w - 400]) {
    shapes.push(shape.circle(x, groundY - 150, 150, F));
    shapes.push(shape.circle(x, groundY - 150, 92, tint(0.55)));
    shapes.push(shape.circle(x, groundY - 150, 32, F));
  }
  shapes.push(shape.rect(0, groundY - 16, w, 16, tint(0.5)));
  shapes.push(shape.rect(boxX, boxY, boxW, boxH, F, 48));
  if (o.light)
    shapes.push(
      shape.rect(boxX + 30, boxY + 30, boxW - 60, boxH - 60, fill, 30)
    );
  shapes.push(
    shape.rect(boxX + 60, boxY + boxH - 60, boxW - 120, 14, tint(0.45), 7)
  );
  const labels = [cta(o, [boxX + 100, pb + 36, boxW - 200, 170], fill)];
  labels.push(...note(o, [boxX + 140, boxY + 44, boxW - 280, 96], fill));
  return { w, h, qr: qrAt(boxX + (boxW - QR) / 2, qy), shapes, labels };
}

/** A hand holding up a card with the code. */
export function handCard(o) {
  const w = 1560;
  const cardX = 180;
  const cardW = 1240;
  const cardY = 0;
  const head = o.note ? 180 : 60;
  const qy = cardY + head + PAD;
  const pb = qy + QR + PAD;
  const cardH = pb - cardY + 250;
  const h = cardH + 380;
  const fill = o.light ? tint(0.9) : F;
  const skin = shade(0.2);
  const shapes = [];
  // Wrist and palm, behind the card's lower edge
  shapes.push(
    shape.path(
      path()
        .M(cardX + 120, cardH - 300)
        .L(cardX + 1060, cardH - 300)
        .C(
          cardX + 1130,
          cardH + 60,
          cardX + 1040,
          cardH + 240,
          cardX + 900,
          cardH + 300
        )
        .L(cardX + 900, h)
        .L(cardX + 380, h)
        .L(cardX + 380, cardH + 300)
        .C(
          cardX + 200,
          cardH + 240,
          cardX + 60,
          cardH + 80,
          cardX + 120,
          cardH - 300
        )
        .Z(),
      skin
    )
  );
  // Fingertips over the card's right edge
  for (const [y, len] of [
    [cardH - 520, 150],
    [cardH - 380, 170],
    [cardH - 240, 160],
  ]) {
    shapes.push(
      shape.rect(cardX + cardW - len + 40, y, len + 60, 120, skin, 60)
    );
  }
  // The card
  shapes.push(shape.rect(cardX, cardY, cardW, cardH, F, 48));
  if (o.light)
    shapes.push(
      shape.rect(cardX + 28, cardY + 28, cardW - 56, cardH - 56, fill, 30)
    );
  // Thumb over the card's lower left corner
  shapes.push(
    shape.path(
      path()
        .M(cardX - 40, cardH - 20)
        .C(
          cardX - 60,
          cardH - 360,
          cardX + 140,
          cardH - 420,
          cardX + 300,
          cardH - 330
        )
        .C(
          cardX + 420,
          cardH - 260,
          cardX + 380,
          cardH - 60,
          cardX + 300,
          cardH + 60
        )
        .L(cardX + 160, cardH + 160)
        .C(
          cardX + 40,
          cardH + 200,
          cardX - 40,
          cardH + 120,
          cardX - 40,
          cardH - 20
        )
        .Z(),
      skin
    )
  );
  const labels = [cta(o, [cardX + 360, pb + 40, cardW - 460, 170], fill)];
  labels.push(...note(o, [cardX + 120, cardY + 50, cardW - 240, 100], fill));
  return { w, h, qr: qrAt(cardX + (cardW - QR) / 2, qy), shapes, labels };
}

/** A gallery frame with a mount around the code, hung from a nail. */
export function pictureFrame(o) {
  const w = 1640;
  const frameW = 90;
  const mount = 100;
  const top = 120;
  const head = o.note ? 120 : 10;
  const qy = top + frameW + mount + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 200 + mount + frameW;
  const shapes = [
    // Wire and nail
    line(
      [
        [w / 2 - 520, top + 50],
        [w / 2, 30],
        [w / 2 + 520, top + 50],
      ],
      14,
      tint(0.4)
    ),
    shape.circle(w / 2, 26, 24, shade(0.3)),
    shape.rect(0, top, w, h - top, F, 20),
    shape.rect(
      frameW - 36,
      top + frameW - 36,
      w - 2 * frameW + 72,
      h - top - 2 * frameW + 72,
      tint(0.45)
    ),
    shape.rect(
      frameW,
      top + frameW,
      w - 2 * frameW,
      h - top - 2 * frameW,
      tint(0.94)
    ),
  ];
  // Corner ornaments
  for (const [x, y] of [
    [frameW / 2, top + frameW / 2],
    [w - frameW / 2, top + frameW / 2],
    [frameW / 2, h - frameW / 2],
    [w - frameW / 2, h - frameW / 2],
  ]) {
    shapes.push(shape.circle(x, y, 34, tint(0.4)));
    shapes.push(shape.circle(x, y, 16, F));
  }
  const inner = w - 2 * (frameW + mount);
  const labels = [cta(o, [frameW + mount, pb + 20, inner, 170], tint(0.94))];
  labels.push(
    ...note(
      o,
      [frameW + mount + 40, top + frameW + mount + 10, inner - 80, 100],
      tint(0.94)
    )
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A billboard on two posts with a row of lights along its top. Wide. */
export function billboard(o) {
  const w = 2000;
  const boardY = 80;
  const boardH = 1080;
  const h = boardY + boardH + 340;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(
      300,
      boardY + boardH - 20,
      70,
      h - boardY - boardH + 20,
      shade(0.3)
    ),
    shape.rect(
      w - 370,
      boardY + boardH - 20,
      70,
      h - boardY - boardH + 20,
      shade(0.3)
    ),
    shape.rect(0, boardY, w, boardH, F, 30),
  ];
  if (o.light)
    shapes.push(shape.rect(40, boardY + 40, w - 80, boardH - 80, fill, 12));
  // Lights on an arm along the top edge
  shapes.push(shape.rect(80, boardY - 30, w - 160, 24, shade(0.3), 12));
  for (let i = 0; i < 9; i++) {
    const x = 160 + ((w - 320) * i) / 8;
    shapes.push(shape.circle(x, boardY - 48, 42, tint(0.6)));
    shapes.push(shape.circle(x, boardY - 48, 22, BG));
  }
  const qx = 160;
  const qy = boardY + (boardH - 800) / 2;
  const tx = qx + 800 + 64 + 90;
  const tw = w - tx - 130;
  const labels = [cta(o, [tx, boardY + 320, tw, 220], fill)];
  labels.push(...note(o, [tx, boardY + 570, tw, 110], fill));
  return { w, h, qr: wideQr(qx, qy), shapes, labels };
}

/** An open book: the code on the right page, the words on the left. Wide. */
export function bookOpen(o) {
  const w = 2000;
  const h = 1380;
  const spine = w / 2;
  const pageY = 50;
  const pageH = h - 100;
  const edge = 40;
  const paper = tint(0.94);
  const shapes = [
    // Cover, a little larger than the pages
    shape.rect(0, 0, w, h, F, 30),
    // Pages, their outer bottom corners lifting
    shape.path(
      path()
        .M(spine, pageY + 20)
        .L(edge, pageY)
        .L(edge - 8, pageY + pageH)
        .Q(spine - 450, pageY + pageH - 50, spine, pageY + pageH - 20)
        .Z(),
      paper
    ),
    shape.path(
      path()
        .M(spine, pageY + 20)
        .L(w - edge, pageY)
        .L(w - edge + 8, pageY + pageH)
        .Q(spine + 450, pageY + pageH - 50, spine, pageY + pageH - 20)
        .Z(),
      paper
    ),
    shape.rect(spine - 22, pageY + 20, 44, pageH - 40, tint(0.7)),
    // A ribbon bookmark
    shape.path(
      path().poly([
        [spine + 50, pageY],
        [spine + 106, pageY],
        [spine + 106, pageY + 240],
        [spine + 78, pageY + 204],
        [spine + 50, pageY + 240],
      ]),
      AC
    ),
  ];
  const size = 760;
  const qx = spine + 22 + (w - edge - spine - 22 - size) / 2;
  const qy = pageY + (pageH - size) / 2;
  const tx = 120;
  const tw = spine - 22 - tx - 70;
  const labels = [cta(o, [tx, pageY + 440, tw, 210], paper)];
  labels.push(...note(o, [tx, pageY + 690, tw, 110], paper));
  for (const y of [pageY + 200, pageY + 276, pageY + 352]) {
    shapes.push(
      shape.rect(
        tx + 60,
        y,
        tw - 120 - (y === pageY + 352 ? 280 : 0),
        18,
        tint(0.75),
        9
      )
    );
  }
  return { w, h, qr: qrSized(qx, qy, size), shapes, labels };
}

/** A bottle with a cap and shoulders, the code on its label. */
export function bottle(o) {
  const w = 1300;
  const cx = w / 2;
  const neckY = 100;
  const shoulderY = 240;
  const bodyY = 420;
  const labelX = 50;
  const labelW = w - 2 * labelX;
  const labelY = bodyY + 30;
  const size = 800;
  const pad = size * 0.08;
  const head = o.note ? 170 : 50;
  const qy = labelY + head + pad;
  const pb = qy + size + pad;
  const labelH = pb - labelY + 220;
  const h = labelY + labelH + 190;
  const body = path()
    .M(cx - 130, neckY)
    .L(cx - 130, shoulderY)
    .C(cx - 130, shoulderY + 90, cx - w / 2, shoulderY + 80, cx - w / 2, bodyY)
    .L(cx - w / 2, h - 110)
    .Q(cx - w / 2, h, cx - w / 2 + 110, h)
    .L(cx + w / 2 - 110, h)
    .Q(cx + w / 2, h, cx + w / 2, h - 110)
    .L(cx + w / 2, bodyY)
    .C(
      cx + w / 2,
      shoulderY + 80,
      cx + 130,
      shoulderY + 90,
      cx + 130,
      shoulderY
    )
    .L(cx + 130, neckY)
    .Z();
  const labelFill = o.light ? BG : tint(0.9);
  const shapes = [
    shape.path(body, F),
    shape.rect(cx - 170, 0, 340, neckY + 20, shade(0.3), 36),
    shape.rect(cx - 130, 30, 260, 22, tint(0.4), 11),
    shape.rect(labelX, labelY, labelW, labelH, labelFill, 28),
    shape.rect(labelX, labelY + 44, labelW, 12, AC),
    shape.rect(labelX, labelY + labelH - 56, labelW, 12, AC),
  ];
  const labels = [cta(o, [labelX + 50, pb + 30, labelW - 100, 160], labelFill)];
  labels.push(
    ...note(o, [labelX + 90, labelY + 62, labelW - 180, 96], labelFill)
  );
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

// ── Pattern borders ─────────────────────────────────────────────────────────

/** Deterministic noise in [0, 1) for pattern placement (no randomness in specs). */
const noise = (i, k = 0) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43_758.5453;
  return x - Math.floor(x);
};

/** The card every pattern border draws on: a light card with a band of `band` for the pattern. */
function patternCard(o, band, w) {
  const head = o.note ? 170 : 60;
  const qy = band + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 240 + band;
  const fill = tint(0.92);
  const shapes = [shape.rect(0, 0, w, h, BG, 40)];
  const inner = [band, band, w - 2 * band, h - 2 * band];
  const labels = [cta(o, [band + 60, pb + 30, w - 2 * band - 120, 170], fill)];
  labels.push(
    ...note(o, [band + 80, band + 50, w - 2 * band - 160, 100], fill)
  );
  return { w, h, qy, pb, band, fill, shapes, inner, labels };
}

/** A border of polka dots around a light card. */
export function polkaBorder(o) {
  const w = 1400;
  const band = 150;
  const c = patternCard(o, band, w);
  const { h } = c;
  const step = 100;
  const nx = Math.round((w - band) / step);
  const ny = Math.round((h - band) / step);
  for (let i = 0; i <= nx; i++) {
    const x = band / 2 + ((w - band) * i) / nx;
    c.shapes.push(shape.circle(x, band / 2, 30, i % 2 ? AC : F));
    c.shapes.push(shape.circle(x, h - band / 2, 30, i % 2 ? AC : F));
  }
  for (let i = 1; i < ny; i++) {
    const y = band / 2 + ((h - band) * i) / ny;
    c.shapes.push(shape.circle(band / 2, y, 30, i % 2 ? AC : F));
    c.shapes.push(shape.circle(w - band / 2, y, 30, i % 2 ? AC : F));
  }
  c.shapes.push(shape.rect(...c.inner, c.fill, 28));
  return {
    w,
    h,
    qr: qrAt((w - QR) / 2, c.qy),
    shapes: c.shapes,
    labels: c.labels,
  };
}

/** A border of short scattered dashes, like confetti, around a light card. */
export function dashBorder(o) {
  const w = 1400;
  const band = 150;
  const c = patternCard(o, band, w);
  const { h } = c;
  let i = 0;
  const dash = (x, y) => {
    const a = noise(i, 1) * Math.PI;
    const len = 36 + noise(i, 2) * 30;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    c.shapes.push(
      line(
        [
          [x - dx, y - dy],
          [x + dx, y + dy],
        ],
        18,
        i % 3 === 0 ? AC : F
      )
    );
    i += 1;
  };
  const along = (x0, y0, x1, y1, n) => {
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const jx = (noise(i, 3) - 0.5) * 40;
      const jy = (noise(i, 4) - 0.5) * 40;
      dash(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy);
    }
  };
  along(band / 2, band / 2, w - band / 2, band / 2, 14);
  along(band / 2, h - band / 2, w - band / 2, h - band / 2, 14);
  along(band / 2, band / 2 + 100, band / 2, h - band / 2 - 100, 14);
  along(w - band / 2, band / 2 + 100, w - band / 2, h - band / 2 - 100, 14);
  c.shapes.push(shape.rect(...c.inner, c.fill, 28));
  return {
    w,
    h,
    qr: qrAt((w - QR) / 2, c.qy),
    shapes: c.shapes,
    labels: c.labels,
  };
}

/** A border of waves with a curl in each corner, around a light card. */
export function swirlBorder(o) {
  const w = 1400;
  const band = 150;
  const c = patternCard(o, band, w);
  const { h } = c;
  const mid = band / 2;
  const wave = (x0, y0, x1, y1, n = 40) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const s = Math.sin(t * Math.PI * 8) * 22;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      pts.push(x0 === x1 ? [x + s, y] : [x, y + s]);
    }
    c.shapes.push(line(pts, 16, F));
  };
  const curl = (cx, cy, dir) => {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const a = t * Math.PI * 2.4;
      const rad = 8 + t * 50;
      pts.push([
        cx + Math.cos(a) * rad * dir[0],
        cy + Math.sin(a) * rad * dir[1],
      ]);
    }
    c.shapes.push(line(pts, 16, AC));
  };
  wave(mid + 110, mid, w - mid - 110, mid);
  wave(mid + 110, h - mid, w - mid - 110, h - mid);
  wave(mid, mid + 110, mid, h - mid - 110);
  wave(w - mid, mid + 110, w - mid, h - mid - 110);
  curl(mid, mid, [1, 1]);
  curl(w - mid, mid, [-1, 1]);
  curl(mid, h - mid, [1, -1]);
  curl(w - mid, h - mid, [-1, -1]);
  c.shapes.push(shape.rect(...c.inner, c.fill, 28));
  return {
    w,
    h,
    qr: qrAt((w - QR) / 2, c.qy),
    shapes: c.shapes,
    labels: c.labels,
  };
}

/** A sketched border: two wobbly hand-drawn outlines, slightly apart. */
export function sketchBorder(o) {
  const w = 1400;
  const band = 120;
  const c = patternCard(o, band, w);
  const { h } = c;
  const wobbly = (inset, seed, width, fill) => {
    const pts = [];
    const corners = [
      [inset, inset],
      [w - inset, inset],
      [w - inset, h - inset],
      [inset, h - inset],
    ];
    for (let side = 0; side < 4; side++) {
      const [ax, ay] = corners[side];
      const [bx, by] = corners[(side + 1) % 4];
      const n = 14;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const j = (noise(k + side * 20, seed) - 0.5) * 16;
        pts.push([
          ax + (bx - ax) * t + (ax === bx ? j : 0),
          ay + (by - ay) * t + (ay === by ? j : 0),
        ]);
      }
    }
    pts.push([...pts[0]]);
    c.shapes.push(line(pts, width, fill));
  };
  wobbly(band / 2 - 14, 7, 12, F);
  wobbly(band / 2 + 16, 11, 8, AC);
  c.shapes.push(shape.rect(...c.inner, c.fill, 24));
  return {
    w,
    h,
    qr: qrAt((w - QR) / 2, c.qy),
    shapes: c.shapes,
    labels: c.labels,
  };
}

/** A card raised off the page: a solid face over a dark offset block. depth: how far. */
export function border3d(o) {
  const w = 1300;
  const depth = o.depth ?? 48;
  const head = o.note ? 170 : 60;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 250;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [
    shape.rect(
      depth,
      depth,
      w - depth,
      h - depth,
      o.light ? shade(0.45) : tint(0.5),
      36
    ),
    shape.rect(0, 0, w - depth, h - depth, F, 36),
  ];
  if (o.light)
    shapes.push(shape.rect(30, 30, w - depth - 60, h - depth - 60, fill, 20));
  const labels = [cta(o, [80, pb + 30, w - depth - 160, 170], fill)];
  labels.push(...note(o, [100, 50, w - depth - 200, 100], fill));
  return { w, h, qr: qrAt((w - depth - QR) / 2, qy), shapes, labels };
}

/** A square card with the call to action in a tab over its top corner. */
export function cornerTab(o) {
  const w = 1340;
  const tabW = 760;
  const tabH = 180;
  const cardY = 110;
  const qy = cardY + 130 + PAD;
  const pb = qy + QR + PAD;
  const h = o.note ? pb + 180 : pb + 60;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [shape.rect(0, cardY, w, h - cardY, F, 48)];
  if (o.light)
    shapes.push(shape.rect(30, cardY + 30, w - 60, h - cardY - 60, fill, 30));
  shapes.push(shape.rect(0, 0, tabW, tabH, AC, 40));
  const labels = [cta(o, [40, 20, tabW - 80, 140], AC, { align: "start" })];
  labels.push(...note(o, [80, pb + 30, w - 160, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** No card at all: big bold text over and under the code is the frame. */
export function textFrame(o) {
  const w = 1300;
  const row = 260;
  const qy = row + 40 + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 40 + row;
  const shapes = [
    shape.rect(0, 0, w, 16, F, 8),
    shape.rect(0, h - 16, w, 16, F, 8),
  ];
  const labels = [cta(o, [40, pb + 40, w - 80, row], BG, { fontSize: 150 })];
  labels.push(
    ...note(o, [40, 0, w - 80, row], BG, { weight: "bold", fontSize: 150 })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

// ── More things ─────────────────────────────────────────────────────────────

/** A map pin: the code in its round head, the point below. */
export function mapPin(o) {
  const w = 1700;
  const h = 2000;
  const R = 850;
  const cx = w / 2;
  const cy = 870;
  // The head is a circle (exact bounds); the point is the triangle from the
  // tip to where its sides touch the circle
  const point = (rad, tipY) => {
    const d = tipY - cy;
    const phi = Math.acos(rad / d);
    const tx = rad * Math.sin(phi);
    const ty = rad * Math.cos(phi);
    return path().poly([
      [cx, tipY],
      [cx + tx, cy + ty],
      [cx - tx, cy + ty],
    ]);
  };
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.circle(cx, cy, R, F), shape.path(point(R, h - 40), F)];
  if (o.light) {
    shapes.push(shape.circle(cx, cy, R - 44, fill));
    shapes.push(shape.path(point(R - 44, h - 130), fill));
  }
  const size = 860;
  const pad = size * 0.08;
  const qy = cy - 90 - size / 2;
  const pb = qy + size + pad;
  const labels = [cta(o, [cx - 480, pb + 30, 960, 160], fill)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A bookmark: a tall strip with a punched hole on top and a notch at the foot. */
export function bookmark(o) {
  const w = 1300;
  const head = o.note ? 290 : 190;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const notchY = pb + 270;
  const h = notchY + 200;
  const fill = o.light ? tint(0.9) : F;
  const strip = (inset) =>
    path().poly([
      [inset, inset],
      [w - inset, inset],
      [w - inset, notchY - inset * 0.4],
      [w / 2, h - inset * 1.8],
      [inset, notchY - inset * 0.4],
    ]);
  const shapes = [shape.path(strip(0), F)];
  if (o.light) shapes.push(shape.path(strip(36), fill));
  shapes.push(shape.circle(w / 2, 100, 46, BG));
  shapes.push(shape.circle(w / 2, 100, 46, o.light ? F : tint(0.5), 32));
  const labels = [cta(o, [80, pb + 40, w - 160, 170], fill)];
  labels.push(...note(o, [100, 170, w - 200, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A film clapperboard: a striped hinged bar open over the board. */
export function clapperboard(o) {
  const w = 1420;
  const boardY = 440;
  const boardTop = boardY + 110;
  const size = 900;
  const pad = size * 0.08;
  const head = o.note ? 150 : 50;
  const qy = boardTop + head + pad;
  const pb = qy + size + pad;
  const h = pb + 220;
  const fill = o.light ? tint(0.9) : F;
  // The bar, rotated about its hinge at the left
  const hx = 60;
  const hy = boardY - 10;
  const rot = (-10 * Math.PI) / 180;
  const at = (x, y) => [
    hx + (x - hx) * Math.cos(rot) - (y - hy) * Math.sin(rot),
    hy + (x - hx) * Math.sin(rot) + (y - hy) * Math.cos(rot),
  ];
  const barH = 150;
  const bar = (y0, y1, x0, x1) =>
    path().poly([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]);
  const shapes = [shape.path(bar(hy - barH, hy, hx, w - 20), F)];
  const stripes = 7;
  const stripeW = (w - 20 - hx - 60) / stripes;
  for (let i = 0; i < stripes; i++) {
    if (i % 2) continue;
    const x0 = hx + 30 + i * stripeW;
    shapes.push(
      shape.path(
        path().poly([
          at(x0 + 50, hy - barH + 20),
          at(x0 + stripeW, hy - barH + 20),
          at(x0 + stripeW - 50, hy - 20),
          at(x0, hy - 20),
        ]),
        BG
      )
    );
  }
  // Lower bar of the slate (fixed), with its own stripes
  shapes.push(shape.rect(0, boardY - 20, w, 130, F, 20));
  for (let i = 0; i < stripes; i++) {
    if (i % 2) continue;
    const x0 = 30 + i * stripeW;
    shapes.push(
      shape.path(
        path().poly([
          [x0 + 50, boardY],
          [x0 + stripeW, boardY],
          [x0 + stripeW - 50, boardY + 90],
          [x0, boardY + 90],
        ]),
        BG
      )
    );
  }
  shapes.push(shape.circle(hx, hy, 40, shade(0.3)));
  shapes.push(shape.rect(0, boardTop, w, h - boardTop, F, 30));
  if (o.light)
    shapes.push(
      shape.rect(30, boardTop + 30, w - 60, h - boardTop - 60, fill, 20)
    );
  const labels = [cta(o, [80, pb + 30, w - 160, 160], fill)];
  labels.push(...note(o, [100, boardTop + 30, w - 200, 96], fill));
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

/** A smartwatch: the code on its square face, straps above and below. */
export function smartwatch(o) {
  const w = 1380;
  const faceX = 0;
  const faceW = 1300;
  const bezel = 60;
  const faceY = 220;
  const head = o.note ? 120 : 50;
  const qy = faceY + bezel + head + PAD;
  const pb = qy + QR + PAD;
  const faceH = pb + 200 + bezel - faceY;
  const h = faceY + faceH + 150;
  const strapX = faceX + 330;
  const strapW = faceW - 660;
  const shapes = [
    shape.rect(strapX, 0, strapW, faceY + 40, shade(0.3), 40),
    shape.rect(
      strapX,
      faceY + faceH - 40,
      strapW,
      h - faceY - faceH + 40,
      shade(0.3),
      40
    ),
    shape.rect(faceX + faceW - 10, faceY + 300, 90, 160, shade(0.3), 30),
    shape.rect(faceX, faceY, faceW, faceH, F, 180),
    shape.rect(
      faceX + bezel,
      faceY + bezel,
      faceW - 2 * bezel,
      faceH - 2 * bezel,
      BG,
      130
    ),
  ];
  for (const y of [h - 110, h - 60]) {
    shapes.push(shape.circle(faceX + faceW / 2, y, 16, tint(0.5)));
  }
  const labels = [cta(o, [faceX + 140, pb + 20, faceW - 280, 160], BG)];
  labels.push(
    ...note(o, [faceX + 180, faceY + bezel + 20, faceW - 360, 96], BG)
  );
  return { w, h, qr: qrAt(faceX + (faceW - QR) / 2, qy), shapes, labels };
}

/** A spiral notebook: rings along the top, a ruled page below. */
export function notebook(o) {
  const w = 1400;
  const pageY = 110;
  const head = o.note ? 190 : 80;
  const qy = pageY + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 260;
  const paper = tint(0.94);
  const shapes = [shape.rect(0, pageY, w, h - pageY, F, 30)];
  shapes.push(shape.rect(24, pageY + 24, w - 48, h - pageY - 48, paper, 16));
  for (let y = pageY + 330; y < h - 60; y += 90) {
    shapes.push(shape.rect(80, y, w - 160, 6, tint(0.78), 3));
  }
  shapes.push(shape.rect(170, pageY + 24, 8, h - pageY - 48, AC));
  const rings = 11;
  for (let i = 0; i < rings; i++) {
    const x = 110 + ((w - 220) * i) / (rings - 1);
    shapes.push(shape.rect(x - 26, pageY + 10, 52, 80, F, 26));
    shapes.push(shape.circle(x, 60, 56, F, 36));
  }
  const labels = [cta(o, [100, pb + 40, w - 200, 170], paper)];
  labels.push(
    ...note(o, [220, pageY + 60, w - 320, 100], paper, { align: "start" })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A roll-up banner stand: the code on the banner, a cassette and a foot at its base. */
export function bannerStand(o) {
  const w = 1340;
  const bx = 100;
  const bw = w - 200;
  const barY = 0;
  const panelY = 40;
  const head = o.note ? 200 : 80;
  const qy = panelY + head + PAD;
  const pb = qy + QR + PAD;
  const panelBottom = pb + 300;
  const h = panelBottom + 200;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    shape.rect(bx - 20, barY, bw + 40, 50, shade(0.3), 16),
    shape.rect(bx, panelY, bw, panelBottom - panelY, F),
  ];
  if (o.light)
    shapes.push(
      shape.rect(bx + 30, panelY + 20, bw - 60, panelBottom - panelY - 40, fill)
    );
  shapes.push(
    shape.rect(bx - 40, panelBottom - 40, bw + 80, 120, shade(0.3), 40)
  );
  shapes.push(shape.rect(0, h - 90, w, 90, shade(0.3), 45));
  shapes.push(shape.rect(w / 2 - 200, h - 60, 400, 24, tint(0.4), 12));
  const labels = [cta(o, [bx + 80, pb + 40, bw - 160, 180], fill)];
  labels.push(...note(o, [bx + 100, panelY + 60, bw - 200, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A card reader: the code on its screen, a keypad under it and a card slot on top. */
export function paymentTerminal(o) {
  const w = 1300;
  const screenX = 90;
  const screenW = w - 180;
  const screenY = 120;
  const size = 900;
  const pad = size * 0.08;
  const head = o.note ? 150 : 60;
  const qy = screenY + head + pad;
  const pb = qy + size + pad;
  const screenH = pb + 230 - screenY;
  const keysY = screenY + screenH + 60;
  const h = keysY + 280 + 60;
  const shapes = [
    shape.rect(0, 40, w, h - 40, F, 80),
    shape.rect(w / 2 - 300, 0, 600, 70, shade(0.35), 20),
    shape.rect(w / 2 - 260, 24, 520, 22, BG, 11),
    shape.rect(screenX, screenY, screenW, screenH, BG, 36),
  ];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const kx = screenX + col * ((screenW - 60) / 4 + 20);
      const ky = keysY + row * 100;
      shapes.push(
        shape.rect(
          kx,
          ky,
          (screenW - 60) / 4,
          80,
          col === 3 && row === 2 ? AC : tint(0.35),
          18
        )
      );
    }
  }
  const labels = [cta(o, [screenX + 60, pb + 30, screenW - 120, 170], BG)];
  labels.push(...note(o, [screenX + 80, screenY + 40, screenW - 160, 96], BG));
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

// ── More label styles and borders ───────────────────────────────────────────

/** A card with a pill badge straddling its bottom edge for the label. */
export function badgeBottom(o) {
  const w = 1300;
  const head = o.note ? 170 : 60;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const cardBottom = pb + 150;
  const h = cardBottom + 110;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [shape.rect(0, 0, w, cardBottom, F, 48)];
  if (o.light)
    shapes.push(shape.rect(30, 30, w - 60, cardBottom - 60, fill, 30));
  shapes.push(shape.rect(150, cardBottom - 110, w - 300, 220, AC, 110));
  const labels = [cta(o, [210, cardBottom - 85, w - 420, 170], AC)];
  labels.push(...note(o, [100, 50, w - 200, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A card with a ribbon banner with folded tails across the top. */
export function ribbonTop(o) {
  const w = 1400;
  const bandY = 90;
  const bandH = 220;
  const qy = bandY + bandH + 100 + PAD;
  const pb = qy + QR + PAD;
  const h = o.note ? pb + 180 : pb + 60;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [shape.rect(100, 0, w - 200, h, F, 48)];
  if (o.light) shapes.push(shape.rect(130, 30, w - 260, h - 60, fill, 30));
  // Tails folded behind, then the band over them
  for (const [x, dir] of [
    [0, 1],
    [w, -1],
  ]) {
    shapes.push(
      shape.path(
        path().poly([
          [x, bandY + 30],
          [x + dir * 180, bandY + 30],
          [x + dir * 180, bandY + bandH + 30],
          [x, bandY + bandH + 30],
          [x + dir * 70, bandY + bandH / 2 + 30],
        ]),
        AC
      )
    );
    shapes.push(
      shape.path(
        path().poly([
          [x + dir * 100, bandY + bandH],
          [x + dir * 180, bandY + bandH + 30],
          [x + dir * 180, bandY + bandH],
        ]),
        shade(0.5)
      )
    );
  }
  shapes.push(shape.rect(100, bandY, w - 200, bandH, AC));
  const labels = [cta(o, [160, bandY + 25, w - 320, 170], AC)];
  labels.push(...note(o, [180, pb + 40, w - 360, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A plain outline border of a chosen weight, the label under the code. */
export function outlineBorder(o) {
  const weight = o.weight ?? 40;
  const w = 1200;
  const head = o.note ? 170 : 40;
  const qy = weight + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 230 + weight;
  const inset = weight;
  const shapes = [
    shape.rect(0, 0, w, h, F, Math.max(8, weight / 2), {
      x: inset,
      y: inset,
      width: w - 2 * inset,
      height: h - 2 * inset,
      radius: Math.max(2, weight / 4),
    }),
  ];
  const labels = [
    cta(o, [weight + 60, pb + 30, w - 2 * weight - 120, 170], BG),
  ];
  labels.push(
    ...note(o, [weight + 80, weight + 50, w - 2 * weight - 160, 100], BG)
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A round viewfinder: four arcs of a ring around the code, the label below. */
export function circleViewfinder(o) {
  const w = 1700;
  const cx = w / 2;
  const cy = 830;
  const R = 800;
  const size = 860;
  const qy = cy - size / 2;
  const h = cy + R + 290;
  const shapes = [];
  for (let i = 0; i < 4; i++) {
    const a0 = i * 90 + 12;
    const a1 = (i + 1) * 90 - 12;
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const a = ((a0 + ((a1 - a0) * k) / 24) * Math.PI) / 180;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    shapes.push(line(pts, 44, F));
  }
  // Crosshair ticks at the four compass points
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    shapes.push(
      line(
        [
          [cx + dx * (R - 90), cy + dy * (R - 90)],
          [cx + dx * (R + 10), cy + dy * (R + 10)],
        ],
        24,
        AC
      )
    );
  }
  const labels = [cta(o, [150, cy + R + 70, w - 300, 170], BG)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A hand-sketched circle: two wobbly rings around the code, the label below. */
export function sketchCircle(o) {
  const w = 1700;
  const cx = w / 2;
  const cy = 830;
  const size = 860;
  const qy = cy - size / 2;
  const h = cy + 800 + 290;
  const ring = (R, seed, width, fill) => {
    const pts = [];
    const n = 72;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2 + seed;
      const r =
        R + (noise(k % n, seed) - 0.5) * 22 + Math.sin(a * 3 + seed) * 10;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts.push([...pts[1]]);
    return line(pts, width, fill);
  };
  const shapes = [ring(790, 0.4, 14, F), ring(760, 2.1, 9, AC)];
  const labels = [cta(o, [150, cy + 800 + 70, w - 300, 170], BG)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A big starburst behind the code, the label on a band across its foot. */
export function burstSurround(o) {
  const w = 1800;
  const h = 1800;
  const cx = w / 2;
  const cy = 900;
  const pts = [];
  const n = 28;
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? 880 : 700;
    const a = (-90 + (180 / n) * i) * (Math.PI / 180);
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.poly(pts, F)];
  if (o.light) shapes.push(shape.circle(cx, cy, 660, fill));
  const size = 900;
  const pad = size * 0.08;
  const qy = cy - 60 - size / 2;
  const pb = qy + size + pad;
  shapes.push(shape.rect(cx - 560, pb + 20, 1120, 180, AC, 90));
  const labels = [cta(o, [cx - 500, pb + 25, 1000, 170], AC)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** Curved rays spinning out from behind the code, the label on a band below. */
export function spinSurround(o) {
  const w = 1800;
  const h = 1800;
  const cx = w / 2;
  const cy = 900;
  const shapes = [];
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const r = 620 + t * 240;
      const a = a0 + t * 0.9;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    shapes.push(line(pts, 34 - 12 * (i % 2), i % 2 ? AC : F));
  }
  const size = 900;
  const pad = size * 0.08;
  const qy = cy - 60 - size / 2;
  const pb = qy + size + pad;
  shapes.push(shape.rect(cx - 560, pb + 20, 1120, 180, F, 90));
  const labels = [cta(o, [cx - 500, pb + 25, 1000, 170], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A globe on a stand: the code on the sphere, meridian and equator lines behind it. */
export function globeStand(o) {
  const w = 1600;
  const cx = w / 2;
  const cy = 760;
  const R = 720;
  const size = 800;
  const qy = cy - size / 2;
  const h = 1960;
  const fill = o.light ? tint(0.92) : tint(0.7);
  const shapes = [
    // The meridian ring, tilted, behind the sphere
    shape.path(
      strokeLine(
        bezier(
          [cx - 300, 60],
          [cx - 1200, 300],
          [cx + 1200, 1400],
          [cx + 300, 1500],
          36
        ),
        40,
        { round: true }
      ),
      shade(0.3)
    ),
    shape.circle(cx, cy, R, F),
    shape.circle(cx, cy, R - 36, fill),
  ];
  // Latitude lines and a few land shapes, under the plate
  for (const dy of [-420, -210, 210, 420]) {
    const half = Math.sqrt((R - 36) ** 2 - dy ** 2);
    shapes.push(shape.rect(cx - half, cy + dy - 6, 2 * half, 12, tint(0.5)));
  }
  shapes.push(shape.rect(cx - 90, cy + R - 40, 180, 160, shade(0.3), 20));
  shapes.push(shape.rect(cx - 520, h - 120, 1040, 120, F, 60));
  const labels = [cta(o, [cx - 460, h - 115, 920, 110], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A video player: the code is the video, with a play button and progress bar. */
export function videoPlayer(o) {
  const w = 1400;
  const head = o.note ? 160 : 40;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const barY = pb + 40;
  const h = barY + 300;
  const shapes = [
    shape.rect(0, 0, w, h, F, 40),
    shape.rect(60, barY, w - 120, 14, tint(0.4), 7),
    shape.rect(60, barY, 520, 14, AC, 7),
    shape.circle(580, barY + 7, 30, T),
    // Play button and a volume mark
    shape.path(
      path().poly([
        [80, barY + 70],
        [80, barY + 230],
        [230, barY + 150],
      ]),
      T
    ),
    shape.rect(w - 200, barY + 110, 40, 80, T, 6),
    shape.path(
      path().poly([
        [w - 160, barY + 150],
        [w - 90, barY + 90],
        [w - 90, barY + 210],
      ]),
      T
    ),
  ];
  const labels = [cta(o, [300, barY + 70, w - 560, 160], F)];
  labels.push(...note(o, [100, 40, w - 200, 100], F, { align: "start" }));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A music player: the code as the album art, a track bar and play controls. */
export function musicPlayer(o) {
  const w = 1300;
  const qy = 120 + PAD;
  const pb = qy + QR + PAD;
  const textY = pb + 30;
  const barY = textY + 300;
  const h = barY + 220;
  const fill = o.light ? tint(0.92) : F;
  const shapes = [shape.rect(0, 0, w, h, F, 60)];
  if (o.light) shapes.push(shape.rect(26, 26, w - 52, h - 52, fill, 44));
  shapes.push(shape.rect(130, barY, w - 260, 12, tint(0.5), 6));
  shapes.push(shape.rect(130, barY, 380, 12, AC, 6));
  shapes.push(shape.circle(510, barY + 6, 26, AC));
  const ink = o.light ? F : T;
  // Previous, play, next
  const cy = barY + 130;
  shapes.push(shape.circle(w / 2, cy, 80, ink));
  shapes.push(
    shape.path(
      path().poly([
        [w / 2 - 22, cy - 40],
        [w / 2 - 22, cy + 40],
        [w / 2 + 44, cy],
      ]),
      o.light ? fill : F
    )
  );
  for (const dir of [-1, 1]) {
    const x = w / 2 + dir * 260;
    shapes.push(
      shape.path(
        path().poly([
          [x - dir * 50, cy - 40],
          [x - dir * 50, cy + 40],
          [x + dir * 30, cy],
        ]),
        ink
      )
    );
    shapes.push(shape.rect(x + dir * 30 - 8, cy - 40, 16, 80, ink));
  }
  const labels = [cta(o, [120, textY, w - 240, 170], fill)];
  labels.push(...note(o, [140, textY + 180, w - 280, 100], fill));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A round tag with an eyelet and a loop of string, the label under the code. */
export function roundTag(o) {
  const w = 1800;
  const cx = w / 2;
  const cy = 1030;
  const R = 850;
  const size = 900;
  const pad = size * 0.08;
  const qy = cy - 100 - size / 2;
  const pb = qy + size + pad;
  const h = 1900;
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    line(
      bezier([cx, 170], [cx - 300, -60], [cx + 500, -40], [cx + 60, 150], 24),
      16,
      tint(0.45)
    ),
    shape.circle(cx, cy, R, F),
  ];
  if (o.light) shapes.push(shape.circle(cx, cy, R - 44, fill));
  shapes.push(shape.circle(cx, cy - R + 110, 56, BG));
  shapes.push(shape.circle(cx, cy - R + 110, 56, o.light ? F : tint(0.5), 40));
  const labels = [cta(o, [cx - 460, pb + 24, 920, 160], fill)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

// ── Playful ─────────────────────────────────────────────────────────────────

/** A rocket with a square window on its side, the code in the window. */
export function rocketWindow(o) {
  const w = 1800;
  const h = 2000;
  const bl = 220;
  const br = w - 220;
  const cx = w / 2;
  const shapes = [
    // Fins
    shape.path(
      path().poly([
        [bl, 1420],
        [0, 1900],
        [0, 1990],
        [bl, 1960],
      ]),
      AC
    ),
    shape.path(
      path().poly([
        [br, 1420],
        [w, 1900],
        [w, 1990],
        [br, 1960],
      ]),
      AC
    ),
    // Nozzle
    shape.rect(cx - 220, 1880, 440, 120, shade(0.4), 30),
    // Body and nose
    shape.rect(bl, 420, br - bl, 1540, F, 60),
    shape.path(
      path()
        .M(bl, 460)
        .C(bl + 80, 180, cx - 240, 0, cx, 0)
        .C(cx + 240, 0, br - 80, 180, br, 460)
        .Z(),
      AC
    ),
    // Window rim and glass
    shape.rect(cx - 640, 480, 1280, 1280, tint(0.55), 120),
    shape.rect(cx - 590, 530, 1180, 1180, BG, 90),
  ];
  const qy = 620;
  const labels = [cta(o, [bl + 80, 1770, br - bl - 160, 160], F)];
  return { w, h, qr: qrAt(cx - QR / 2, qy), shapes, labels };
}

/** A retro TV set: the code on its screen, knobs on the side, antennas on top. */
export function tvSet(o) {
  const w = 1700;
  const bodyY = 200;
  const bodyH = 1700;
  const h = 2000;
  const screenX = 100;
  const screenW = 1240;
  const head = o.note ? 120 : 40;
  const qy = bodyY + 100 + head + PAD;
  const pb = qy + QR + PAD;
  const shapes = [
    line(
      [
        [640, bodyY + 20],
        [420, 10],
      ],
      24,
      shade(0.3)
    ),
    line(
      [
        [760, bodyY + 20],
        [980, 10],
      ],
      24,
      shade(0.3)
    ),
    shape.circle(420, 20, 20, shade(0.3)),
    shape.circle(980, 20, 20, shade(0.3)),
    shape.rect(260, bodyY + bodyH - 20, 120, 120, shade(0.3), 20),
    shape.rect(w - 380, bodyY + bodyH - 20, 120, 120, shade(0.3), 20),
    shape.rect(0, bodyY, w, bodyH, F, 90),
    shape.rect(screenX, bodyY + 100, screenW, bodyH - 200, BG, 70),
  ];
  // Control panel: two knobs and a speaker grille
  const px = screenX + screenW + 80;
  shapes.push(shape.circle(px + 100, bodyY + 260, 80, tint(0.5)));
  shapes.push(shape.circle(px + 100, bodyY + 260, 28, F));
  shapes.push(shape.circle(px + 100, bodyY + 500, 80, tint(0.5)));
  shapes.push(shape.circle(px + 100, bodyY + 500, 28, F));
  for (let i = 0; i < 7; i++) {
    shapes.push(
      shape.rect(px + 30, bodyY + 700 + i * 80, 140, 24, tint(0.45), 12)
    );
  }
  const labels = [cta(o, [screenX + 100, pb + 30, screenW - 200, 160], BG)];
  labels.push(...note(o, [screenX + 120, bodyY + 130, screenW - 240, 96], BG));
  return { w, h, qr: qrAt(screenX + (screenW - QR) / 2, qy), shapes, labels };
}

/** An arcade cabinet: a marquee on top, the code on the screen, a joystick below. */
export function arcadeCabinet(o) {
  const w = 1500;
  const h = 2000;
  const size = 900;
  const pad = size * 0.08;
  const qy = 240 + 40 + pad;
  const pb = qy + size + pad;
  const shapes = [
    shape.rect(0, 0, w, h, F, 50),
    shape.rect(40, 0, w - 80, 200, AC, 30),
    shape.rect(200, 240, w - 400, 1380, BG, 30),
    // Control deck: a joystick at the left, three buttons at the right
    shape.rect(60, 1660, w - 120, 160, shade(0.35), 30),
    shape.rect(130, 1560, 36, 140, tint(0.5), 12),
    shape.circle(148, 1540, 64, AC),
  ];
  for (const x of [980, 1140, 1300]) {
    shapes.push(shape.circle(x, 1740, 46, tint(0.55)));
  }
  shapes.push(shape.rect(w / 2 - 120, 1880, 240, 36, tint(0.4), 18));
  const labels = [cta(o, [260, pb + 26, w - 520, 160], BG)];
  labels.push(...note(o, [100, 40, w - 200, 120], AC, { weight: "bold" }));
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

/** A record sleeve with the vinyl peeking out, the code as the cover art. Wide. */
export function vinylSleeve(o) {
  const w = 1960;
  const h = 1560;
  const sleeve = 1400;
  const top = 80;
  const disc = [sleeve - 80, top + sleeve / 2, 640];
  const fill = o.light ? tint(0.92) : F;
  const shapes = [
    shape.circle(disc[0], disc[1], disc[2], shade(0.4)),
    shape.circle(disc[0], disc[1], disc[2] - 60, tint(0.3), disc[2] - 70),
    shape.circle(disc[0], disc[1], disc[2] - 160, tint(0.3), disc[2] - 170),
    shape.circle(disc[0], disc[1], disc[2] - 260, tint(0.3), disc[2] - 270),
    shape.circle(disc[0], disc[1], 210, AC),
    shape.circle(disc[0], disc[1], 30, BG),
    shape.rect(0, top, sleeve, sleeve, F, 16),
  ];
  if (o.light)
    shapes.push(shape.rect(24, top + 24, sleeve - 48, sleeve - 48, fill, 8));
  const size = 900;
  const pad = size * 0.08;
  const qy = top + 150 + pad;
  const pb = qy + size + pad;
  const labels = [cta(o, [120, pb + 20, sleeve - 240, 150], fill)];
  labels.push(...note(o, [140, top + 44, sleeve - 280, 96], fill));
  return { w, h, qr: qrSized((sleeve - size) / 2, qy, size), shapes, labels };
}

/** A cassette tape: the code on its label, two reels in the window below. Wide. */
export function cassette(o) {
  const w = 2000;
  const h = 1500;
  const stickerY = 90;
  const stickerH = 1040;
  const paper = tint(0.92);
  const shapes = [
    shape.rect(0, 0, w, h, F, 70),
    shape.rect(80, stickerY, w - 160, stickerH, paper, 30),
    shape.rect(80, stickerY, w - 160, 70, AC),
    // Reel window
    shape.rect(420, 1170, w - 840, 240, shade(0.35), 120),
  ];
  for (const x of [640, w - 640]) {
    shapes.push(shape.circle(x, 1290, 95, BG));
    shapes.push(shape.circle(x, 1290, 95, paper, 62));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      shapes.push(
        line(
          [
            [x + Math.cos(a) * 40, 1290 + Math.sin(a) * 40],
            [x + Math.cos(a) * 62, 1290 + Math.sin(a) * 62],
          ],
          14,
          F
        )
      );
    }
  }
  for (const x of [60, w - 60])
    shapes.push(shape.circle(x, h - 60, 22, tint(0.4)));
  const qx = 160;
  const qy = stickerY + 100 + 64;
  const tx = qx + 800 + 64 + 80;
  const tw = w - tx - 160;
  const labels = [cta(o, [tx, stickerY + 360, tw, 200], paper)];
  labels.push(...note(o, [tx, stickerY + 600, tw, 110], paper));
  return { w, h, qr: wideQr(qx, qy), shapes, labels };
}

/** An open pizza box: the note on the lid, the code and label in the base. */
export function pizzaBox(o) {
  const w = 1500;
  const lidH = 520;
  const baseY = 540;
  const head = 60;
  const qy = baseY + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 230;
  const card = tint(0.85);
  const shapes = [
    shape.path(
      path().poly([
        [120, 0],
        [w - 120, 0],
        [w, lidH],
        [0, lidH],
      ]),
      F
    ),
    shape.path(
      path().poly([
        [170, 40],
        [w - 170, 40],
        [w - 50, lidH - 40],
        [50, lidH - 40],
      ]),
      card
    ),
    shape.rect(0, baseY - 20, w, 60, shade(0.35)),
    shape.rect(0, baseY, w, h - baseY, F, 20),
    shape.rect(40, baseY + 30, w - 80, h - baseY - 60, card, 12),
  ];
  const labels = [cta(o, [100, pb + 30, w - 200, 170], card)];
  labels.push(
    ...note(o, [220, lidH / 2 - 60, w - 440, 120], card, { weight: "bold" })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A fish tank: the code in the water, a plant and bubbles beside it, gravel below. */
export function fishTank(o) {
  const w = 1700;
  const h = 1760;
  const rim = 70;
  const water = tint(0.92);
  const head = 70;
  const qy = rim + head + PAD;
  const pb = qy + QR + PAD;
  const shapes = [
    shape.rect(0, 0, w, h, F, 30),
    shape.rect(40, rim, w - 80, h - rim - 130, water),
    shape.rect(40, h - 130, w - 80, 60, tint(0.55)),
  ];
  for (let i = 0; i < 16; i++) {
    const x = 90 + ((w - 180) * i) / 15 + (i % 2) * 20;
    shapes.push(
      shape.circle(x, h - 150 + (i % 3) * 12, 34, i % 3 === 0 ? AC : tint(0.4))
    );
  }
  // A plant at the left
  for (const [dx, hgt, bend] of [
    [0, 560, -60],
    [60, 700, 30],
    [120, 500, 80],
  ]) {
    shapes.push(
      shape.path(
        strokeLine(
          quad(
            [150 + dx, h - 150],
            [150 + dx + bend, h - 150 - hgt / 2],
            [150 + dx + bend * 0.6, h - 150 - hgt],
            16
          ),
          44,
          { taper: true }
        ),
        AC
      )
    );
  }
  // Bubbles rising at the right
  for (const [x, y, r] of [
    [w - 180, h - 420, 28],
    [w - 140, h - 560, 20],
    [w - 200, h - 680, 34],
    [w - 150, h - 840, 22],
  ]) {
    shapes.push(shape.circle(x, y, r, F, r - 8));
  }
  const labels = [cta(o, [300, pb + 20, w - 600, 150], water)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A gumball machine: the code in the jar among gumballs, the label on the base. */
export function gumballMachine(o) {
  const w = 1500;
  const h = 2000;
  const jarX = 100;
  const jarW = w - 200;
  const jarY = 120;
  const jarH = 1400;
  const qy = jarY + 120 + PAD;
  const shapes = [
    shape.rect(w / 2 - 160, 0, 320, 160, F, 60),
    shape.rect(jarX, jarY, jarW, jarH, F, 300),
    shape.rect(jarX + 40, jarY + 40, jarW - 80, jarH - 80, BG, 260),
  ];
  // Gumballs around the inside of the jar
  let k = 0;
  const ball = (x, y) => {
    const r = 40 + (k % 3) * 8;
    shapes.push(
      shape.circle(x, y, r, k % 4 === 0 ? AC : tint(0.3 + (k % 3) * 0.2))
    );
    k += 1;
  };
  for (let i = 0; i < 9; i++) {
    ball(jarX + 160 + ((jarW - 320) * i) / 8, jarY + 120 + (i % 2) * 24);
    ball(jarX + 160 + ((jarW - 320) * i) / 8, jarY + jarH - 120 - (i % 2) * 24);
  }
  for (let i = 1; i < 10; i++) {
    ball(jarX + 110 + (i % 2) * 20, jarY + 120 + ((jarH - 240) * i) / 10);
    ball(
      jarX + jarW - 110 - (i % 2) * 20,
      jarY + 120 + ((jarH - 240) * i) / 10
    );
  }
  // Base with the coin slot and the chute
  shapes.push(
    shape.rect(jarX + 80, jarY + jarH - 10, jarW - 160, 60, shade(0.4))
  );
  shapes.push(
    shape.rect(jarX, jarY + jarH + 40, jarW, h - jarY - jarH - 40, F, 60)
  );
  shapes.push(
    shape.rect(w / 2 - 120, jarY + jarH + 80, 240, 40, tint(0.5), 20)
  );
  shapes.push(shape.rect(w / 2 - 150, h - 160, 300, 100, tint(0.5), 30));
  const labels = [cta(o, [jarX + 80, jarY + jarH + 150, jarW - 160, 150], F)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A camera viewfinder display: brackets, a recording dot and a status bar. */
export function viewfinderHud(o) {
  const w = 1500;
  const h = 1760;
  const qy = 220 + PAD;
  const shapes = [shape.rect(0, 0, w, h, F, 24)];
  const len = 160;
  const t = 26;
  for (const [x, y, dx, dy] of [
    [90, 90, 1, 1],
    [w - 90, 90, -1, 1],
    [90, h - 260, 1, -1],
    [w - 90, h - 260, -1, -1],
  ]) {
    shapes.push(
      shape.rect(dx > 0 ? x : x - len, dy > 0 ? y : y - t, len, t, T)
    );
    shapes.push(
      shape.rect(dx > 0 ? x : x - t, dy > 0 ? y : y - len, t, len, T)
    );
  }
  shapes.push(shape.circle(w / 2 - 80, 150, 30, AC));
  shapes.push(shape.rect(w / 2 - 20, 130, 220, 40, T, 8));
  shapes.push(shape.rect(w - 300, 125, 150, 50, T, 10));
  shapes.push(shape.rect(w - 290, 135, 100, 30, AC, 4));
  shapes.push(shape.rect(w - 148, 140, 12, 20, T, 3));
  shapes.push(shape.rect(0, h - 200, w, 200, shade(0.4)));
  const labels = [cta(o, [100, h - 185, w - 200, 170], F)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A comic panel with a burst over its corner for the note and a caption box. */
export function comicPanel(o) {
  const w = 1500;
  const head = 360;
  const qy = 60 + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 260;
  const shapes = [
    shape.rect(60, 60, w - 120, h - 120, F, 10),
    shape.rect(100, 100, w - 200, h - 200, BG, 2),
    // Halftone dots in the lower left corner
  ];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6 - i; j++) {
      shapes.push(
        shape.circle(
          140 + j * 46,
          h - 140 - i * 46,
          10 + (5 - i - j),
          tint(0.5)
        )
      );
    }
  }
  // Caption box
  shapes.push(shape.rect(300, pb + 40, w - 600, 170, tint(0.85)));
  shapes.push(
    shape.rect(300, pb + 40, w - 600, 170, F, 0, {
      x: 312,
      y: pb + 52,
      width: w - 624,
      height: 146,
    })
  );
  // Burst over the top-right corner
  const bx = w - 340;
  const by = 220;
  const pts = [];
  const n = 16;
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? 280 : 215;
    const a = (-90 + (180 / n) * i) * (Math.PI / 180);
    pts.push([bx + rad * Math.cos(a) * 1.15, by + rad * Math.sin(a) * 0.68]);
  }
  shapes.push(shape.poly(pts, F));
  shapes.push(
    shape.poly(
      pts.map(([x, y]) => [bx + (x - bx) * 0.88, by + (y - by) * 0.84]),
      AC
    )
  );
  const labels = [cta(o, [320, pb + 50, w - 640, 150], tint(0.85))];
  labels.push(
    ...note(o, [bx - 250, by - 55, 500, 110], AC, { weight: "bold" })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A jigsaw piece: knobs out on the top and right, sockets in on the left and bottom. */
export function jigsawPiece(o) {
  const w = 1800;
  const h = 2000;
  const x0 = 140;
  const x1 = 1640;
  const y0 = 180;
  const y1 = 1880;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const piece = (inset) => {
    const p = path().rrect(
      x0 + inset,
      y0 + inset,
      x1 - x0 - 2 * inset,
      y1 - y0 - 2 * inset,
      40
    );
    p.circle(mx, y0 + inset, 150 - inset);
    p.circle(x1 - inset, my, 150 - inset);
    p.circle(x0 + inset, my, 120 + inset, true);
    p.circle(mx, y1 - inset, 120 + inset, true);
    return p;
  };
  const fill = o.light ? tint(0.9) : F;
  const shapes = [shape.path(piece(0), F)];
  if (o.light) shapes.push(shape.path(piece(40), fill));
  const qy = 520;
  const labels = [cta(o, [mx - 550, 230, 1100, 170], fill)];
  return { w, h, qr: qrAt(mx - QR / 2, qy), shapes, labels };
}

/** A passport-style entry stamp: double outline, a plane in the corner. */
export function passportStamp(o) {
  const w = 1400;
  const head = 200;
  const qy = 60 + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 280;
  const shapes = [
    shape.rect(0, 0, w, h, F, 60, {
      x: 26,
      y: 26,
      width: w - 52,
      height: h - 52,
      radius: 40,
    }),
    shape.rect(56, 56, w - 112, h - 112, F, 30, {
      x: 66,
      y: 66,
      width: w - 132,
      height: h - 132,
      radius: 22,
    }),
    shape.rect(120, 60 + head - 20, w - 240, 8, F),
    shape.rect(120, pb + 30, w - 240, 8, F),
    ...motif("plane", w - 230, 170, 150, AC, AC),
  ];
  const labels = [cta(o, [120, pb + 60, w - 240, 170], BG)];
  labels.push(
    ...note(o, [120, 90, w - 480, 110], BG, { align: "start", weight: "bold" })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A treasure map: torn parchment, a dashed trail to an X, a compass rose. */
export function treasureMap(o) {
  const w = 1600;
  const h = 1800;
  const qy = 200 + PAD;
  const pb = qy + QR + PAD;
  const paper = tint(0.9);
  const edge = () => {
    const pts = [];
    const n = 18;
    const sides = [
      [
        [0, 0],
        [w, 0],
      ],
      [
        [w, 0],
        [w, h],
      ],
      [
        [w, h],
        [0, h],
      ],
      [
        [0, h],
        [0, 0],
      ],
    ];
    sides.forEach(([[ax, ay], [bx, by]], side) => {
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const j = 14 + noise(k + side * 30, 5) * 26;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t;
        pts.push([
          ax === bx ? (ax === 0 ? x + j : x - j) : x,
          ay === by ? (ay === 0 ? y + j : y - j) : y,
        ]);
      }
    });
    return pts;
  };
  const shapes = [shape.poly(edge(), paper)];
  // The trail: from the top-left corner down the left side to the X
  const trail = [
    [120, 140],
    [90, 500],
    [160, 900],
    [100, 1300],
    [220, 1560],
  ];
  for (let i = 0; i < trail.length - 1; i++) {
    const [a, b] = [trail[i], trail[i + 1]];
    shapes.push(
      shape.line(a[0], a[1], b[0], b[1], 14, F, {
        cap: "round",
        dash: [36, 30],
      })
    );
  }
  shapes.push(
    line(
      [
        [200, 1520],
        [330, 1650],
      ],
      34,
      AC
    )
  );
  shapes.push(
    line(
      [
        [330, 1520],
        [200, 1650],
      ],
      34,
      AC
    )
  );
  shapes.push(...motif("compass", w - 220, 220, 220, F, AC));
  const labels = [cta(o, [360, pb + 40, w - 560, 170], paper)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A hot-air balloon: the code on the envelope, the label on the basket. */
export function balloonBasket(o) {
  const w = 1600;
  const h = 2000;
  const cx = w / 2;
  const cy = 800;
  const rx = 740;
  const ry = 780;
  const size = 800;
  const qy = cy - 40 - size / 2;
  const shapes = [
    shape.ellipse(cx, cy, rx, ry, F),
    // Gores: two curved seams and a lighter middle panel
    shape.ellipse(cx, cy, rx * 0.55, ry, tint(0.25)),
    shape.ellipse(cx, cy, rx * 0.2, ry, F),
    // Throat, ropes and basket
    shape.path(
      path().poly([
        [cx - 240, cy + ry - 60],
        [cx + 240, cy + ry - 60],
        [cx + 150, cy + ry + 90],
        [cx - 150, cy + ry + 90],
      ]),
      shade(0.35)
    ),
    line(
      [
        [cx - 150, cy + ry + 90],
        [cx - 300, 1760],
      ],
      14,
      tint(0.4)
    ),
    line(
      [
        [cx + 150, cy + ry + 90],
        [cx + 300, 1760],
      ],
      14,
      tint(0.4)
    ),
    shape.rect(cx - 360, 1740, 720, 220, shade(0.3), 40),
    shape.rect(cx - 360, 1740, 720, 50, F, 25),
  ];
  const labels = [cta(o, [cx - 320, 1790, 640, 150], shade(0.3))];
  labels.push(...note(o, [cx - 400, 110, 800, 100], F));
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A robot with a screen on its chest showing the code. */
export function robotChest(o) {
  const w = 1660;
  const h = 2000;
  const cx = w / 2;
  const bx = 180;
  const bw = w - 360;
  const bodyY = 500;
  const bodyH = 1380;
  const size = 900;
  const pad = size * 0.08;
  const qy = bodyY + 60 + pad;
  const pb = qy + size + pad;
  const shapes = [
    // Antenna and head
    line(
      [
        [cx, 110],
        [cx, 30],
      ],
      20,
      shade(0.3)
    ),
    shape.circle(cx, 30, 30, AC),
    shape.rect(cx - 300, 100, 600, 360, F, 90),
    shape.rect(cx - 250, 150, 500, 260, tint(0.5), 60),
    shape.circle(cx - 110, 280, 50, F),
    shape.circle(cx + 110, 280, 50, F),
    shape.rect(cx - 60, 380, 120, 20, F, 10),
    shape.rect(cx - 80, 450, 160, 60, shade(0.3)),
    // Arms
    shape.rect(0, bodyY + 60, 160, 900, shade(0.3), 70),
    shape.rect(w - 160, bodyY + 60, 160, 900, shade(0.3), 70),
    shape.circle(80, bodyY + 1000, 90, F),
    shape.circle(w - 80, bodyY + 1000, 90, F),
    // Body and chest screen
    shape.rect(bx, bodyY, bw, bodyH, F, 80),
    shape.rect(bx + 60, bodyY + 60, bw - 120, pb + 190 - bodyY - 60, BG, 40),
    // Feet
    shape.rect(bx + 120, h - 120, 340, 120, shade(0.3), 40),
    shape.rect(w - bx - 460, h - 120, 340, 120, shade(0.3), 40),
  ];
  const labels = [cta(o, [bx + 120, pb + 20, bw - 240, 160], BG)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A monster's open mouth holding the code, eyes on top, teeth all round. */
export function monsterMouth(o) {
  const w = 1700;
  const h = 2000;
  const cx = w / 2;
  const mouthY = 380;
  const mouthH = 1540;
  const qy = 580;
  const shapes = [
    shape.ellipse(cx, 1040, 850, 960, tint(0.4)),
    shape.circle(cx - 300, 200, 140, BG),
    shape.circle(cx + 300, 200, 140, BG),
    shape.circle(cx - 300, 200, 140, F, 126),
    shape.circle(cx + 300, 200, 140, F, 126),
    shape.circle(cx - 270, 220, 60, F),
    shape.circle(cx + 330, 220, 60, F),
    shape.rect(150, mouthY, w - 300, mouthH, F, 220),
  ];
  for (let i = 0; i < 7; i++) {
    const x = 300 + ((w - 600) * i) / 6;
    shapes.push(
      shape.poly(
        [
          [x - 70, mouthY],
          [x + 70, mouthY],
          [x, mouthY + 90],
        ],
        BG
      )
    );
    shapes.push(
      shape.poly(
        [
          [x - 70, mouthY + mouthH],
          [x + 70, mouthY + mouthH],
          [x, mouthY + mouthH - 80],
        ],
        BG
      )
    );
  }
  const labels = [cta(o, [cx - 500, 1690, 1000, 150], F)];
  return { w, h, qr: qrAt(cx - QR / 2, qy), shapes, labels };
}

/** A crystal ball on a stand, the code glowing inside it, the label on the base. */
export function crystalBall(o) {
  const w = 1600;
  const h = 1860;
  const cx = w / 2;
  const cy = 760;
  const R = 720;
  const size = 800;
  const qy = cy - size / 2;
  const shapes = [
    shape.circle(cx, cy, R, F),
    shape.circle(cx, cy, R - 40, tint(0.92)),
    shape.ellipse(cx - 330, cy - 380, 150, 70, BG),
    ...motif("icon:sparkle", cx - 520, cy + 300, 90, AC, AC),
    ...motif("icon:star", cx + 540, cy - 80, 80, AC, AC),
    // Stand
    shape.path(
      path().poly([
        [cx - 420, 1480],
        [cx + 420, 1480],
        [cx + 520, h - 60],
        [cx - 520, h - 60],
      ]),
      F
    ),
    shape.rect(cx - 560, h - 90, 1120, 90, shade(0.3), 45),
  ];
  const labels = [cta(o, [cx - 400, 1540, 800, 170], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A cat peeking over a card it holds with both paws. */
export function catHolding(o) {
  const w = 1500;
  const h = 2000;
  const cx = 720;
  const cardX = 70;
  const cardW = 1300;
  const cardY = 440;
  const qy = cardY + 40 + PAD;
  const pb = qy + QR + PAD;
  const cardH = pb + 200 - cardY;
  const fur = shade(0.25);
  const fill = o.light ? tint(0.9) : F;
  const shapes = [
    // Tail curling out from behind the card
    shape.path(
      strokeLine(
        bezier(
          [cardX + cardW - 60, 1500],
          [w + 60, 1400],
          [w - 40, 900],
          [w - 180, 760],
          24
        ),
        70,
        { round: true }
      ),
      fur
    ),
    // Ears and head
    shape.poly(
      [
        [cx - 230, 140],
        [cx - 190, -0],
        [cx - 60, 110],
      ],
      fur
    ),
    shape.poly(
      [
        [cx + 230, 140],
        [cx + 190, 0],
        [cx + 60, 110],
      ],
      fur
    ),
    shape.circle(cx, 260, 240, fur),
    shape.ellipse(cx - 90, 240, 42, 56, BG),
    shape.ellipse(cx + 90, 240, 42, 56, BG),
    shape.ellipse(cx - 90, 246, 16, 40, F),
    shape.ellipse(cx + 90, 246, 16, 40, F),
    shape.poly(
      [
        [cx - 30, 320],
        [cx + 30, 320],
        [cx, 350],
      ],
      BG
    ),
    line(
      [
        [cx - 110, 350],
        [cx - 330, 320],
      ],
      8,
      BG
    ),
    line(
      [
        [cx - 110, 370],
        [cx - 330, 390],
      ],
      8,
      BG
    ),
    line(
      [
        [cx + 110, 350],
        [cx + 330, 320],
      ],
      8,
      BG
    ),
    line(
      [
        [cx + 110, 370],
        [cx + 330, 390],
      ],
      8,
      BG
    ),
    // Neck behind the card
    shape.rect(cx - 170, 420, 340, 120, fur),
    shape.rect(cardX, cardY, cardW, cardH, F, 40),
  ];
  if (o.light)
    shapes.push(
      shape.rect(cardX + 28, cardY + 28, cardW - 56, cardH - 56, fill, 24)
    );
  // Paws over the card's bottom corners
  for (const px of [cardX + 110, cardX + cardW - 110]) {
    shapes.push(shape.circle(px, cardY + cardH - 10, 100, fur));
    for (const dx of [-45, 0, 45])
      shapes.push(
        line(
          [
            [px + dx, cardY + cardH + 40],
            [px + dx, cardY + cardH + 80],
          ],
          10,
          F
        )
      );
  }
  const labels = [cta(o, [cardX + 240, pb + 30, cardW - 480, 150], fill)];
  return { w, h, qr: qrAt(cardX + (cardW - QR) / 2, qy), shapes, labels };
}

/** A museum plaque: a metal plate with screws in its corners and a double rule. */
export function museumPlaque(o) {
  const w = 1400;
  const head = o.note ? 190 : 80;
  const qy = head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 260;
  const plate = o.light ? tint(0.85) : shade(0.1);
  const ink = o.light ? F : T;
  const shapes = [
    shape.rect(0, 0, w, h, F, 36),
    shape.rect(20, 20, w - 40, h - 40, plate, 24),
    shape.rect(70, 70, w - 140, h - 140, ink, 12, {
      x: 80,
      y: 80,
      width: w - 160,
      height: h - 160,
      radius: 6,
    }),
  ];
  for (const [x, y] of [
    [48, 48],
    [w - 48, 48],
    [48, h - 48],
    [w - 48, h - 48],
  ]) {
    shapes.push(shape.circle(x, y, 22, tint(0.55)));
    shapes.push(shape.rect(x - 16, y - 3, 32, 6, F));
  }
  const labels = [cta(o, [120, pb + 40, w - 240, 170], plate)];
  labels.push(...note(o, [140, 110, w - 280, 100], plate));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A stage with curtains drawn back, the code on the backdrop, the label on the boards. */
export function stageCurtains(o) {
  const w = 1800;
  const h = 1800;
  const size = 900;
  const pad = size * 0.08;
  const qy = 260 + pad;
  const shapes = [
    shape.rect(300, 200, 1200, 1400, tint(0.92)),
    shape.rect(0, 1600, w, 200, shade(0.3)),
    shape.rect(0, 1580, w, 30, F),
  ];
  // Curtains: vertical folds
  for (const [x0, dir] of [
    [0, 1],
    [w, -1],
  ]) {
    shapes.push(shape.rect(dir > 0 ? x0 : x0 - 300, 0, 300, 1600, F));
    for (let i = 1; i < 4; i++) {
      shapes.push(
        shape.rect(x0 + dir * (i * 75) - 8, 60, 16, 1480, tint(0.3), 8)
      );
    }
    shapes.push(shape.rect(dir > 0 ? x0 + 40 : x0 - 300, 980, 260, 60, AC, 30));
  }
  // Valance with scallops
  shapes.push(shape.rect(0, 0, w, 200, F));
  for (let i = 0; i < 9; i++) {
    shapes.push(shape.circle(100 + i * 200, 200, 100, F));
  }
  // Footlights
  for (let i = 0; i < 7; i++) {
    shapes.push(shape.circle(390 + i * 170, 1560, 26, AC));
  }
  const labels = [cta(o, [250, 1620, w - 500, 160], shade(0.3))];
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

// ── Playful, continued ──────────────────────────────────────────────────────

/** A microwave: the code behind its door window, a dial and buttons at the side. */
export function microwaveDoor(o) {
  const w = 1900;
  const h = 1620;
  const size = 900;
  const pad = size * 0.08;
  const qy = 150 + 28 + pad;
  const glass = tint(0.92);
  const shapes = [
    shape.rect(120, h - 70, 160, 70, shade(0.3), 20),
    shape.rect(w - 280, h - 70, 160, 70, shade(0.3), 20),
    shape.rect(0, 0, w, h - 60, F, 60),
    shape.rect(160, 150, 1200, 1100, glass, 30),
    shape.rect(60, 80, 1360, 1400, F, 40, {
      x: 160,
      y: 150,
      width: 1200,
      height: 1100,
      radius: 30,
    }),
    shape.rect(1460, 1180, 380, 50, tint(0.5), 25),
    // Dial and buttons
    shape.circle(1650, 400, 120, tint(0.5)),
    shape.circle(1650, 400, 90, F),
    shape.rect(1642, 300, 16, 60, tint(0.5), 8),
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      shapes.push(
        shape.rect(1500 + c * 170, 620 + r * 140, 130, 90, tint(0.45), 18)
      );
    }
  }
  const labels = [cta(o, [160, 1290, 1200, 150], F)];
  return {
    w,
    h,
    qr: qrSized(160 + (1200 - size) / 2, qy, size),
    shapes,
    labels,
  };
}

/** A front-loading washing machine: the code in the round door, the label on the panel. */
export function washingMachine(o) {
  const w = 1640;
  const h = 2000;
  const cx = w / 2;
  const cy = 1150;
  const size = 870;
  const qy = cy - size / 2;
  const shapes = [
    shape.rect(0, 0, w, h, F, 50),
    shape.rect(30, 300, w - 60, h - 330, tint(0.9), 30),
    shape.circle(cx - 470, 150, 70, tint(0.5)),
    shape.circle(cx - 470, 150, 44, F),
    shape.rect(cx - 330, 110, 60, 80, tint(0.5), 14),
    shape.rect(cx - 240, 110, 60, 80, tint(0.5), 14),
    shape.rect(cx - 150, 110, 60, 80, AC, 14),
    shape.circle(cx, cy, 790, F),
    shape.circle(cx, cy, 740, tint(0.45)),
    shape.circle(cx, cy, 720, tint(0.96)),
  ];
  const labels = [cta(o, [cx - 40, 60, 760, 180], F, { align: "end" })];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A magnifying glass: the code under the lens, a handle going down to the right. */
export function magnifyingGlass(o) {
  const w = 1720;
  const h = 1720;
  const cx = 790;
  const cy = 790;
  const size = 860;
  const qy = cy - size / 2;
  const shapes = [
    line(
      [
        [1335, 1335],
        [1630, 1630],
      ],
      150,
      F
    ),
    shape.circle(cx, cy, 770, F),
    shape.circle(cx, cy, 720, tint(0.94)),
    shape.ellipse(cx - 330, cy - 420, 170, 70, BG),
  ];
  const labels = [cta(o, [60, 1580, 1160, 130], BG)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A ship's porthole: a bolted ring in a riveted wall, the code in the glass. */
export function porthole(o) {
  const w = 1700;
  const h = 1960;
  const cx = w / 2;
  const cy = 850;
  const size = 860;
  const qy = cy - size / 2;
  const shapes = [shape.rect(0, 0, w, h, tint(0.6), 20)];
  for (let i = 0; i < 9; i++) {
    const x = 90 + ((w - 180) * i) / 8;
    shapes.push(shape.circle(x, 60, 22, tint(0.35)));
  }
  shapes.push(shape.circle(cx, cy, 800, F));
  shapes.push(shape.circle(cx, cy, 740, shade(0.3)));
  shapes.push(shape.circle(cx, cy, 700, tint(0.92)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    shapes.push(
      shape.circle(
        cx + Math.cos(a) * 770,
        cy + Math.sin(a) * 770,
        26,
        tint(0.5)
      )
    );
  }
  shapes.push(shape.rect(150, 1700, w - 300, 200, F, 30));
  const labels = [cta(o, [220, 1715, w - 440, 170], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A toaster with a slice of toast popping up, the code on the toast. */
export function toaster(o) {
  const w = 1500;
  const h = 2000;
  const qy = 340;
  const bread = tint(0.86);
  const toast = path()
    .M(100, 1500)
    .L(100, 330)
    .C(100, 120, 300, 20, 450, 110)
    .C(560, 170, 640, 170, 750, 110)
    .C(860, 170, 940, 170, 1050, 110)
    .C(1200, 20, 1400, 120, 1400, 330)
    .L(1400, 1500)
    .Z();
  const shapes = [
    shape.path(toast, F),
    shape.path(
      path()
        .M(140, 1500)
        .L(140, 340)
        .C(140, 170, 310, 70, 450, 150)
        .C(560, 210, 640, 210, 750, 150)
        .C(860, 210, 940, 210, 1050, 150)
        .C(1190, 70, 1360, 170, 1360, 340)
        .L(1360, 1500)
        .Z(),
      bread
    ),
    shape.rect(0, 1400, w, 600, F, 60),
    shape.rect(60, 1400, w - 120, 40, shade(0.4), 10),
    shape.rect(w - 90, 1480, 50, 140, tint(0.5), 14),
    shape.circle(130, 1560, 50, tint(0.5)),
    shape.rect(0, h - 60, w, 60, shade(0.3), 30),
  ];
  const labels = [cta(o, [200, 1560, w - 400, 170], F)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A vending machine: the code in its glass front, a keypad beside it, a flap below. */
export function vendingMachine(o) {
  const w = 1600;
  const h = 1800;
  const size = 900;
  const pad = size * 0.08;
  const qy = 80 + 108 + pad;
  const shapes = [
    shape.rect(0, 0, w, h, F, 40),
    shape.rect(80, 80, 1200, 1260, tint(0.92), 20),
    shape.rect(1320, 80, 220, 1260, shade(0.3), 20),
    shape.rect(1370, 140, 120, 30, BG, 10),
    shape.rect(1370, 1140, 120, 120, AC, 20),
    shape.rect(300, 1600, 1000, 150, shade(0.35), 30),
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      shapes.push(
        shape.rect(1360 + c * 50, 260 + r * 60, 40, 40, tint(0.5), 8)
      );
    }
  }
  const labels = [cta(o, [120, 1380, 1160, 170], F)];
  return {
    w,
    h,
    qr: qrSized(80 + (1200 - size) / 2, qy, size),
    shapes,
    labels,
  };
}

/** A boxy old computer: the code on its screen, a keyboard in front. */
export function retroComputer(o) {
  const w = 1700;
  const h = 1900;
  const size = 900;
  const pad = size * 0.08;
  const qy = 100 + 48 + pad;
  const shell = tint(0.85);
  const shapes = [
    shape.rect(100, 0, 1500, 1500, F, 50),
    shape.rect(130, 30, 1440, 1440, shell, 36),
    shape.rect(200, 100, 1300, 1140, F, 60),
    shape.rect(230, 130, 1240, 1080, tint(0.95), 44),
    shape.rect(1360, 1300, 120, 40, tint(0.5), 8),
    shape.circle(1540, 1320, 22, AC),
    shape.rect(500, 1500, 700, 90, shade(0.3)),
    shape.rect(0, 1620, w, 280, F, 40),
    shape.rect(30, 1650, w - 60, 220, shell, 28),
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 14; c++) {
      shapes.push(
        shape.rect(80 + c * 112 + r * 20, 1680 + r * 60, 80, 40, tint(0.45), 8)
      );
    }
  }
  const labels = [cta(o, [260, 1270, 1180, 150], shell)];
  return {
    w,
    h,
    qr: qrSized(230 + (1240 - size) / 2, qy, size),
    shapes,
    labels,
  };
}

/** A game cartridge: the code on its label sticker, a connector edge at the foot. */
export function gameCartridge(o) {
  const w = 1400;
  const h = 1900;
  const head = o.note ? 170 : 40;
  const qy = 300 + head + PAD;
  const pb = qy + QR + PAD;
  const paper = tint(0.92);
  const shapes = [
    shape.rect(0, 0, w, 1800, F, 80),
    shape.rect(200, 1760, w - 400, 140, shade(0.35), 10),
  ];
  for (let i = 0; i < 4; i++) {
    shapes.push(shape.rect(40, 80 + i * 50, 120, 20, tint(0.4), 10));
    shapes.push(shape.rect(w - 160, 80 + i * 50, 120, 20, tint(0.4), 10));
  }
  shapes.push(shape.rect(100, 300, w - 200, 1400, paper, 24));
  shapes.push(shape.rect(100, 300, w - 200, 60, AC));
  const labels = [cta(o, [160, pb + 30, w - 320, 160], paper)];
  labels.push(...note(o, [180, 370, w - 360, 96], paper));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A floppy disk: a metal shutter on top, the code on the label below. */
export function floppyDisk(o) {
  const w = 1600;
  const h = 1620;
  const size = 900;
  const pad = size * 0.08;
  const qy = 360 + 30 + pad;
  const pb = qy + size + pad;
  const paper = tint(0.92);
  const shapes = [
    shape.path(
      path().poly([
        [0, 0],
        [w - 120, 0],
        [w, 120],
        [w, h],
        [0, h],
      ]),
      F
    ),
    shape.rect(450, 40, 700, 300, shade(0.4), 16),
    shape.rect(770, 90, 120, 210, tint(0.3), 8),
    shape.rect(200, 360, 1200, 1200, paper, 20),
    shape.rect(200, 360, 1200, 50, AC),
    shape.circle(90, h - 90, 30, tint(0.4)),
  ];
  const labels = [cta(o, [260, pb + 20, 1080, 150], paper)];
  return {
    w,
    h,
    qr: qrSized(200 + (1200 - size) / 2, qy, size),
    shapes,
    labels,
  };
}

/** A retro radio: a speaker on the left, the code in the dial window, knobs below. Wide. */
export function radio(o) {
  const w = 2000;
  const h = 1500;
  const qx = 1000;
  const qy = 214;
  const shapes = [
    line(
      [
        [1700, 110],
        [1930, 40],
      ],
      20,
      shade(0.3)
    ),
    shape.circle(1936, 36, 24, shade(0.3)),
    shape.path(
      strokeLine(arcPointsOf(1000, 320, 280, 210, 330, 20), 40, {
        round: true,
      }),
      shade(0.3)
    ),
    shape.rect(0, 80, w, h - 80, F, 90),
    shape.rect(920, 150, 980, 1080, tint(0.92), 30),
    shape.circle(480, 650, 360, shade(0.3)),
    shape.circle(480, 650, 300, tint(0.35), 290),
    shape.circle(480, 650, 220, tint(0.35), 210),
    shape.circle(480, 650, 140, tint(0.35), 130),
    shape.circle(480, 650, 50, tint(0.35)),
    shape.circle(300, 1300, 90, tint(0.5)),
    shape.circle(300, 1300, 30, F),
    shape.circle(700, 1300, 90, tint(0.5)),
    shape.circle(700, 1300, 30, F),
  ];
  const labels = [cta(o, [940, 1270, 940, 150], F)];
  return {
    w,
    h,
    qr: wideQr(qx + (980 - 928) / 2 - 80 + 64, qy),
    shapes,
    labels,
  };
}

/** Points along an arc, for handles and hoops. */
function arcPointsOf(cx, cy, rad, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

/** A striped popcorn bucket with popcorn on top, the code on its label band. */
export function popcornBucket(o) {
  const w = 1500;
  const h = 2000;
  const top = 280;
  const stripes = 7;
  const shapes = [];
  const edgeX = (y, side) => {
    const t = (y - top) / (h - top);
    const inset = 200 * t;
    return side < 0 ? inset : w - inset;
  };
  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes;
    const t1 = (i + 1) / stripes;
    const xa = (t) => edgeX(top, -1) + (edgeX(top, 1) - edgeX(top, -1)) * t;
    const xb = (t) => edgeX(h, -1) + (edgeX(h, 1) - edgeX(h, -1)) * t;
    shapes.push(
      shape.poly(
        [
          [xa(t0), top],
          [xa(t1), top],
          [xb(t1), h],
          [xb(t0), h],
        ],
        i % 2 ? BG : AC
      )
    );
  }
  shapes.push(shape.rect(0, top - 20, w, 60, F, 30));
  shapes.push(shape.rect(170, h - 40, w - 340, 40, F, 20));
  // Popcorn on top
  let k = 0;
  for (const [x, y, r] of [
    [330, 170, 110],
    [520, 130, 120],
    [740, 160, 130],
    [960, 125, 115],
    [1160, 170, 110],
    [230, 280, 90],
    [1270, 280, 90],
    [630, 240, 100],
    [860, 250, 100],
  ]) {
    shapes.push(shape.circle(x, y, r, F));
    shapes.push(shape.circle(x, y, r - 26, k % 2 ? tint(0.9) : tint(0.8)));
    k += 1;
  }
  // Label band
  const qy = 460 + PAD;
  const pb = qy + QR + PAD;
  shapes.push(shape.rect(170, 420, w - 340, pb + 240 - 420, F, 30));
  shapes.push(shape.rect(200, 450, w - 400, pb + 240 - 480, BG, 20));
  const labels = [cta(o, [240, pb + 30, w - 480, 160], BG)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A gable-top milk carton, the code on its front. */
export function milkCarton(o) {
  const w = 1400;
  const h = 2000;
  const qy = 460 + PAD;
  const pb = qy + QR + PAD;
  const card = tint(0.92);
  const shapes = [
    shape.rect(560, 0, 280, 90, F, 20),
    shape.path(
      path().poly([
        [0, 440],
        [w, 440],
        [w, 420],
        [700, 60],
        [0, 420],
      ]),
      F
    ),
    shape.path(
      path().poly([
        [60, 400],
        [w - 60, 400],
        [700, 120],
      ]),
      tint(0.75)
    ),
    shape.rect(0, 420, w, h - 420, F, 20),
    shape.rect(40, 460, w - 80, h - 500, card, 12),
    shape.rect(40, 460, w - 80, 70, AC),
  ];
  const labels = [cta(o, [120, pb + 40, w - 240, 170], card)];
  labels.push(
    ...note(o, [200, 250, w - 400, 110], tint(0.75), { weight: "bold" })
  );
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A drinks can with a pull tab, the code on its label. */
export function sodaCan(o) {
  const w = 1300;
  const h = 2000;
  const size = 900;
  const pad = size * 0.08;
  const qy = 400 + 60 + pad;
  const pb = qy + size + pad;
  const paper = tint(0.92);
  const shapes = [
    shape.rect(40, 120, w - 80, h - 120, F, 100),
    shape.rect(0, 160, w, 60, shade(0.3), 30),
    shape.rect(0, h - 60, w, 60, shade(0.3), 30),
    shape.ellipse(w / 2, 150, 560, 110, shade(0.35)),
    shape.ellipse(w / 2, 150, 500, 80, tint(0.5)),
    shape.rect(w / 2 - 40, 60, 80, 170, F, 30),
    shape.rect(w / 2 - 26, 76, 52, 60, tint(0.5), 20),
    shape.rect(100, 400, w - 200, pb + 250 - 400, paper, 40),
    shape.rect(100, 400, w - 200, 44, AC),
    shape.rect(100, pb + 206, w - 200, 44, AC),
  ];
  const labels = [cta(o, [160, pb + 30, w - 320, 160], paper)];
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

/** A curbside mailbox on a post with its flag up, the code on its side. */
export function mailbox(o) {
  const w = 1700;
  const h = 2000;
  const qy = 440;
  const pb = qy + QR + PAD;
  const fill = o.light ? tint(0.9) : F;
  const box = (inset) =>
    path()
      .M(100 + inset, 1720 - inset)
      .L(100 + inset, 650)
      .A(350 - inset, 350 - inset, 0, 0, 1, 450, 300 + inset)
      .L(1150, 300 + inset)
      .A(350 - inset, 350 - inset, 0, 0, 1, 1500 - inset, 650)
      .L(1500 - inset, 1720 - inset)
      .Z();
  const shapes = [
    shape.rect(650, 1700, 200, 300, shade(0.3)),
    shape.rect(560, 1660, 380, 70, shade(0.3), 20),
    shape.rect(1520, 700, 40, 500, AC, 20),
    shape.rect(1520, 700, 170, 150, AC, 20),
    shape.path(box(0), F),
  ];
  if (o.light) shapes.push(shape.path(box(40), fill));
  shapes.push(shape.circle(1540, 1200, 36, tint(0.5)));
  const labels = [cta(o, [220, pb + 30, 1160, 150], fill)];
  return { w, h, qr: qrAt(300, qy), shapes, labels };
}

/** A parking meter: the code in its window, the label under it, a pole below. */
export function parkingMeter(o) {
  const w = 1300;
  const h = 2000;
  const size = 900;
  const pad = size * 0.08;
  const qy = 260 + 28 + pad;
  const glass = tint(0.92);
  const shapes = [
    shape.rect(540, 1500, 220, 500, shade(0.3)),
    shape.rect(0, 0, w, 1540, F, 200),
    shape.rect(w / 2 - 200, 60, 400, 50, tint(0.5), 25),
    shape.rect(w / 2 - 110, 150, 220, 36, BG, 18),
    shape.rect(100, 260, 1100, 1100, glass, 40),
    shape.circle(w / 2 - 300, 168, 30, AC),
    shape.circle(w / 2 + 300, 168, 30, tint(0.5)),
  ];
  const labels = [cta(o, [140, 1370, 1020, 140], F)];
  return {
    w,
    h,
    qr: qrSized(100 + (1100 - size) / 2, qy, size),
    shapes,
    labels,
  };
}

/** A train carriage: the code in the big window, wheels on the rail. Wide. */
export function trainWindow(o) {
  const w = 2000;
  const h = 1600;
  const qy = 120 + 36 + 64;
  const shapes = [
    shape.rect(0, 0, w, 1420, F, 90),
    shape.rect(80, 120, 340, 960, tint(0.92), 40),
    shape.rect(1580, 120, 340, 960, tint(0.92), 40),
    shape.rect(500, 120, 1000, 960, BG, 40),
    shape.rect(0, 1120, w, 50, AC),
    shape.rect(0, 1580, w, 20, tint(0.5)),
  ];
  for (const x of [420, 640, 1360, 1580]) {
    shapes.push(shape.circle(x, 1470, 100, F));
    shapes.push(shape.circle(x, 1470, 60, tint(0.55)));
  }
  const labels = [cta(o, [200, 1200, w - 400, 140], F)];
  return { w, h, qr: wideQr(500 + (1000 - 800) / 2, qy), shapes, labels };
}

/** A snow globe: the code in the glass with snow falling, the label on the base. */
export function snowGlobe(o) {
  const w = 1600;
  const h = 1880;
  const cx = w / 2;
  const cy = 790;
  const size = 860;
  const qy = cy - 40 - size / 2;
  const shapes = [
    shape.circle(cx, cy, 770, F),
    shape.circle(cx, cy, 730, tint(0.94)),
    shape.ellipse(cx, cy + 600, 620, 150, BG),
    shape.ellipse(cx - 300, cy - 420, 150, 70, BG),
  ];
  let k = 0;
  for (const [x, y] of [
    [cx - 560, cy - 200],
    [cx - 620, cy + 60],
    [cx - 500, cy + 300],
    [cx + 560, cy - 150],
    [cx + 620, cy + 100],
    [cx + 520, cy + 330],
    [cx - 200, cy - 640],
    [cx + 150, cy - 660],
    [cx + 400, cy - 540],
    [cx - 450, cy - 480],
  ]) {
    shapes.push(shape.circle(x, y, 14 + (k % 3) * 6, F));
    k += 1;
  }
  shapes.push(shape.rect(cx - 420, 1480, 840, 120, shade(0.35), 20));
  shapes.push(shape.rect(cx - 560, 1580, 1120, 300, F, 60));
  const labels = [cta(o, [cx - 480, 1640, 960, 170], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A sailboat: the code on a square sail, the label on the hull. */
export function sailboat(o) {
  const w = 1700;
  const h = 2000;
  const qy = 150 + 60 + PAD;
  const sail = tint(0.92);
  const shapes = [
    shape.rect(830, 0, 40, 1640, shade(0.3), 20),
    shape.rect(180, 130, 1340, 40, shade(0.3), 20),
    shape.path(
      path().M(200, 170).L(1500, 170).L(1500, 1420).Q(850, 1560, 200, 1420).Z(),
      sail
    ),
    shape.path(path().M(0, 1600).L(w, 1600).L(1480, 1900).L(220, 1900).Z(), F),
  ];
  for (const y of [1930, 1980]) {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const x = (w * k) / 40;
      pts.push([x, y + Math.sin(k * 0.8) * 10]);
    }
    shapes.push(line(pts, 12, tint(0.5)));
  }
  const labels = [cta(o, [300, 1630, w - 600, 150], F)];
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A matchbox with its drawer slid out, the code on the sleeve. Wide. */
export function matchbox(o) {
  const w = 2000;
  const h = 1500;
  const sleeve = 1480;
  const qx = 120 + 64;
  const qy = 220 + 64;
  const pb = qy + 800 + 64;
  const shapes = [
    shape.rect(1300, 160, 660, 1180, tint(0.85), 20),
    shape.rect(1300, 160, 660, 1180, F, 20, {
      x: 1324,
      y: 184,
      width: 612,
      height: 1132,
      radius: 10,
    }),
  ];
  for (let i = 0; i < 3; i++) {
    const y = 420 + i * 300;
    shapes.push(shape.rect(1400, y, 480, 34, tint(0.6), 17));
    shapes.push(shape.circle(1880, y + 17, 42, AC));
  }
  shapes.push(shape.rect(0, 100, sleeve, 1300, F, 30));
  shapes.push(shape.rect(0, 100, sleeve, 70, tint(0.45)));
  shapes.push(shape.rect(80, 200, sleeve - 160, 1120, BG, 20));
  const labels = [cta(o, [120, pb + 40, sleeve - 240, 150], BG)];
  return {
    w,
    h,
    qr: wideQr(qx + (sleeve - 160 - 928) / 2 - 64 + 80, qy),
    shapes,
    labels,
  };
}

/** A cinema marquee: bulbs all round the board, a header band for the note. */
export function cinemaMarquee(o) {
  const w = 1500;
  const head = 200;
  const qy = 140 + head + PAD;
  const pb = qy + QR + PAD;
  const h = pb + 300;
  const board = tint(0.94);
  const shapes = [
    shape.rect(0, 0, w, h, F, 40),
    shape.rect(110, 110, w - 220, h - 220, board, 20),
  ];
  const nx = 10;
  const ny = Math.round(((h - 110) / (w - 110)) * nx);
  for (let i = 0; i <= nx; i++) {
    const x = 55 + ((w - 110) * i) / nx;
    shapes.push(shape.circle(x, 55, 26, tint(0.75)));
    shapes.push(shape.circle(x, h - 55, 26, tint(0.75)));
  }
  for (let i = 1; i < ny; i++) {
    const y = 55 + ((h - 110) * i) / ny;
    shapes.push(shape.circle(55, y, 26, tint(0.75)));
    shapes.push(shape.circle(w - 55, y, 26, tint(0.75)));
  }
  shapes.push(shape.rect(110, 110, w - 220, head, F));
  const labels = [cta(o, [180, pb + 40, w - 360, 170], board)];
  labels.push(...note(o, [160, 150, w - 320, 120], F, { weight: "bold" }));
  return { w, h, qr: qrAt((w - QR) / 2, qy), shapes, labels };
}

/** A handheld console: the code on its screen, a d-pad and buttons below. */
export function handheldConsole(o) {
  const w = 1400;
  const h = 2000;
  const size = 900;
  const pad = size * 0.08;
  const qy = 120 + 70 + pad;
  const pb = qy + size + pad;
  const shell = tint(0.85);
  const shapes = [
    shape.rect(0, 0, w, h, F, 90),
    shape.rect(26, 26, w - 52, h - 52, shell, 70),
    shape.rect(120, 120, w - 240, pb + 200 - 120, F, 40),
    shape.rect(150, 150, w - 300, pb + 170 - 150, BG, 24),
    // D-pad
    shape.rect(170, 1700, 300, 100, F, 20),
    shape.rect(270, 1600, 100, 300, F, 20),
    // Buttons
    shape.circle(1040, 1700, 70, AC),
    shape.circle(1220, 1640, 70, AC),
  ];
  for (let i = 0; i < 5; i++) {
    shapes.push(
      line(
        [
          [1020 + i * 50, 1880],
          [1100 + i * 50, 1800],
        ],
        12,
        tint(0.5)
      )
    );
  }
  const labels = [cta(o, [160, pb + 10, w - 320, 150], BG)];
  return { w, h, qr: qrSized((w - size) / 2, qy, size), shapes, labels };
}

/** A video tape: two reel windows on top, the code on the big label, a spine strip. Wide. */
export function vhsTape(o) {
  const w = 2000;
  const h = 1500;
  const qx = 150 + 64;
  const qy = 320 + 64;
  const paper = tint(0.92);
  const shapes = [
    shape.rect(0, 0, w, h, F, 40),
    shape.rect(100, 60, 1800, 200, shade(0.35), 20),
    shape.circle(460, 160, 80, tint(0.5)),
    shape.circle(460, 160, 36, F),
    shape.circle(1540, 160, 80, tint(0.5)),
    shape.circle(1540, 160, 36, F),
    shape.rect(100, 320, 1800, 980, paper, 20),
    shape.rect(100, 1340, 1800, 100, AC, 20),
  ];
  const tx = qx + 800 + 64 + 80;
  const tw = w - tx - 180;
  const labels = [cta(o, [tx, 580, tw, 200], paper)];
  labels.push(...note(o, [tx, 820, tw, 110], paper));
  return { w, h, qr: wideQr(qx, qy), shapes, labels };
}

/** A flying saucer with its beam on the code, the label on the ground. */
export function ufoBeam(o) {
  const w = 1600;
  const h = 1640;
  const cx = w / 2;
  const size = 800;
  const qy = 604;
  const shapes = [
    shape.path(
      path().poly([
        [cx - 450, 300],
        [cx + 450, 300],
        [cx + 750, 1500],
        [cx - 750, 1500],
      ]),
      tint(0.9)
    ),
    shape.ellipse(cx, 170, 260, 150, tint(0.6)),
    shape.ellipse(cx, 250, 600, 110, F),
    shape.ellipse(cx, 300, 400, 60, shade(0.3)),
    shape.rect(0, 1500, w, 140, F),
  ];
  for (let i = 0; i < 5; i++) {
    shapes.push(shape.circle(cx - 400 + i * 200, 265, 26, AC));
  }
  const labels = [cta(o, [100, 1500, w - 200, 140], F)];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}

/** A lighthouse: a lamp room on top, bands down the tower, the code on the tower. */
export function lighthouse(o) {
  const w = 1500;
  const h = 1960;
  const cx = w / 2;
  const size = 760;
  const qy = 760;
  const tower = (y) => {
    const t = (y - 300) / 1500;
    return 500 + 100 * t;
  };
  const band = (y0, y1, fill) =>
    shape.poly(
      [
        [cx - tower(y0), y0],
        [cx + tower(y0), y0],
        [cx + tower(y1), y1],
        [cx - tower(y1), y1],
      ],
      fill
    );
  const shapes = [
    shape.poly(
      [
        [cx - 350, 120],
        [0, 0],
        [0, 260],
      ],
      tint(0.85)
    ),
    shape.poly(
      [
        [cx + 350, 120],
        [w, 0],
        [w, 260],
      ],
      tint(0.85)
    ),
    shape.rect(cx - 350, 0, 700, 240, tint(0.92), 40),
    shape.rect(cx - 350, 0, 700, 240, F, 40, {
      x: cx - 320,
      y: 30,
      width: 640,
      height: 180,
      radius: 20,
    }),
    shape.rect(cx - 420, 240, 840, 60, F, 20),
    band(300, 1820, F),
    band(560, 700, AC),
    band(1620, 1760, AC),
    shape.rect(0, 1820, w, 140, shade(0.3), 30),
  ];
  const labels = [cta(o, [100, 1820, w - 200, 140], shade(0.3))];
  return { w, h, qr: qrSized(cx - size / 2, qy, size), shapes, labels };
}
