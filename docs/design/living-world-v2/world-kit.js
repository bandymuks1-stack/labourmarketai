/**
 * WORLD KIT — the vocabulary every prototype is drawn from.
 *
 * The abstract version failed for one reason: horizon profiles are not
 * recognisable as WORK. A silhouette of a roofline could be anything. What
 * makes a scene read as a workplace inside two seconds, before any text, is
 * (1) human figures at believable scale and (2) machinery whose shape is
 * unmistakable — a tower crane, an excavator boom, a forklift mast, a truck
 * at a dock. So those are primitives here, not decoration added later.
 *
 * Everything returns an SVG string so a composition can loop and vary rather
 * than hand-place two hundred elements.
 */

/** A working human. ~18 units tall = roughly 1/8 of a 150-unit storey, which
 *  is the ratio that makes a building read as inhabited rather than as a
 *  diagram. `pose` changes the arms so a crowd never looks stamped. */
function figure(x, y, s = 1, pose = 0, fill = "var(--skin)") {
  const h = 18 * s;
  const head = 3.2 * s;
  const arms = [
    `M${x - 3.4 * s} ${y - h * 0.52} L${x + 3.4 * s} ${y - h * 0.52}`,
    `M${x - 3.6 * s} ${y - h * 0.66} L${x + 3.2 * s} ${y - h * 0.42}`,
    `M${x - 3.2 * s} ${y - h * 0.4} L${x + 3.6 * s} ${y - h * 0.66}`,
    `M${x - 2.6 * s} ${y - h * 0.58} L${x + 1.8 * s} ${y - h * 0.74}`,
  ][pose % 4];
  return `
    <g fill="${fill}" stroke="${fill}" stroke-linecap="round">
      <circle cx="${x}" cy="${y - h + head}" r="${head}" stroke="none"/>
      <path d="M${x} ${y - h + head * 1.8} L${x} ${y - h * 0.34}" stroke-width="${2.6 * s}"/>
      <path d="${arms}" stroke-width="${1.9 * s}" fill="none"/>
      <path d="M${x} ${y - h * 0.34} L${x - 2.6 * s} ${y}" stroke-width="${2.2 * s}"/>
      <path d="M${x} ${y - h * 0.34} L${x + 2.6 * s} ${y}" stroke-width="${2.2 * s}"/>
    </g>`;
}

/** Tower crane — the single most legible "work is happening here" object in
 *  any skyline. Drawn with a real counter-jib and a hook that carries a load,
 *  because a crane with nothing hanging from it reads as scenery. */
function towerCrane(x, groundY, height, reach, c = "var(--steel)") {
  const topY = groundY - height;
  const hookX = x + reach * 0.62;
  return `
    <g stroke="${c}" fill="none" stroke-width="2.2" stroke-linecap="round">
      <path d="M${x} ${groundY} L${x} ${topY}"/>
      ${Array.from({ length: Math.floor(height / 26) }, (_, i) => {
        const y1 = groundY - i * 26, y2 = y1 - 26;
        return `<path d="M${x - 5} ${y1} L${x + 5} ${y2} M${x + 5} ${y1} L${x - 5} ${y2}" stroke-width="1.1" opacity=".75"/>`;
      }).join("")}
      <path d="M${x - 5} ${groundY} L${x - 5} ${topY} M${x + 5} ${groundY} L${x + 5} ${topY}" stroke-width="1.4"/>
      <path d="M${x - reach * 0.3} ${topY} L${x + reach} ${topY}" stroke-width="2.6"/>
      <path d="M${x} ${topY - 22} L${x + reach * 0.92} ${topY} M${x} ${topY - 22} L${x - reach * 0.28} ${topY}" stroke-width="1.3"/>
      <path d="M${x} ${topY} L${x} ${topY - 22}" stroke-width="1.8"/>
      <path d="M${hookX} ${topY} L${hookX} ${topY + 54}" stroke-width="1.2"/>
      <rect x="${hookX - 11}" y="${topY + 54}" width="22" height="12" fill="${c}" opacity=".55" stroke="none"/>
      <rect x="${x - 16}" y="${topY - 12}" width="16" height="12" fill="${c}" opacity=".4" stroke="none"/>
    </g>`;
}

/** Excavator: tracks, cab, boom, dipper, bucket. */
function excavator(x, y, s = 1, c = "var(--machine)") {
  return `
    <g fill="${c}" stroke="${c}" stroke-width="${1.6 * s}" stroke-linejoin="round">
      <rect x="${x - 26 * s}" y="${y - 9 * s}" width="${52 * s}" height="${9 * s}" rx="${4 * s}" opacity=".9"/>
      <circle cx="${x - 18 * s}" cy="${y - 4.5 * s}" r="${3.4 * s}" fill="var(--void)"/>
      <circle cx="${x + 18 * s}" cy="${y - 4.5 * s}" r="${3.4 * s}" fill="var(--void)"/>
      <rect x="${x - 16 * s}" y="${y - 30 * s}" width="${30 * s}" height="${21 * s}" rx="${3 * s}" opacity=".95"/>
      <path d="M${x + 12 * s} ${y - 26 * s} L${x + 44 * s} ${y - 44 * s}" fill="none" stroke-width="${5 * s}"/>
      <path d="M${x + 44 * s} ${y - 44 * s} L${x + 56 * s} ${y - 20 * s}" fill="none" stroke-width="${4 * s}"/>
      <path d="M${x + 56 * s} ${y - 20 * s} l${-4 * s} ${9 * s} l${13 * s} ${2 * s} l${2 * s} ${-11 * s} z" opacity=".9"/>
    </g>`;
}

/** Articulated truck at a loading dock. */
function truck(x, y, s = 1, c = "var(--machine)") {
  return `
    <g fill="${c}" stroke="none">
      <rect x="${x}" y="${y - 30 * s}" width="${66 * s}" height="${26 * s}" rx="${2 * s}" opacity=".85"/>
      <rect x="${x + 68 * s}" y="${y - 26 * s}" width="${26 * s}" height="${22 * s}" rx="${3 * s}" opacity=".95"/>
      <rect x="${x + 74 * s}" y="${y - 22 * s}" width="${13 * s}" height="${9 * s}" rx="${1.5 * s}" fill="var(--glass)"/>
      <circle cx="${x + 14 * s}" cy="${y - 2 * s}" r="${4.4 * s}" fill="var(--void)" stroke="${c}" stroke-width="${1.6 * s}"/>
      <circle cx="${x + 52 * s}" cy="${y - 2 * s}" r="${4.4 * s}" fill="var(--void)" stroke="${c}" stroke-width="${1.6 * s}"/>
      <circle cx="${x + 80 * s}" cy="${y - 2 * s}" r="${4.4 * s}" fill="var(--void)" stroke="${c}" stroke-width="${1.6 * s}"/>
    </g>`;
}

/** Forklift with a raised mast and a pallet on the forks. */
function forklift(x, y, s = 1, c = "var(--machine)") {
  return `
    <g fill="${c}" stroke="${c}" stroke-width="${1.4 * s}">
      <rect x="${x - 14 * s}" y="${y - 16 * s}" width="${26 * s}" height="${12 * s}" rx="${2 * s}"/>
      <rect x="${x - 10 * s}" y="${y - 26 * s}" width="${14 * s}" height="${11 * s}" rx="${2 * s}" opacity=".8"/>
      <path d="M${x + 13 * s} ${y - 30 * s} L${x + 13 * s} ${y - 3 * s}" stroke-width="${2.4 * s}"/>
      <path d="M${x + 13 * s} ${y - 12 * s} L${x + 26 * s} ${y - 12 * s}" stroke-width="${2 * s}"/>
      <rect x="${x + 15 * s}" y="${y - 22 * s}" width="${18 * s}" height="${9 * s}" fill="var(--timber)" stroke="none"/>
      <circle cx="${x - 8 * s}" cy="${y - 2 * s}" r="${3.4 * s}" fill="var(--void)"/>
      <circle cx="${x + 8 * s}" cy="${y - 2 * s}" r="${3.4 * s}" fill="var(--void)"/>
    </g>`;
}

/** Warehouse racking, filled unevenly — a full rack reads as a wall, a half
 *  empty one reads as a place goods move through. */
function racking(x, y, bays, levels, w = 46, lh = 26, c = "var(--steel)") {
  let out = `<g stroke="${c}" stroke-width="1.6" fill="none" opacity=".9">`;
  for (let b = 0; b <= bays; b += 1) out += `<path d="M${x + b * w} ${y} L${x + b * w} ${y - levels * lh}"/>`;
  for (let l = 0; l <= levels; l += 1) out += `<path d="M${x} ${y - l * lh} L${x + bays * w} ${y - l * lh}"/>`;
  out += "</g>";
  for (let b = 0; b < bays; b += 1) {
    for (let l = 0; l < levels; l += 1) {
      if ((b * 7 + l * 3) % 4 === 0) continue;
      out += `<rect x="${x + b * w + 6}" y="${y - (l + 1) * lh + 6}" width="${w - 12}" height="${lh - 9}" fill="var(--timber)" opacity=".55"/>`;
    }
  }
  return out;
}

/** A lit interior room — the cutaway's basic unit. */
function room(x, y, w, h, tint = "var(--warm)", op = 0.16) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${tint}" opacity="${op}"/>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="var(--steel)" stroke-width="1.1" opacity=".55"/>`;
}

/** Desks + monitors, for the office layer. */
function desks(x, y, n, s = 1) {
  let o = "";
  for (let i = 0; i < n; i += 1) {
    const dx = x + i * 54 * s;
    o += `<rect x="${dx}" y="${y - 4 * s}" width="${34 * s}" height="${3 * s}" fill="var(--timber)" opacity=".8"/>
          <rect x="${dx + 8 * s}" y="${y - 15 * s}" width="${17 * s}" height="${11 * s}" rx="${1.5 * s}" fill="var(--glass)" opacity=".95"/>
          <path d="M${dx + 4 * s} ${y - 1 * s} L${dx + 4 * s} ${y + 6 * s} M${dx + 30 * s} ${y - 1 * s} L${dx + 30 * s} ${y + 6 * s}" stroke="var(--timber)" stroke-width="${1.4 * s}" opacity=".7"/>`;
    o += figure(dx + 17 * s, y + 6 * s, 0.62 * s, i % 4);
  }
  return o;
}

/** Hospital beds, for the care layer. */
function beds(x, y, n, s = 1) {
  let o = "";
  for (let i = 0; i < n; i += 1) {
    const dx = x + i * 62 * s;
    o += `<rect x="${dx}" y="${y - 8 * s}" width="${40 * s}" height="${5 * s}" rx="${2 * s}" fill="var(--linen)" opacity=".85"/>
          <rect x="${dx}" y="${y - 15 * s}" width="${9 * s}" height="${7 * s}" fill="var(--linen)" opacity=".6"/>
          <path d="M${dx + 44 * s} ${y - 26 * s} L${dx + 44 * s} ${y - 2 * s}" stroke="var(--steel)" stroke-width="${1.4 * s}"/>
          <rect x="${dx + 41 * s}" y="${y - 30 * s}" width="${7 * s}" height="${6 * s}" fill="var(--glass)" opacity=".8"/>`;
    o += figure(dx + 52 * s, y, 0.6 * s, (i + 1) % 4);
  }
  return o;
}

/** Kitchen pass with extractor hood and burners. */
function kitchen(x, y, w, s = 1) {
  let o = `<rect x="${x}" y="${y - 6 * s}" width="${w}" height="${5 * s}" fill="var(--steel)" opacity=".8"/>
           <rect x="${x + 10 * s}" y="${y - 40 * s}" width="${w - 20 * s}" height="${9 * s}" fill="var(--steel)" opacity=".55"/>`;
  for (let i = 0; i < 4; i += 1) {
    o += `<circle cx="${x + 22 * s + i * 26 * s}" cy="${y - 8 * s}" r="${4 * s}" fill="var(--ember)" opacity=".9"/>`;
    o += `<path d="M${x + 22 * s + i * 26 * s} ${y - 14 * s} q ${3 * s} ${-8 * s} 0 ${-14 * s}" stroke="var(--linen)" stroke-width="${1.2 * s}" fill="none" opacity=".28"/>`;
  }
  o += figure(x + w * 0.3, y + 12 * s, 0.66 * s, 1) + figure(x + w * 0.66, y + 12 * s, 0.66 * s, 3);
  return o;
}

/** Greenhouse span with planting rows. */
function greenhouse(x, y, w, h, s = 1) {
  let o = `<path d="M${x} ${y} L${x} ${y - h * 0.6} Q ${x + w / 2} ${y - h * 1.35} ${x + w} ${y - h * 0.6} L${x + w} ${y} Z"
            fill="var(--glass)" opacity=".13" stroke="var(--steel)" stroke-width="1.3"/>`;
  for (let i = 1; i < 6; i += 1) {
    const gx = x + (w / 6) * i;
    o += `<path d="M${gx} ${y} L${gx} ${y - h * 0.62 - Math.sin((i / 6) * Math.PI) * h * 0.5}" stroke="var(--steel)" stroke-width=".9" opacity=".5"/>`;
  }
  for (let r = 0; r < 3; r += 1) {
    o += `<rect x="${x + 14}" y="${y - 10 - r * 13}" width="${w - 28}" height="${5}" fill="var(--sap)" opacity=".55"/>`;
  }
  o += figure(x + w * 0.34, y, 0.6 * s, 2) + figure(x + w * 0.7, y, 0.6 * s, 0);
  return o;
}

if (typeof module !== "undefined") {
  module.exports = { figure, towerCrane, excavator, truck, forklift, racking, room, desks, beds, kitchen, greenhouse };
}
