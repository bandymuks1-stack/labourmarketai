/* R11 — LabourMarket.ai living-world visual target.
   One art-directed miniature diorama system: single warm western light,
   lit-left / shaded-right volumes, cast shadows to the right, cool
   atmospheric depth far, warm human foreground near. Pure vector — the
   same system later becomes the animated live slice. */
(function () {
  "use strict";

  /* ── palette ── */
  var P = {
    skyHi: "#b9d2df", skyLo: "#ffe3bd", sun: "#ffd9a0",
    farLand: "#c3d3d8", farLand2: "#afc4cd", farLight: "#ffddab",
    seaHi: "#4c8d92", seaLo: "#1f5b66", glint: "#ffd9a0",
    ridge: "#8fb0a4", ridge2: "#7ba191",
    grass: "#a8c891", grass2: "#8fb87b", field: "#d9c98a", field2: "#c2b072",
    quay: "#e8dcc4", quay2: "#d9cbae", road: "#c7bda6", roadLine: "#efe6d2",
    cream: "#f4e9d4", terra: "#d98a63", brick: "#c05f48", rust: "#e07a50",
    slate: "#5c7280", slate2: "#48596a", wood: "#a97c50",
    crane: "#e0704a", crane2: "#b9503a",
    box1: "#c96a4d", box2: "#4f7f95", box3: "#d9a441", box4: "#6c9a70",
    win: "#ffc97e", winHot: "#ffb95c", door: "#ffbf6e",
    shadow: "rgba(43, 66, 78, 0.20)", shadowSoft: "rgba(43, 66, 78, 0.12)",
    people: ["#3e6e8e", "#c75b39", "#e0a33c", "#5c7a52", "#8e5f9e", "#b0483f"],
    skin: ["#e8b48c", "#c98e64", "#a06a44", "#8a5a3b"],
    vest: "#f5a63c", helm: "#f2d049",
    thread: "#ffb25e",
  };

  function lighten(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * f); g = Math.round(g + (255 - g) * f); b = Math.round(b + (255 - b) * f);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function darken(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round((n >> 16) * (1 - f)), g = Math.round(((n >> 8) & 255) * (1 - f)), b = Math.round((n & 255) * (1 - f));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  /* group helper: place content at x,y scale s */
  function g(x, y, s, inner, extra) {
    return '<g transform="translate(' + x + " " + y + ')' +
      (s !== 1 ? " scale(" + s + ")" : "") + '"' + (extra || "") + ">" + inner + "</g>";
  }
  /* long soft cast shadow to the right (sun low left) */
  function shadowBlob(w, h, dx) {
    return '<ellipse cx="' + (dx == null ? w * 0.55 : dx) + '" cy="1" rx="' + w + '" ry="' + h +
      '" fill="' + P.shadow + '" filter="url(#soft1)"/>';
  }
  /* warm light spilling from a doorway to the lower-left */
  function spill(w, h) {
    return '<path d="M0 0 L' + w + ' 0 L' + (w * 1.9) + " " + h + " L" + (-w * 0.9) + " " + h +
      ' Z" fill="url(#spillG)" opacity="0.55"/>';
  }
  /* foreground pavement: receding joint lines */
  function pavement(w, y0, y1, col) {
    var s = "", y = y0, step = 14;
    while (y < y1) {
      s += '<path d="M0 ' + y + " Q" + (w / 2) + " " + (y - 6) + " " + w + " " + y +
        '" stroke="' + darken(col, 0.07) + '" stroke-width="1.4" fill="none"/>';
      step *= 1.22; y += step;
    }
    return s;
  }

  /* ── DEFS ── */
  function defs() {
    return '<defs>' +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + P.skyHi + '"/><stop offset="0.62" stop-color="#e8ddc2"/><stop offset="1" stop-color="' + P.skyLo + '"/></linearGradient>' +
      '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + P.seaHi + '"/><stop offset="1" stop-color="' + P.seaLo + '"/></linearGradient>' +
      '<radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#fff3d9" stop-opacity="0.95"/><stop offset="0.4" stop-color="' + P.sun + '" stop-opacity="0.55"/><stop offset="1" stop-color="' + P.sun + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="' + P.win + '" stop-opacity="0.85"/><stop offset="1" stop-color="' + P.win + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="thread" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + P.thread + '" stop-opacity="0"/><stop offset="0.5" stop-color="' + P.thread + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + P.thread + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="vign" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2b4550" stop-opacity="0.22"/><stop offset="0.25" stop-color="#2b4550" stop-opacity="0"/>' +
      '<stop offset="0.82" stop-color="#2b4550" stop-opacity="0"/><stop offset="1" stop-color="#22343d" stop-opacity="0.28"/></linearGradient>' +
      '<filter id="soft2"><feGaussianBlur stdDeviation="2.2"/></filter>' +
      '<filter id="soft1"><feGaussianBlur stdDeviation="1.1"/></filter>' +
      '<filter id="glowF"><feGaussianBlur stdDeviation="3.4"/></filter>' +
      '<linearGradient id="spillG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + P.win + '" stop-opacity="0.75"/><stop offset="1" stop-color="' + P.win + '" stop-opacity="0"/></linearGradient>' +
      "</defs>";
  }

  /* ── volume primitive: front + top + side, lit from left ── */
  function box(w, h, d, col, opts) {
    opts = opts || {};
    var top = opts.top || lighten(col, 0.32);
    var side = opts.side || darken(col, 0.22);
    var s = "";
    s += '<path d="M0 0 L' + d * 0.55 + " " + (-d * 0.5) + " L" + (w + d * 0.55) + " " + (-d * 0.5) + " L" + w + ' 0 Z" fill="' + top + '"/>';
    s += '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + col + '"/>';
    s += '<path d="M' + w + " 0 L" + (w + d * 0.55) + " " + (-d * 0.5) + " L" + (w + d * 0.55) + " " + (h - d * 0.5) + " L" + w + " " + h + ' Z" fill="' + side + '"/>';
    return s;
  }
  function gable(w, h, rh, col, roof) {
    var s = "";
    s += '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + col + '"/>';
    s += '<path d="M-1 0 L' + (w / 2) + " " + (-rh) + " L" + (w + 1) + ' 0 Z" fill="' + roof + '"/>';
    return s;
  }
  function windows(w, h, cols, rows, litP, size, onlyLit) {
    var s = "", gw = w / (cols + 1), gh = h / (rows + 1), sz = size || 2.4;
    for (var r = 1; r <= rows; r++) for (var c = 1; c <= cols; c++) {
      var lit = ((r * 7 + c * 13) % 10) / 10 < litP;
      if (!lit && onlyLit) continue;
      s += '<rect x="' + (c * gw - sz / 2) + '" y="' + (r * gh - sz / 2) + '" width="' + sz + '" height="' + (sz * 1.25) +
        '" rx="0.5" fill="' + (lit ? P.win : "rgba(40,58,70,0.42)") + '"/>';
    }
    return s;
  }

  /* ── people (h ≈ 26 at s=1) ── */
  function person(pose, ci, si) {
    var c = P.people[ci % P.people.length], sk = P.skin[si % P.skin.length];
    var s = "";
    function bits(body, arms, legs) {
      return '<path d="' + legs + '" stroke="' + darken(c, 0.42) + '" stroke-width="3.3" fill="none" stroke-linecap="round"/>' +
        '<path d="' + body + '" fill="' + c + '"/>' +
        '<path d="M2.2 -18.5 Q3.8 -13 3 -8" stroke="' + darken(c, 0.18) + '" stroke-width="1.6" fill="none"/>' +
        '<path d="' + arms + '" stroke="' + c + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<circle cx="0" cy="-21.5" r="3.7" fill="' + sk + '"/>';
    }
    switch (pose) {
      case "walk": s = bits("M-3 -18 Q0 -20 3 -18 L2.6 -8 Q0 -6.5 -2.6 -8 Z", "M-2 -16 L-5 -9 M2 -16 L5 -11", "M-1.5 -8 L-5 0 M1.5 -8 L4 0"); break;
      case "carry": s = '<rect x="2" y="-19" width="8" height="6.4" rx="1" fill="' + P.box3 + '"/>' +
        bits("M-3 -18 Q0 -20 3 -18 L2.6 -8 Q0 -6.5 -2.6 -8 Z", "M-2 -16 L4 -14.5 M2 -16 L7 -15", "M-1.5 -8 L-3.4 0 M1.5 -8 L3.4 0"); break;
      case "wave": s = bits("M-3 -18 Q0 -20 3 -18 L2.6 -8 Q0 -6.5 -2.6 -8 Z", "M-2 -16 L-6 -22 M2 -16 L5 -10", "M-1.5 -8 L-3 0 M1.5 -8 L3 0"); break;
      case "point": s = bits("M-3 -18 Q0 -20 3 -18 L2.6 -8 Q0 -6.5 -2.6 -8 Z", "M-2 -16 L-4 -10 M2 -16 L8 -18", "M-1.5 -8 L-3 0 M1.5 -8 L3.5 0"); break;
      default: s = bits("M-3 -18 Q0 -20 3 -18 L2.6 -8 Q0 -6.5 -2.6 -8 Z", "M-2 -16 L-4.4 -9.5 M2 -16 L4.4 -9.5", "M-1.5 -8 L-2.6 0 M1.5 -8 L2.6 0");
    }
    return s;
  }
  function workerVest(pose, si) {
    return person(pose, 0, si).replace('fill="' + P.people[0] + '"', 'fill="' + P.vest + '"')
      .replace('stroke="' + P.people[0] + '"', 'stroke="' + P.vest + '"') +
      '<path d="M-3.4 -23.4 Q0 -26.4 3.4 -23.4" stroke="' + P.helm + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  }
  function handshake(c1, c2) {
    return g(-7, 0, 1, person("point", c1, 0)) +
      g(7, 0, 1, '<g transform="scale(-1,1)">' + person("point", c2, 1) + "</g>") +
      '<circle cx="0" cy="-17" r="1.6" fill="#fff" opacity="0.9"/>';
  }

  /* ── vehicles / equipment ── */
  function forklift() {
    return shadowBlob(15, 3.4, 4) +
      '<rect x="10" y="-10" width="3" height="10" fill="' + P.slate2 + '"/>' +
      '<rect x="-12" y="-9" width="20" height="7" rx="2" fill="' + P.crane + '"/>' +
      '<rect x="-9" y="-16" width="11" height="8" rx="2" fill="' + darken(P.crane, 0.18) + '"/>' +
      '<rect x="-7.4" y="-14.4" width="6.4" height="4.4" rx="1" fill="' + P.win + '"/>' +
      '<circle cx="-7" cy="0" r="3.6" fill="' + P.slate2 + '"/><circle cx="5" cy="0" r="3.6" fill="' + P.slate2 + '"/>' +
      '<rect x="12" y="-6" width="9" height="1.6" fill="' + P.slate2 + '"/>' +
      '<rect x="12.6" y="-13" width="7" height="6.4" rx="0.8" fill="' + P.box3 + '"/>';
  }
  function truck(col) {
    return shadowBlob(17, 3.2, 5) +
      '<rect x="-16" y="-12" width="24" height="9" rx="1.4" fill="' + (col || P.box2) + '"/>' +
      '<rect x="9" y="-10" width="8" height="7" rx="1.6" fill="' + P.rust + '"/>' +
      '<rect x="10.4" y="-8.8" width="4" height="3" rx="0.8" fill="' + P.win + '"/>' +
      '<circle cx="-9" cy="-2" r="3" fill="' + P.slate2 + '"/><circle cx="1" cy="-2" r="3" fill="' + P.slate2 + '"/><circle cx="12" cy="-2" r="3" fill="' + P.slate2 + '"/>';
  }
  function ship() {
    return '<path d="M-38 0 L38 0 L30 10 L-32 10 Z" fill="' + darken(P.brick, 0.25) + '"/>' +
      '<rect x="-30" y="-7" width="52" height="7" fill="' + P.cream + '"/>' +
      '<rect x="14" y="-15" width="10" height="8" fill="' + P.slate + '"/>' +
      '<rect x="15.6" y="-13.4" width="6.4" height="2.6" fill="' + P.win + '"/>' +
      '<rect x="-26" y="-13" width="9" height="6" fill="' + P.box1 + '"/><rect x="-16" y="-13" width="9" height="6" fill="' + P.box2 + '"/>' +
      '<rect x="-6" y="-13" width="9" height="6" fill="' + P.box4 + '"/><rect x="-21" y="-19" width="9" height="6" fill="' + P.box3 + '"/>' +
      '<path d="M-44 4 Q-36 1 -30 4 M30 5 Q38 2 46 5" stroke="#ffffff55" stroke-width="2" fill="none"/>';
  }
  function craneTower(lift) {
    var hookY = -46 + (lift || 0);
    return shadowBlob(20, 3.6, 10) +
      '<rect x="-2.6" y="-58" width="5.2" height="58" fill="' + P.crane + '"/>' +
      '<path d="M-2.6 -14 L2.6 -22 M-2.6 -30 L2.6 -38 M-2.6 -46 L2.6 -54" stroke="' + darken(P.crane, 0.3) + '" stroke-width="1.4"/>' +
      '<rect x="-14" y="-62" width="58" height="4" fill="' + P.crane + '"/>' +
      '<path d="M-14 -62 L0 -70 L20 -62" stroke="' + P.crane2 + '" stroke-width="2" fill="none"/>' +
      '<rect x="-13" y="-58" width="8" height="6" fill="' + P.crane2 + '"/>' +
      '<line x1="30" y1="-58" x2="30" y2="' + hookY + '" stroke="' + P.slate2 + '" stroke-width="1.2"/>' +
      '<rect x="25" y="' + hookY + '" width="10" height="7" rx="1" fill="' + P.box1 + '"/>';
  }
  function portCrane() {
    return '<path d="M0 0 L0 -34 L26 -46 L28 -42 L6 -32 L6 0 Z" fill="' + P.crane + '"/>' +
      '<rect x="-4" y="-14" width="14" height="14" fill="' + P.crane2 + '"/>' +
      '<rect x="-1.6" y="-11.6" width="6" height="4" fill="' + P.win + '"/>' +
      '<line x1="24" y1="-44" x2="24" y2="-20" stroke="' + P.slate2 + '" stroke-width="1.1"/>' +
      '<rect x="19.6" y="-20" width="9" height="6.4" rx="0.8" fill="' + P.box2 + '"/>';
  }
  function containerRow(n) {
    var cols = [P.box1, P.box2, P.box3, P.box4], s = "";
    for (var i = 0; i < n; i++)
      s += g(i * 11, -((i * 7) % 2) * 5, 1, box(10, 6, 4, cols[(i * 5 + 1) % 4]));
    return s;
  }
  function turbine(rot) {
    return '<rect x="-1.1" y="-30" width="2.2" height="30" fill="#e9eef0"/>' +
      '<g transform="translate(0 -30) rotate(' + (rot || 0) + ')">' +
      '<path d="M0 0 L2 -16 L-2 -16 Z M0 0 L14 8 L11 11 Z M0 0 L-14 8 L-11 11 Z" fill="#f4f7f8"/>' +
      '<circle r="1.8" fill="#dfe6e9"/></g>';
  }
  function tree(col) {
    return '<rect x="-1" y="-6" width="2" height="6" fill="' + P.wood + '"/>' +
      '<circle cx="0" cy="-10" r="5.4" fill="' + (col || P.grass2) + '"/>' +
      '<circle cx="-3" cy="-8" r="3.4" fill="' + darken(col || P.grass2, 0.12) + '"/>';
  }
  function lamp() {
    return '<rect x="-0.8" y="-22" width="1.6" height="22" fill="' + P.slate2 + '"/>' +
      '<circle cx="0" cy="-23" r="2" fill="' + P.win + '"/>' +
      '<circle cx="0" cy="-23" r="7" fill="url(#lampGlow)"/>';
  }
  function greenhouse() {
    return box(34, 12, 8, "#cfe4de", { top: "#eaf6f2" }) +
      '<path d="M0 0 L17 -9 L34 0" stroke="#ffffff88" stroke-width="1.4" fill="none"/>' +
      '<rect x="3" y="3" width="28" height="6" fill="#a9d3b8" opacity="0.7"/>';
  }
  function fieldRows(w, h, col) {
    var s = '<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="3" fill="' + col + '"/>';
    for (var i = 6; i < w; i += 9)
      s += '<line x1="' + i + '" y1="2" x2="' + (i - h * 0.35) + '" y2="' + (h - 2) + '" stroke="' + darken(col, 0.14) + '" stroke-width="2.4"/>';
    return s;
  }

  /* ── construction: frame → done pair (the story) ── */
  function siteFrame() {
    var s = shadowBlob(30, 5, 12);
    for (var f = 0; f < 3; f++)
      s += '<rect x="0" y="' + (-14 * (f + 1)) + '" width="46" height="2.6" fill="' + P.cream + '"/>';
    for (var c = 0; c <= 4; c++)
      s += '<rect x="' + (c * 11) + '" y="-42" width="2.6" height="42" fill="' + darken(P.cream, 0.18) + '"/>';
    s += '<rect x="0" y="-46" width="30" height="4" fill="' + P.rust + '" opacity="0.9"/>';
    return s;
  }
  function doneBuilding() {
    return shadowBlob(28, 5, 12) + box(44, 52, 12, P.terra, {}) +
      g(0, 0, 1, '<g transform="translate(0 -52)"></g>') +
      '<g transform="translate(0 -52)"></g>' +
      '<rect x="0" y="-52" width="44" height="0" fill="none"/>' +
      windows(44, 40, 4, 4, 0.85, 3).replace(/<rect/g, '<rect transform="translate(0 -46)"') +
      '<rect x="17" y="-9" width="10" height="9" rx="1" fill="' + P.door + '"/>';
  }

  /* ── FAR Europe backdrop ── */
  function farEurope(w) {
    var s = "";
    s += '<path d="M0 96 Q' + w * 0.14 + " 70 " + w * 0.26 + " 84 T" + w * 0.5 + " 74 T" + w * 0.72 + " 88 T" + w + ' 70 L' + w + " 130 L0 130 Z\" fill=\"" + P.farLand2 + '" opacity="0.85" filter="url(#soft2)"/>';
    s += '<path d="M' + w * 0.08 + " 112 Q" + w * 0.3 + " 92 " + w * 0.52 + " 104 T" + w + ' 96 L' + w + " 150 L0 150 Z\" fill=\"" + P.farLand + '" filter="url(#soft1)"/>';
    for (var i = 0; i < 34; i++) {
      var x = (i * 97 + 31) % w, y = 92 + ((i * 53) % 44);
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + (0.9 + (i % 3) * 0.5) + '" fill="' + P.farLight + '" opacity="' + (0.5 + (i % 4) * 0.12) + '"/>';
    }
    return s;
  }

  window.LM = {
    P: P, defs: defs, g: g, box: box, gable: gable, windows: windows,
    person: person, workerVest: workerVest, handshake: handshake,
    forklift: forklift, truck: truck, ship: ship, craneTower: craneTower,
    portCrane: portCrane, containerRow: containerRow, turbine: turbine,
    tree: tree, lamp: lamp, greenhouse: greenhouse, fieldRows: fieldRows,
    siteFrame: siteFrame, farEurope: farEurope,
    lighten: lighten, darken: darken, shadowBlob: shadowBlob,
    spill: spill, pavement: pavement,
  };
})();
