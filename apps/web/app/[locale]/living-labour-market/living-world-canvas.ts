import { EUROPE_GEO, MAP_H, MAP_W } from "@/components/app/europe-geo";

export type WorldSectorId =
  | "construction"
  | "logistics"
  | "manufacturing"
  | "care"
  | "hospitality"
  | "agriculture"
  | "technology"
  | "services";

export type WorldSector = {
  readonly id: WorldSectorId;
  readonly label: string;
  readonly totalCount: number | null;
  readonly formattedCount?: string;
};

export type WorldDrawInput = {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly time: number;
  readonly progress: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly selected: WorldSectorId;
  readonly sectors: readonly WorldSector[];
  readonly reducedMotion: boolean;
  readonly hideLabels: boolean;
};

type Point = { x: number; y: number };
type Camera = { x: number; y: number; zoom: number };

const TAU = Math.PI * 2;
const PAPER = "#f4f0df";
const INK = "#071217";
const AMBER = "#f3b943";
const CYAN = "#69d0cd";
const WORLD_W = 1600;
const WORLD_H = 900;
const MOBILE_WORLD_W = 720;
const MOBILE_WORLD_H = 1280;

const DESKTOP_POSITIONS: Record<WorldSectorId, Point> = {
  agriculture: { x: 265, y: 365 },
  logistics: { x: 430, y: 605 },
  manufacturing: { x: 730, y: 340 },
  construction: { x: 1015, y: 445 },
  hospitality: { x: 650, y: 735 },
  care: { x: 1055, y: 705 },
  technology: { x: 1280, y: 335 },
  services: { x: 1335, y: 615 },
};

const MOBILE_POSITIONS: Record<WorldSectorId, Point> = {
  agriculture: { x: 215, y: 245 },
  manufacturing: { x: 485, y: 255 },
  logistics: { x: 210, y: 510 },
  construction: { x: 485, y: 535 },
  hospitality: { x: 205, y: 790 },
  care: { x: 485, y: 810 },
  technology: { x: 210, y: 1055 },
  services: { x: 490, y: 1050 },
};

let cachedCountryPaths:
  | readonly { tier: string; code: string; path: Path2D }[]
  | null = null;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

function paths() {
  if (cachedCountryPaths) return cachedCountryPaths;
  cachedCountryPaths = EUROPE_GEO.map((country) => ({
    tier: country.tier,
    code: country.code,
    path: new Path2D(country.d),
  }));
  return cachedCountryPaths;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  width: number,
  height: number,
  depth: number,
  tone: string,
  light = 0.5,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(x + width * 0.1, groundY + 9, width * 0.72, 11, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = tone;
  ctx.fillRect(x - width / 2, groundY - height, width, height);
  ctx.fillStyle = "rgba(2,15,18,.34)";
  ctx.beginPath();
  ctx.moveTo(x + width / 2, groundY - height);
  ctx.lineTo(x + width / 2 + depth, groundY - height - depth * 0.48);
  ctx.lineTo(x + width / 2 + depth, groundY - depth * 0.48);
  ctx.lineTo(x + width / 2, groundY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,244,211,.13)";
  ctx.beginPath();
  ctx.moveTo(x - width / 2, groundY - height);
  ctx.lineTo(x - width / 2 + depth, groundY - height - depth * 0.48);
  ctx.lineTo(x + width / 2 + depth, groundY - height - depth * 0.48);
  ctx.lineTo(x + width / 2, groundY - height);
  ctx.closePath();
  ctx.fill();

  const columns = Math.max(2, Math.floor(width / 24));
  const rows = Math.max(1, Math.floor(height / 24));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const lit = ((row * 7 + column * 3) % 10) / 10 < light;
      ctx.fillStyle = lit ? "rgba(255,202,95,.68)" : "rgba(5,22,25,.46)";
      ctx.fillRect(
        x - width / 2 + 8 + column * ((width - 14) / columns),
        groundY - height + 9 + row * ((height - 12) / rows),
        Math.max(3, (width - 24) / columns - 6),
        5,
      );
    }
  }
  ctx.restore();
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  phase: number,
  color = PAPER,
) {
  const stride = Math.sin(phase * TAU) * 3 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, 2 * scale);
  ctx.beginPath();
  ctx.arc(0, -14 * scale, 3.7 * scale, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -10 * scale);
  ctx.lineTo(0, 2 * scale);
  ctx.moveTo(0, -6 * scale);
  ctx.lineTo(-6 * scale, -1 * scale + stride * 0.3);
  ctx.moveTo(0, -6 * scale);
  ctx.lineTo(6 * scale, -1 * scale - stride * 0.3);
  ctx.moveTo(0, 2 * scale);
  ctx.lineTo(-5 * scale + stride, 12 * scale);
  ctx.moveTo(0, 2 * scale);
  ctx.lineTo(5 * scale - stride, 12 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color = PAPER,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  roundedRect(ctx, -20, -11, 29, 14, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(12,34,37,.9)";
  ctx.fillRect(-14, -8, 17, 7);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(9, -9);
  ctx.lineTo(18, -9);
  ctx.lineTo(23, -2);
  ctx.lineTo(23, 3);
  ctx.lineTo(9, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  for (const wheelX of [-13, 16]) {
    ctx.beginPath();
    ctx.arc(wheelX, 5, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawDemandBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  intensity: number,
  pulse: number,
  selected: boolean,
) {
  if (intensity <= 0.03) return;
  const radius = 14 + intensity * 13 + pulse * 9;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.3);
  glow.addColorStop(
    0,
    selected ? "rgba(243,185,67,.92)" : "rgba(105,208,205,.66)",
  );
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = selected ? "rgba(243,185,67,.78)" : "rgba(105,208,205,.42)";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = selected ? AMBER : CYAN;
  ctx.beginPath();
  ctx.arc(x, y, 4 + intensity * 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawAgriculture(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  ctx.save();
  ctx.rotate(-0.08);
  const colors = ["#586836", "#75834a", "#927a3f", "#455b35"];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-105 + i * 42, -40, 35, 90);
    ctx.strokeStyle = "rgba(244,240,223,.13)";
    for (let line = 0; line < 5; line++) {
      ctx.beginPath();
      ctx.moveTo(-100 + i * 42 + line * 7, -36);
      ctx.lineTo(-100 + i * 42 + line * 7, 46);
      ctx.stroke();
    }
  }
  const tractorX = -82 + ((t * 14) % 170);
  ctx.fillStyle = AMBER;
  ctx.fillRect(tractorX, 2, 19, 10);
  ctx.fillRect(tractorX + 10, -7, 9, 9);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(tractorX + 3, 14, 5, 0, TAU);
  ctx.arc(tractorX + 17, 14, 7, 0, TAU);
  ctx.fill();
  drawPerson(ctx, 78, 24, 0.72, t * 0.12, PAPER);
  ctx.globalAlpha = 0.45 + intensity * 0.45;
  ctx.fillStyle = "rgba(255,211,111,.28)";
  ctx.fillRect(-105, -40, 190 * intensity, 90);
  ctx.restore();
}

function drawLogistics(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  ctx.fillStyle = "rgba(9,25,29,.72)";
  ctx.fillRect(-125, 18, 250, 36);
  ctx.strokeStyle = "rgba(243,185,67,.55)";
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(-125, 36);
  ctx.lineTo(125, 36);
  ctx.stroke();
  ctx.setLineDash([]);
  drawBox(ctx, 20, 4, 158, 62, 28, "#34515a", 0.3 + intensity * 0.5);
  ctx.fillStyle = "rgba(244,240,223,.72)";
  for (let i = 0; i < 4; i++) ctx.fillRect(-42 + i * 34, -15, 22, 18);
  const truckX = -160 + ((t * (16 + intensity * 18)) % 320);
  drawTruck(ctx, truckX, 34, 0.8, PAPER);
  drawTruck(ctx, 102 - ((t * 9) % 220), 56, 0.55, CYAN);
  drawPerson(ctx, -72, 7, 0.72, t * 0.2, AMBER);
}

function drawManufacturing(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  drawBox(ctx, -34, 34, 122, 72, 24, "#32434a", 0.28 + intensity * 0.6);
  drawBox(ctx, 74, 34, 76, 104, 20, "#26383f", 0.2 + intensity * 0.55);
  ctx.fillStyle = "#243338";
  ctx.fillRect(82, -112, 18, 72);
  for (let i = 0; i < 3; i++) {
    const drift = Math.sin(t * 0.12 + i) * 9;
    ctx.fillStyle = `rgba(215,229,218,${0.09 - i * 0.018})`;
    ctx.beginPath();
    ctx.arc(91 + drift, -126 - i * 18, 15 + i * 7, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  const belt = (t * 22) % 90;
  ctx.beginPath();
  ctx.moveTo(-92, 47);
  ctx.lineTo(7, 47);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.fillRect(-86 + belt, 40, 10, 8);
  drawPerson(ctx, 17, 42, 0.72, t * 0.18, PAPER);
}

function drawConstruction(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  ctx.fillStyle = "rgba(172,151,104,.2)";
  ctx.fillRect(-124, 30, 248, 34);
  ctx.strokeStyle = "rgba(244,240,223,.68)";
  ctx.lineWidth = 2;
  for (let floor = 0; floor < 5; floor++) {
    const y = 24 - floor * 29;
    ctx.beginPath();
    ctx.moveTo(-48, y);
    ctx.lineTo(96, y);
    ctx.stroke();
  }
  for (let column = 0; column < 5; column++) {
    const x = -48 + column * 36;
    ctx.beginPath();
    ctx.moveTo(x, 25);
    ctx.lineTo(x, -93);
    ctx.stroke();
  }
  const completedFloors = Math.max(1, Math.round(1 + intensity * 4));
  ctx.fillStyle = "rgba(243,185,67,.16)";
  ctx.fillRect(-48, 24 - completedFloors * 29, 144, completedFloors * 29);

  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-88, 29);
  ctx.lineTo(-88, -156);
  ctx.lineTo(90, -156);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-88, -135);
  ctx.lineTo(-28, 28);
  ctx.moveTo(-88, -135);
  ctx.lineTo(-142, 28);
  ctx.stroke();
  const trolley = -45 + Math.sin(t * 0.18) * 52;
  const hookY = -48 + Math.sin(t * 0.11) * 18;
  ctx.beginPath();
  ctx.moveTo(trolley, -156);
  ctx.lineTo(trolley, hookY);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.fillRect(trolley - 11, hookY, 22, 11);
  drawPerson(ctx, -5, 47, 0.82, t * 0.19, PAPER);
  drawPerson(ctx, 38, 47, 0.82, t * 0.19 + 0.5, AMBER);
  drawPerson(ctx, 78, 47, 0.82, t * 0.15 + 0.2, CYAN);
}

function drawCare(ctx: CanvasRenderingContext2D, t: number, intensity: number) {
  drawBox(ctx, 0, 37, 168, 92, 30, "#d7ddd7", 0.3 + intensity * 0.55);
  ctx.fillStyle = "#b7463d";
  ctx.fillRect(-8, -35, 16, 48);
  ctx.fillRect(-24, -19, 48, 16);
  drawTruck(ctx, -103 + ((t * 9) % 150), 54, 0.55, "#e8ece8");
  ctx.fillStyle = "#b7463d";
  ctx.fillRect(-103 + ((t * 9) % 150) - 7, 45, 10, 3);
  drawPerson(ctx, 62, 50, 0.72, t * 0.11, CYAN);
  drawPerson(ctx, 82, 50, 0.68, t * 0.1 + 0.3, PAPER);
}

function drawHospitality(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  ctx.fillStyle = "rgba(68,46,30,.88)";
  ctx.fillRect(-112, -30, 224, 66);
  ctx.fillStyle = "rgba(243,185,67,.76)";
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(-88 + i * 30, -34, 3 + intensity * 1.5, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const x = -72 + i * 72;
    ctx.fillStyle = "#8a6339";
    ctx.fillRect(x - 22, 18, 44, 5);
    ctx.fillRect(x - 2, 23, 4, 16);
  }
  drawPerson(ctx, -20 + Math.sin(t * 0.25) * 34, 36, 0.76, t * 0.24, PAPER);
  drawPerson(ctx, 70, 33, 0.68, 0, CYAN);
  ctx.fillStyle = `rgba(244,240,223,${0.08 + intensity * 0.12})`;
  ctx.beginPath();
  ctx.arc(22, -65, 25 + Math.sin(t * 0.12) * 4, 0, TAU);
  ctx.fill();
}

function drawTechnology(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  drawBox(ctx, -40, 46, 92, 145, 24, "#244552", 0.35 + intensity * 0.55);
  drawBox(ctx, 55, 46, 72, 105, 20, "#365a64", 0.28 + intensity * 0.55);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const wave = Math.sin(t * 0.2 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(-105, -72 + i * 24);
    ctx.bezierCurveTo(
      -60,
      -85 + i * 24 + wave,
      25,
      -50 + i * 22,
      102,
      -74 + i * 22,
    );
    ctx.stroke();
  }
  drawPerson(ctx, 97, 48, 0.7, t * 0.14, PAPER);
  ctx.fillStyle = AMBER;
  ctx.fillRect(84, 13, 24, 14);
}

function drawServices(
  ctx: CanvasRenderingContext2D,
  t: number,
  intensity: number,
) {
  drawBox(ctx, 5, 36, 162, 76, 24, "#4a4e45", 0.22 + intensity * 0.55);
  ctx.strokeStyle = "rgba(244,240,223,.48)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-73, 24, 18, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-73, 1);
  ctx.lineTo(-73, 47);
  ctx.moveTo(-96, 24);
  ctx.lineTo(-50, 24);
  ctx.stroke();
  drawTruck(ctx, 70 - ((t * 8) % 120), 52, 0.58, CYAN);
  drawPerson(ctx, 85, 48, 0.72, t * 0.18, AMBER);
}

function drawDistrict(
  ctx: CanvasRenderingContext2D,
  sector: WorldSector,
  position: Point,
  time: number,
  maxCount: number,
  selected: boolean,
  hideLabels: boolean,
) {
  const count = sector.totalCount ?? 0;
  const intensity =
    count > 0 ? clamp(Math.log1p(count) / Math.log1p(maxCount)) : 0;
  const pulse = (Math.sin(time * 0.002 + position.x * 0.013) + 1) / 2;
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.scale(selected ? 1.045 : 1, selected ? 1.045 : 1);

  const halo = ctx.createRadialGradient(0, 5, 8, 0, 5, 150);
  halo.addColorStop(
    0,
    selected ? "rgba(243,185,67,.14)" : "rgba(105,208,205,.055)",
  );
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(0, 12, 160, 95, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = selected ? "rgba(243,185,67,.34)" : "rgba(244,240,223,.12)";
  ctx.lineWidth = selected ? 2 : 1;
  ctx.beginPath();
  ctx.ellipse(0, 42, 137, 35, 0, 0, TAU);
  ctx.stroke();

  const seconds = time / 1000;
  switch (sector.id) {
    case "agriculture":
      drawAgriculture(ctx, seconds, intensity);
      break;
    case "logistics":
      drawLogistics(ctx, seconds, intensity);
      break;
    case "manufacturing":
      drawManufacturing(ctx, seconds, intensity);
      break;
    case "construction":
      drawConstruction(ctx, seconds, intensity);
      break;
    case "care":
      drawCare(ctx, seconds, intensity);
      break;
    case "hospitality":
      drawHospitality(ctx, seconds, intensity);
      break;
    case "technology":
      drawTechnology(ctx, seconds, intensity);
      break;
    case "services":
      drawServices(ctx, seconds, intensity);
      break;
  }

  drawDemandBeacon(ctx, 0, -62, intensity, pulse, selected);

  if (!hideLabels) {
    ctx.textAlign = "center";
    ctx.fillStyle = selected ? PAPER : "rgba(244,240,223,.72)";
    ctx.font = `${selected ? 700 : 600} 15px Arial, sans-serif`;
    ctx.fillText(sector.label, 0, 84);
    ctx.fillStyle = selected ? AMBER : "rgba(244,240,223,.48)";
    ctx.font = "700 11px 'Courier New', monospace";
    const countLabel =
      sector.totalCount === null
        ? "—"
        : (sector.formattedCount ?? `${sector.totalCount}`);
    ctx.fillText(`SE  ${countLabel}`, 0, 101);
  }
  ctx.restore();
}

function drawRoads(
  ctx: CanvasRenderingContext2D,
  positions: Record<WorldSectorId, Point>,
  time: number,
  mobile: boolean,
) {
  const hub = mobile ? { x: 360, y: 650 } : { x: 790, y: 535 };
  ctx.save();
  ctx.lineCap = "round";
  for (const [index, position] of Object.values(positions).entries()) {
    ctx.strokeStyle = "rgba(3,13,16,.74)";
    ctx.lineWidth = mobile ? 24 : 30;
    ctx.beginPath();
    ctx.moveTo(position.x, position.y + 48);
    ctx.quadraticCurveTo(
      lerp(position.x, hub.x, 0.58),
      lerp(position.y, hub.y, 0.38) + (index % 2 ? 34 : -34),
      hub.x,
      hub.y,
    );
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,223,.11)";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 22]);
    ctx.lineDashOffset = -(time * 0.012 + index * 19);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawEuropeTerrain(
  ctx: CanvasRenderingContext2D,
  mobile: boolean,
  selected: WorldSectorId,
) {
  ctx.save();
  if (mobile) {
    ctx.translate(-250, 45);
    ctx.transform(1.1, -0.04, -0.14, 0.7, 0, 0);
  } else {
    ctx.translate(285, 55);
    ctx.transform(1, -0.05, -0.14, 0.56, 0, 0);
  }
  const scale = mobile ? 1.22 : 1.02;
  ctx.scale(scale, scale);
  for (const country of paths()) {
    if (country.tier === "frame") continue;
    const isSweden = country.code === "SE";
    ctx.fillStyle = isSweden
      ? selected === "agriculture"
        ? "rgba(126,148,70,.38)"
        : "rgba(243,185,67,.24)"
      : country.tier === "target"
        ? "rgba(44,91,91,.19)"
        : "rgba(227,219,192,.055)";
    ctx.strokeStyle = isSweden
      ? "rgba(243,185,67,.58)"
      : country.tier === "target"
        ? "rgba(105,208,205,.22)"
        : "rgba(244,240,223,.085)";
    ctx.lineWidth = isSweden ? 2.2 : 1;
    ctx.fill(country.path);
    ctx.stroke(country.path);
  }
  ctx.restore();
}

function cameraAt(progress: number, selected: Point, mobile: boolean): Camera {
  const center = mobile
    ? { x: MOBILE_WORLD_W / 2, y: MOBILE_WORLD_H / 2 }
    : { x: WORLD_W / 2, y: WORLD_H / 2 };
  const frames: readonly { p: number; camera: Camera }[] = [
    { p: 0, camera: { ...center, zoom: mobile ? 0.86 : 0.93 } },
    {
      p: 0.16,
      camera: {
        x: lerp(center.x, selected.x, 0.28),
        y: lerp(center.y, selected.y, 0.25),
        zoom: mobile ? 1.02 : 1.13,
      },
    },
    {
      p: 0.31,
      camera: { x: selected.x, y: selected.y, zoom: mobile ? 1.45 : 1.72 },
    },
    {
      p: 0.49,
      camera: { x: selected.x, y: selected.y - 18, zoom: mobile ? 2.15 : 2.72 },
    },
    {
      p: 0.66,
      camera: {
        x: selected.x + 35,
        y: selected.y - 12,
        zoom: mobile ? 2.3 : 3.05,
      },
    },
    {
      p: 0.82,
      camera: { x: selected.x, y: selected.y, zoom: mobile ? 1.55 : 1.85 },
    },
    { p: 1, camera: { ...center, zoom: mobile ? 0.9 : 0.96 } },
  ];
  for (let i = 0; i < frames.length - 1; i++) {
    const from = frames[i];
    const to = frames[i + 1];
    if (progress <= to.p) {
      const local = ease((progress - from.p) / (to.p - from.p));
      return {
        x: lerp(from.camera.x, to.camera.x, local),
        y: lerp(from.camera.y, to.camera.y, local),
        zoom: lerp(from.camera.zoom, to.camera.zoom, local),
      };
    }
  }
  return frames[frames.length - 1].camera;
}

function drawEconomicProcess(
  ctx: CanvasRenderingContext2D,
  position: Point,
  phase: number,
  time: number,
  reduced: boolean,
) {
  const oscillation = reduced ? 0 : Math.sin(time * 0.004);
  ctx.save();
  ctx.translate(position.x, position.y);

  if (phase < 0.2) {
    const local = ease(phase / 0.2);
    ctx.strokeStyle = `rgba(243,185,67,${0.35 + local * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -62, 24 + local * 34, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = AMBER;
    ctx.save();
    ctx.translate(0, -121 - oscillation * 5);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  } else if (phase < 0.42) {
    const local = ease((phase - 0.2) / 0.22);
    const workerX = lerp(-176, -52, local);
    ctx.strokeStyle = "rgba(105,208,205,.26)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-188, 56);
    ctx.quadraticCurveTo(-112, 2, -4, 48);
    ctx.stroke();
    drawPerson(
      ctx,
      workerX,
      42 - Math.sin(local * Math.PI) * 20,
      0.95,
      time * 0.0008,
      CYAN,
    );
  } else if (phase < 0.65) {
    const local = ease((phase - 0.42) / 0.23);
    ctx.strokeStyle = "rgba(243,185,67,.86)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -62, 44, -Math.PI / 2, -Math.PI / 2 + TAU * local);
    ctx.stroke();
    ctx.fillStyle = `rgba(243,185,67,${0.1 + local * 0.18})`;
    ctx.fillRect(-112, -92, 224 * local, 9);
  } else if (phase < 0.84) {
    const local = ease((phase - 0.65) / 0.19);
    ctx.globalAlpha = local;
    ctx.fillStyle = "rgba(7,25,29,.9)";
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    roundedRect(ctx, 72, -176 - local * 15, 108, 142, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,223,.46)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(91, -141 + i * 24 - local * 15);
      ctx.lineTo(155 - (i % 2) * 20, -141 + i * 24 - local * 15);
      ctx.stroke();
    }
    ctx.fillStyle = AMBER;
    ctx.fillRect(90, -78 - local * 15, 38 * local, 5);
  } else {
    const local = ease((phase - 0.84) / 0.16);
    ctx.strokeStyle = `rgba(105,208,205,${0.45 + local * 0.45})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -62, 42 + local * 16, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, -62);
    ctx.lineTo(-3, -49);
    ctx.lineTo(23, -79);
    ctx.stroke();
    ctx.strokeStyle = "rgba(243,185,67,.25)";
    for (let ring = 1; ring < 4; ring++) {
      ctx.beginPath();
      ctx.arc(0, -62, 58 + ring * 24 + local * ring * 12, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#092936");
  sky.addColorStop(0.37, "#31515a");
  sky.addColorStop(0.59, "#8d7658");
  sky.addColorStop(1, "#09191b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.22;
  const sunY = height * 0.22;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.3);
  glow.addColorStop(0, "rgba(255,214,130,.5)");
  glow.addColorStop(0.28, "rgba(243,185,67,.16)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height * 0.72);

  const drift = reduced ? 0 : Math.sin(time * 0.00008) * width * 0.02;
  ctx.fillStyle = "rgba(244,240,223,.045)";
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(
      ((i * 0.19 + 0.04) * width + drift * (i % 2 ? 1 : -1)) % (width * 1.1),
      height * (0.08 + (i % 3) * 0.055),
      width * (0.11 + (i % 2) * 0.04),
      18 + (i % 3) * 8,
      -0.06,
      0,
      TAU,
    );
    ctx.fill();
  }
}

export function drawLivingWorld(input: WorldDrawInput) {
  const {
    ctx,
    width,
    height,
    pixelRatio,
    time,
    progress,
    pointerX,
    pointerY,
    selected,
    sectors,
    reducedMotion,
    hideLabels,
  } = input;
  const mobile = width <= 600;
  const tablet = !mobile && width <= 900;
  const worldWidth = mobile ? MOBILE_WORLD_W : WORLD_W;
  const worldHeight = mobile ? MOBILE_WORLD_H : WORLD_H;
  const positions = mobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;
  const selectedPosition = positions[selected];
  const camera = cameraAt(progress, selectedPosition, mobile);
  const baseScale = tablet
    ? Math.min(width / worldWidth, height / worldHeight) * 1.15
    : Math.max(width / worldWidth, height / worldHeight);
  const depthX = reducedMotion ? 0 : pointerX * 10 * (1 - progress * 0.65);
  const depthY = reducedMotion ? 0 : pointerY * 7 * (1 - progress * 0.65);

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawAtmosphere(ctx, width, height, time, reducedMotion);

  ctx.save();
  ctx.translate(width / 2 + depthX, height / 2 + depthY);
  const scale = baseScale * camera.zoom;
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);

  const ground = ctx.createLinearGradient(0, 90, 0, worldHeight);
  ground.addColorStop(0, "rgba(17,56,58,.3)");
  ground.addColorStop(0.42, "rgba(16,46,43,.82)");
  ground.addColorStop(1, "rgba(5,18,19,.98)");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(mobile ? -120 : -180, mobile ? 90 : 95);
  ctx.lineTo(worldWidth + (mobile ? 120 : 180), mobile ? 90 : 95);
  ctx.lineTo(worldWidth + 260, worldHeight + 180);
  ctx.lineTo(-260, worldHeight + 180);
  ctx.closePath();
  ctx.fill();

  drawEuropeTerrain(ctx, mobile, selected);
  drawRoads(ctx, positions, time, mobile);

  const maxCount = Math.max(
    1,
    ...sectors.map((sector) => sector.totalCount ?? 0),
  );
  const ordered = [...sectors].sort(
    (a, b) => positions[a.id].y - positions[b.id].y,
  );
  for (const sector of ordered) {
    drawDistrict(
      ctx,
      sector,
      positions[sector.id],
      reducedMotion ? 0 : time,
      maxCount,
      sector.id === selected,
      hideLabels,
    );
  }

  const loopPhase = reducedMotion ? 0.58 : (time % 18000) / 18000;
  const scrollPhase = clamp((progress - 0.12) / 0.7);
  const processPhase = progress < 0.1 ? loopPhase : scrollPhase;
  drawEconomicProcess(ctx, selectedPosition, processPhase, time, reducedMotion);
  ctx.restore();

  const vignette = ctx.createRadialGradient(
    width * 0.53,
    height * 0.5,
    Math.min(width, height) * 0.18,
    width * 0.53,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.78, "rgba(1,11,14,.12)");
  vignette.addColorStop(1, "rgba(1,8,11,.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

export const WORLD_CANVAS_BUDGET = {
  maxDevicePixelRatio: 1.5,
  targetFramesPerSecond: 30,
  shippedRasterAssets: 0,
  runtimeDependenciesAdded: 0,
} as const;

export const WORLD_MAP_SOURCE_SIZE = { width: MAP_W, height: MAP_H } as const;
