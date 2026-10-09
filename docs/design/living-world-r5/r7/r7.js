/* R7 application runtime — R&D prototype, no production surface.
   One app, one state. Views swap in place; nothing here is a page. */
(function () {
  "use strict";
  var D = window.R7, IMG = window.R7_IMG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var app = $("#app");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var capName = function (slug) { return D.capLt[slug] || slug; };
  var fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };

  /* ── images ── */
  function img(key, cls) {
    if (!IMG[key]) return "";
    return '<img class="' + (cls || "") + '" src="' + IMG[key] + '" alt="Įrodymo nuotrauka">';
  }

  /* ── toasts ── */
  function toast(txt, amber) {
    var t = document.createElement("div");
    t.className = "toast" + (amber ? " amber" : "");
    t.innerHTML = "<i></i>" + txt;
    $("#toasts").appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "0.4s"; }, 3400);
    setTimeout(function () { t.remove(); }, 3900);
  }

  /* ── clock ── */
  function tickClock() {
    var d = new Date();
    $("#clock").textContent =
      ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  tickClock(); setInterval(tickClock, 30000);

  /* ══ router ══ */
  var crumbs = {
    entry: ["LabourMarket.ai", ""],
    workspace: ["Mano erdvė", "Šiandien"],
    journal: ["Dienoraštis", "Šiandien"],
    identity: ["Gyvoji tapatybė", "Gebėjimai"],
    opps: ["Kryptys", "Göteborg"],
    orgtoday: ["Skandi Terminalas AB", "Šiandien"],
    project: ["Objektai", "Terminalo plėtra"],
    inquiry: ["Užklausos", "Terminalo plėtra"],
    world: ["Gyvasis pasaulis", "Švedija"],
  };
  function go(view) {
    if (!$('.view[data-v="' + view + '"]')) return;
    app.dataset.view = view;
    $$(".view").forEach(function (v) { v.classList.toggle("is-on", v.dataset.v === view); });
    $$("[data-go]").forEach(function (b) {
      if (b.classList.contains("nav-it") || b.classList.contains("tb"))
        b.classList.toggle("is-on", b.dataset.go === view);
    });
    var c = crumbs[view] || [view, ""];
    $("#crumb").innerHTML = "<b>" + c[0] + "</b>" + (c[1] ? "<span>›</span><em>" + c[1] + "</em>" : "");
    if (view === "world" || view === "entry") worldWake(); else worldSleep();
    closeDrawer();
  }
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (g) go(g.dataset.go);
  });

  /* ── context switch ── */
  function setCtx(ctx) {
    app.dataset.ctx = ctx;
    $$(".ctx-btn").forEach(function (b) { b.classList.toggle("is-on", b.dataset.ctxBtn === ctx); });
    $('.nav[data-nav="me"]').hidden = ctx !== "me";
    $('.nav[data-nav="org"]').hidden = ctx !== "org";
    if (ctx === "org") {
      $("#userAva").textContent = D.org.initials;
      $("#userName").textContent = D.org.name;
      $("#userSub").textContent = D.org.tag + " · " + D.org.place;
      go("orgtoday");
    } else {
      $("#userAva").textContent = D.persona.initials;
      $("#userName").textContent = D.persona.name;
      $("#userSub").textContent = "Sandėlys · Göteborg";
      go("workspace");
    }
  }
  $$(".ctx-btn").forEach(function (b) {
    b.addEventListener("click", function () { setCtx(b.dataset.ctxBtn); });
  });
  $$("[data-enter]").forEach(function (b) {
    b.addEventListener("click", function () { setCtx(b.dataset.enter); });
  });

  /* ══ drawer ══ */
  function openDrawer(title, html) {
    $("#drTitle").textContent = title;
    $("#drBody").innerHTML = html;
    $("#drawer").classList.add("is-open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#drawerScrim").classList.add("is-open");
  }
  function closeDrawer() {
    $("#drawer").classList.remove("is-open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#drawerScrim").classList.remove("is-open");
  }
  $("#drClose").addEventListener("click", closeDrawer);
  $("#drawerScrim").addEventListener("click", closeDrawer);

  /* ══ 02 workspace: chat ══ */
  var chat = $("#chatScroll");
  function msgUser(txt) {
    var m = document.createElement("div");
    m.className = "msg me";
    m.innerHTML = '<span class="ava sm">JV</span><div class="msg-b">' + txt + "</div>";
    chat.appendChild(m); chat.scrollTop = chat.scrollHeight;
  }
  function msgAi(html) {
    var m = document.createElement("div");
    m.className = "msg ai";
    m.innerHTML = '<span class="ava sm">AI</span><div class="msg-b">' + html + "</div>";
    chat.appendChild(m); chat.scrollTop = chat.scrollHeight;
    return m;
  }
  function jrCard(t, txt, caps) {
    return '<button class="act-card" data-go="journal"><span class="act-ic jr">▤</span>' +
      "<span><b>Įrašyta į dienoraštį · " + t + "</b><i>" + txt + "</i></span>" +
      '<span class="mono">' + caps.map(capName).join(" · ") + "</span></button>";
  }
  function opCard2(slug) {
    var p = D.real.cityProfessions[slug];
    return '<button class="act-card" data-op="' + slug + '"><span class="act-ic op">◈</span>' +
      "<span><b>" + p.lt + " · Göteborg</b><i>susijusi kryptis pagal tavo gebėjimus</i></span>" +
      '<span class="mono">' + p.n + " aktyvios</span></button>";
  }
  /* seeded conversation — the state the owner lands in */
  msgUser("Šiandien iškroviau 18 palečių, patikrinau siuntas ir paruošiau krovą popietės reisams.");
  msgAi(
    "Užfiksavau tris darbus ir pridėjau prie tavo įrodymų. Palečių tvarkymo įrašų šįmet jau <b>31</b>." +
    '<div class="msg-cards">' +
    jrCard("08:12", "18 palečių iškrauta iš rytinio reiso", ["pallet-handling", "forklift-operation"]) +
    jrCard("13:20", "Paruošta krova 4 popietės reisams", ["order-picking", "packaging"]) +
    "</div>"
  );
  msgAi(
    "Pagal šiuos gebėjimus Göteborge dabar matau dvi gyvas kryptis:" +
    '<div class="msg-cards">' + opCard2("warehouse_worker") + opCard2("driver") + "</div>"
  );
  var replies = [
    function (txt) {
      addJournalEntry(txt);
      return "Įrašiau į dienoraštį. " +
        '<div class="msg-cards">' + jrCard(nowT(), txt, guessCaps(txt)) + "</div>";
    },
  ];
  function nowT() {
    var d = new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function guessCaps(txt) {
    var t = txt.toLowerCase();
    if (t.indexOf("palet") >= 0 || t.indexOf("krov") >= 0) return ["pallet-handling"];
    if (t.indexOf("vair") >= 0 || t.indexOf("prista") >= 0) return ["delivery-driving"];
    if (t.indexOf("sken") >= 0 || t.indexOf("patikr") >= 0) return ["barcode-scanning"];
    return ["warehouse-operations"];
  }
  function sendChat() {
    var inp = $("#chatInput"), txt = inp.value.trim();
    if (!txt) return;
    inp.value = "";
    msgUser(txt);
    setTimeout(function () {
      msgAi(replies[0](txt));
      toast("Naujas įrašas dienoraštyje", false);
    }, reduced ? 0 : 420);
  }
  $("#chatSend").addEventListener("click", sendChat);
  $("#chatInput").addEventListener("keydown", function (e) { if (e.key === "Enter") sendChat(); });

  /* workspace side: week strip + evidence */
  (function () {
    var days = ["P", "A", "T", "K", "Pn", "Š", "S"], today = 6;
    $("#weekStrip").innerHTML = days.map(function (d, i) {
      return '<div class="wd' + (i === today ? " is-today" : "") + '"><span>' + d + "</span><b>" +
        (10 + i) + '</b><i class="dot' + (i > today ? " off" : "") + '"></i></div>';
    }).join("");
    $("#evThumbs").innerHTML = ["pallets", "inventory", "forklift", "aisle"].map(function (k) {
      return img(k, "ev-img");
    }).join("");
  })();

  /* ══ 03 journal ══ */
  var jrDay = 0;
  function renderDayRail() {
    $("#dayRail").innerHTML = D.journal.map(function (d, i) {
      return '<button class="day-it' + (i === jrDay ? " is-on" : "") + '" data-day="' + i + '">' +
        "<b>" + d.day + '</b><span class="day-dots">' +
        d.entries.map(function () { return "<i></i>"; }).join("") +
        '</span><span class="mono">' + d.date + "</span></button>";
    }).join("");
    $$("#dayRail .day-it").forEach(function (b) {
      b.addEventListener("click", function () {
        jrDay = +b.dataset.day; renderDayRail(); renderStream();
      });
    });
  }
  function entryHtml(e, isNew) {
    return '<div class="jr-entry' + (isNew ? " is-new" : "") + '">' +
      '<span class="jr-time">' + e.t + "</span>" +
      '<div class="jr-main"><div class="jr-ctx">' + e.ctx + "</div>" +
      '<div class="jr-txt">' + e.txt + "</div>" +
      '<div class="jr-caps">' + e.caps.map(function (c) {
        return '<span class="tag tag-cyan">' + capName(c) + "</span>";
      }).join("") + (e.ev ? ' <span class="tag tag-ok">įrodymas</span>' : "") +
      "</div></div>" +
      '<div class="jr-right">' + (e.img ? img(e.img) : "") +
      '<span class="tag">savo įrašas</span></div></div>';
  }
  function renderStream(newIdx) {
    var d = D.journal[jrDay];
    $("#jrDayTitle").textContent = d.day + " · " + d.date;
    $("#jrStream").innerHTML = d.entries.map(function (e, i) {
      return entryHtml(e, i === newIdx);
    }).join("");
  }
  function addJournalEntry(txt) {
    D.journal[0].entries.unshift({ t: nowT(), ctx: "Terminalas 3", txt: txt, caps: guessCaps(txt), ev: false });
    $("#pinJournal").textContent = D.journal[0].entries.length;
    $("#stEntries").textContent = +$("#stEntries").textContent + 1;
    renderDayRail();
    if (jrDay === 0) renderStream(0);
  }
  $("#jrAdd").addEventListener("click", function () {
    var c = $("#jrCompose"); c.hidden = !c.hidden;
    if (!c.hidden) $("#jrTxt").focus();
  });
  function jrSave() {
    var txt = $("#jrTxt").value.trim();
    if (!txt) return;
    $("#jrTxt").value = ""; $("#jrCompose").hidden = true;
    jrDay = 0; addJournalEntry(txt);
    toast("Įrašas išsaugotas · " + nowT());
  }
  $("#jrSave").addEventListener("click", jrSave);
  $("#jrTxt").addEventListener("keydown", function (e) { if (e.key === "Enter") jrSave(); });
  /* month heat */
  (function () {
    var lv = [0,1,2,1,0,0,2,3,1,2,0,0,1,3,2,1,0,0,2,2,3,1,0,0,1,2,3,2];
    $("#monthHeat").innerHTML = '<div class="mh-title">Rugpjūtis · 34 įrašai</div><div class="mh-grid">' +
      lv.map(function (l) { return '<div class="mh-cell' + (l ? " l" + l : "") + '"></div>'; }).join("") + "</div>";
  })();
  renderDayRail(); renderStream();

  /* ══ 04 identity: capability map ══ */
  var clusters = {
    "Sandėlys": { x: 300, y: 265, color: "#63cfc4" },
    "Transportas": { x: 665, y: 175, color: "#f0a25c" },
    "Aptarnavimas": { x: 640, y: 420, color: "#9d8ce0" },
  };
  $("#idClusters").innerHTML = Object.keys(clusters).map(function (k) {
    var caps = D.capabilities.filter(function (c) { return c.cluster === k; });
    var ev = caps.reduce(function (s, c) { return s + c.evidence; }, 0);
    return '<div class="cl-row"><span class="cl-dot" style="background:' + clusters[k].color + '"></span><b>' +
      k + '</b><span class="mono">' + caps.length + " geb. · " + ev + " įrod.</span></div>";
  }).join("");
  (function () {
    var svg = $("#capMap"), NS = "http://www.w3.org/2000/svg";
    var pos = {
      "pallet-handling": [255, 165], "warehouse-operations": [400, 240],
      "forklift-operation": [175, 320], "order-picking": [355, 400],
      "barcode-scanning": [470, 120], "stock-taking": [140, 455], "packaging": [500, 470],
      "driving": [700, 90], "delivery-driving": [790, 235],
      "cashier": [540, 320], "customer-service": [780, 460],
    };
    var out = [];
    D.capabilities.forEach(function (c) {
      var p = pos[c.slug], h = clusters[c.cluster];
      if (p) out.push('<line class="cap-link" x1="' + p[0] + '" y1="' + p[1] + '" x2="' + h.x + '" y2="' + h.y + '"></line>');
    });
    Object.keys(clusters).forEach(function (k) {
      var h = clusters[k];
      out.push('<g class="cap-hub"><circle cx="' + h.x + '" cy="' + h.y + '" r="4" fill="' + h.color + '"></circle>' +
        '<text x="' + h.x + '" y="' + (h.y - 12) + '" text-anchor="middle">' + k + "</text></g>");
    });
    D.capabilities.forEach(function (c) {
      var p = pos[c.slug]; if (!p) return;
      var h = clusters[c.cluster];
      var r = 12 + Math.sqrt(c.entries) * 3.4;
      var glow = Math.min(0.85, 0.18 + c.evidence / 24);
      out.push('<g class="cap-node" data-cap="' + c.slug + '" role="button" tabindex="0">' +
        '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r + 7) + '" fill="' + h.color + '" opacity="0.08"></circle>' +
        '<circle class="core" cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + h.color + '" opacity="' + glow + '"></circle>' +
        '<text x="' + p[0] + '" y="' + (p[1] + r + 16) + '" text-anchor="middle">' + capName(c.slug) + "</text>" +
        '<text class="cnt" x="' + p[0] + '" y="' + (p[1] + r + 29) + '" text-anchor="middle">' +
        c.entries + " įr. · " + c.evidence + " įrod.</text></g>");
    });
    svg.innerHTML = out.join("");
    $$(".cap-node", svg).forEach(function (n) {
      n.addEventListener("click", function () { capDrawer(n.dataset.cap); });
    });
  })();
  function capDrawer(slug) {
    var c = D.capabilities.filter(function (x) { return x.slug === slug; })[0];
    if (!c) return;
    var related = Object.keys(D.real.professionSkills).filter(function (pr) {
      return D.real.professionSkills[pr].indexOf(slug) >= 0 && D.real.cityProfessions[pr];
    });
    var entries = [];
    D.journal.forEach(function (d) {
      d.entries.forEach(function (e) {
        if (e.caps.indexOf(slug) >= 0) entries.push({ d: d.day, e: e });
      });
    });
    openDrawer(capName(slug),
      '<div class="dr-nums"><div><b>' + c.entries + "</b><span>įrašai</span></div><div><b>" +
      c.evidence + '</b><span>su įrodymais</span></div><div><b>' + c.cluster + "</b><span>kontekstas</span></div></div>" +
      '<div class="dr-sec"><b>Iš darbo įrašų</b>' +
      (entries.length ? entries.slice(0, 3).map(function (x) {
        return '<button class="fact-row" data-go="journal">▤ ' + x.e.txt +
          '<span class="mono">' + x.d + " " + x.e.t + "</span></button>";
      }).join("") : '<span class="dim">Ankstesni įrašai — archyve.</span>') + "</div>" +
      '<div class="dr-sec"><b>Gyvos kryptys Göteborge</b>' +
      related.map(function (pr) {
        var p = D.real.cityProfessions[pr];
        return '<button class="fact-row" data-op="' + pr + '">◈ ' + p.lt +
          '<span class="mono">' + p.n + " aktyvios</span></button>";
      }).join("") + "</div>" +
      '<div class="dr-foot">Gebėjimas kaupiamas tik iš realių įrašų. Jokio balo, jokio procento.</div>');
  }

  /* ══ 05 opps ══ */
  var myCaps = D.capabilities.map(function (c) { return c.slug; });
  function overlap(pr) {
    return (D.real.professionSkills[pr] || []).filter(function (s) { return myCaps.indexOf(s) >= 0; });
  }
  var queries = {
    sandelis: { profs: ["warehouse_worker", "driver", "production_worker"], read: ["Göteborg", "7 įrodyti sandėlio gebėjimai", "klasifikuota rinkos dalis"] },
    vairuoti: { profs: ["driver", "warehouse_worker"], read: ["Göteborg", "vairavimo patirtis: 2 įrodymai", "krautuvo sąsaja"] },
    aptarnavimas: { profs: ["sales_assistant", "warehouse_worker"], read: ["Göteborg", "aptarnavimo istorija: 13 įrašų", "kasos darbas"] },
  };
  function renderOpps(qk) {
    var q = queries[qk];
    $("#opRead").innerHTML = q.read.map(function (r, i) {
      return '<span class="tag' + (i < 2 ? " tag-cyan" : "") + '">' + r + "</span>";
    }).join("");
    $("#opResults").innerHTML = q.profs.map(function (pr) {
      var p = D.real.cityProfessions[pr]; if (!p) return "";
      var ov = overlap(pr);
      var why = ov.length
        ? "<b>" + ov.length + "</b>&nbsp;tavo įrodyti gebėjimai yra šios krypties kataloge:&nbsp;" +
          ov.slice(0, 4).map(function (s) { return '<span class="tag tag-cyan">' + capName(s) + "</span>"; }).join("")
        : 'gretima kryptis — <span class="tag tag-cyan">' + capName("warehouse-operations") + "</span> patirtis persidengia";
      return '<button class="op-card" data-op="' + pr + '"><div><h3>' + p.lt +
        "<span>Göteborg</span></h3></div>" +
        '<div class="op-nums"><span><b>' + p.n + '</b> <span>aktyvios</span></span>' +
        "<span><b>" + p.employers + '</b> <span>darbdaviai</span></span></div>' +
        '<div class="op-why">Kodėl: ' + why + "</div></button>";
    }).join("");
  }
  function opSearch() {
    var t = $("#opInput").value.trim();
    if (!t) return;
    var k = /vair|vež|prista/i.test(t) ? "vairuoti" : /pardav|klient|aptarna|kas/i.test(t) ? "aptarnavimas" : "sandelis";
    $("#opQuery p").textContent = t;
    $("#opInput").value = "";
    renderOpps(k);
    toast("Kryptys atnaujintos pagal klausimą", true);
  }
  $("#opSend").addEventListener("click", opSearch);
  $("#opInput").addEventListener("keydown", function (e) { if (e.key === "Enter") opSearch(); });
  renderOpps("sandelis");

  /* 06 opportunity detail drawer */
  function opDrawer(pr) {
    var p = D.real.cityProfessions[pr]; if (!p) return;
    var ov = overlap(pr);
    var cat = D.real.professionSkills[pr] || [];
    openDrawer(p.lt + " · Göteborg",
      '<div class="dr-nums"><div><b>' + p.n + '</b><span>aktyvios vietos</span></div><div><b>' +
      p.employers + '</b><span>darbdaviai</span></div><div><b>08-15</b><span>atnaujinta</span></div></div>' +
      '<div class="dr-sec"><b>Kodėl tau — faktinės sąsajos</b>' +
      (ov.length ? ov.map(function (s) {
        var c = D.capabilities.filter(function (x) { return x.slug === s; })[0];
        return '<button class="fact-row" data-go="journal">✳ ' + capName(s) +
          '<span class="mono">' + (c ? c.evidence + " įrod." : "katalogas") + "</span></button>";
      }).join("") : '<span class="dim">Gretima kryptis pagal sandėlio operacijų patirtį.</span>') + "</div>" +
      '<div class="dr-sec"><b>Krypties katalogas</b><div class="cap-chips">' +
      cat.map(function (s) {
        return '<span class="tag' + (ov.indexOf(s) >= 0 ? " tag-cyan" : "") + '">' + capName(s) + "</span>";
      }).join("") + "</div></div>" +
      '<div class="dr-actions"><button class="btn btn-amber btn-sm">Sekti kryptį</button>' +
      '<button class="btn btn-ghost btn-sm" data-go="world">Rodyti pasaulyje ◉</button></div>' +
      '<div class="dr-foot">Skaičiai — realios aktyvios darbo vietos (Arbetsförmedlingen, CC0, 08-15). ' +
      "Sąsajos — tavo įrašų faktai. Jokio atitikimo procento nėra ir nebus.</div>");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-op]");
    if (b) { if (app.dataset.view !== "opps") go("opps"); opDrawer(b.dataset.op); }
  });

  /* ══ 07 org today ══ */
  function stRow(s) {
    var who = D.org.people.filter(function (p) { return p.ini === s.who; })[0];
    return '<div class="st-row"><span class="mono">' + s.t + '</span><span class="ava sm">' + s.who +
      '</span><div class="st-b"><p>' + s.txt + '</p><div class="jr-caps">' +
      s.caps.map(function (c) { return '<span class="tag tag-cyan">' + capName(c) + "</span>"; }).join("") +
      (who ? ' <span class="tag">' + who.role + "</span>" : "") + "</div></div></div>";
  }
  $("#orgStream").innerHTML = D.org.stream.map(stRow).join("");
  $("#orgSites").innerHTML = D.org.sites.map(function (s) {
    return '<button class="site-card' + (s.state === "gap" ? " is-gap" : "") + '" data-go="project"><div><b>' +
      s.name + "</b><i>" + s.sub + "</i></div>" +
      (s.state === "gap" ? '<span class="tag tag-rose">' + s.gap + "</span>" : "") +
      '<span class="mono">' + s.people + " žm.</span></button>";
  }).join("");
  function pRow(p) {
    return '<div class="p-row"><span class="p-on' + (p.on ? "" : " off") + '"></span><span class="ava sm">' +
      p.ini + "</span><div><b>" + p.name + "</b><i>" + p.role + '</i></div><div class="p-caps">' +
      p.caps.slice(0, 2).map(function (c) { return '<span class="tag">' + capName(c) + "</span>"; }).join("") +
      "</div></div>";
  }
  $("#orgPeople").innerHTML = D.org.people.map(pRow).join("");

  /* ══ 08 project ══ */
  $("#pjStream").innerHTML = D.org.stream.filter(function (s) { return s.site === 2 || s.who === "TP"; })
    .concat([{ t: "09:12", who: "EB", txt: "Suderintas stelažų 2 linijos pristatymas antradienį.", caps: ["warehouse-operations"] }])
    .map(stRow).join("");
  $("#pjWeek").innerHTML = D.project.week.map(function (d) {
    return '<div class="wg-day"><b>' + d.d + "</b>" + d.blocks.map(function (b, i) {
      return '<div class="wg-block' + (i % 2 ? " alt" : "") + '">' + b[0] + "<b>" + b[1] + " žm.</b></div>";
    }).join("") + "</div>";
  }).join("");
  $("#pjPeople").innerHTML = D.org.people.slice(0, 4).map(pRow).join("");
  $("#pjWall").innerHTML = D.project.milestones.map(function (m) {
    return '<div class="ev-card">' + img(m.img) + '<div class="ev-meta"><span class="mono">' +
      m.date + "</span>" + m.txt + "</div></div>";
  }).join("");
  $("#pjCap").innerHTML = D.project.capacity.map(function (c) {
    var gap = c.have < c.need;
    return '<div class="cap-row' + (gap ? " is-gap" : "") + '"><span class="cap-name">' + capName(c.slug) +
      '</span><span class="cap-bar"><i style="width:' + Math.round((c.have / c.need) * 100) + '%"></i></span>' +
      '<span class="cap-n">' + c.have + " / " + c.need + "</span>" +
      (gap ? '<button class="btn btn-amber btn-sm" data-inq="' + c.slug + '">Sukurti užklausą</button>'
           : '<span class="tag tag-ok">pakanka</span>') + "</div>";
  }).join("");
  $$(".tab", $("#pjTabs")).forEach(function (t) {
    t.addEventListener("click", function () {
      $$(".tab", $("#pjTabs")).forEach(function (x) { x.classList.toggle("is-on", x === t); });
      $$(".pj-pane").forEach(function (p) { p.classList.toggle("is-on", p.dataset.pane === t.dataset.tab); });
    });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-inq]");
    if (b) { go("inquiry"); toast("Užklausa sudaryta iš objekto trūkumo", true); }
    var t = e.target.closest("[data-pj-tab]");
    if (t) $('.tab[data-tab="' + t.dataset.pjTab + '"]').click();
  });

  /* ══ 09/10 inquiry ══ */
  $("#iqActivate").addEventListener("click", function () {
    var steps = $$("#iqStepper .step");
    steps[0].classList.remove("is-on"); steps[0].classList.add("is-done");
    steps[1].classList.add("is-on"); steps[2].classList.add("is-on");
    $("#iqState").textContent = "aktyvi";
    $("#iqState").className = "tag tag-ok";
    $("#iqActivate").disabled = true;
    $("#iqActivate").textContent = "Užklausa aktyvi";
    $("#iqActivate").classList.remove("btn-amber");
    $("#iqActivate").classList.add("btn-ghost");
    $("#iqResHint").textContent = "3 atitikmenys pagal įrodymus";
    var box = $("#iqSupply");
    box.classList.remove("is-idle");
    box.innerHTML = D.supply.map(function (s, i) {
      return '<div class="sup-card" style="animation-delay:' + (reduced ? 0 : i * 0.14) + 's">' +
        '<span class="ava">' + s.ini + "</span><div><b>Profilis " + s.ini + " · " + s.place +
        "</b><i>" + s.ctx + '</i><div class="jr-caps">' +
        s.evCaps.map(function (c) { return '<span class="tag tag-cyan">' + capName(c) + "</span>"; }).join("") +
        '</div></div><div class="sup-meta"><span class="mono">' + s.entries +
        " įrašai su įrodymais</span><br>" + s.from + "</div></div>";
    }).join("");
    $("#iqMarket").hidden = false;
    toast("Rasti 3 atitikmenys pagal faktus", true);
  });
  (function () {
    var idle = $("#iqSupply");
    idle.innerHTML = "Atitikmenys atsiras aktyvavus užklausą — tik pagal įrašų faktus, be balų.";
  })();

  /* ══ 11 world ══ */
  var world = null, worldT = 0.02, worldTarget = 0.02, worldRunning = false, drift = 0;
  var canvas = $("#worldCanvas");
  if (window.R5World && window.R5_GEO && window.R5_DATA) {
    var counts = {};
    window.R5_DATA.topCities.forEach(function (c) { counts[c.name] = c.n; });
    var activity = window.R5_GEO.cities.filter(function (c) { return counts[c.name]; })
      .map(function (c) { return { name: c.name, lat: c.lat, lng: c.lng, count: counts[c.name] }; });
    world = window.R5World.create(canvas, window.R5_GEO, activity);
  }
  if (!world) canvas.style.display = "none";
  function worldFrame() {
    if (!world || !worldRunning) return;
    drift += 0.0016;
    var wobble = reduced ? 0 : Math.sin(drift) * 0.004;
    worldT += (worldTarget - worldT) * (reduced ? 1 : 0.055);
    world.render(Math.max(0, Math.min(0.9999, worldT + wobble)));
    requestAnimationFrame(worldFrame);
  }
  function worldWake() {
    if (!world || worldRunning) return;
    worldRunning = true; requestAnimationFrame(worldFrame);
  }
  function worldSleep() { worldRunning = false; }
  var LV_T = [0.02, 0.5, 0.96];
  var lvInfo = [
    { h: "Švedija", s: fmt(D.real.country.active) + " aktyvios · " + fmt(D.real.country.employers) + " darbdavių · " + D.real.country.cities + " miestų", list: D.real.topCities.slice(0, 5).map(function (c) { return [c.name, c.n]; }) },
    { h: "Västra Götaland", s: fmt(D.real.region.active) + " aktyvios · " + D.real.region.cities + " miestai", list: [["Göteborg", 3066], ["Borås", 0], ["Trollhättan", 0]].filter(function (x) { return x[1]; }) },
    { h: "Göteborg", s: fmt(D.real.city.active) + " aktyvios · " + fmt(D.real.city.employers) + " darbdavių · " + D.real.city.professions + " profesijų", list: [["Programuotojas", 145], ["Slaugytojo padėjėjas", 140], ["Sandėlio darbuotojas", 98], ["Vairuotojas", 78], ["Elektrikas", 71]] },
  ];
  function setLevel(i) {
    worldTarget = LV_T[i];
    $$(".wl-lv").forEach(function (b) { b.classList.toggle("is-on", +b.dataset.lv === i); });
    var info = lvInfo[i], max = info.list.length ? info.list[0][1] : 1;
    $("#wlInfo").innerHTML = "<h3>" + info.h + '</h3><span class="dim">' + info.s + "</span>" +
      '<div class="wl-bars">' + info.list.map(function (r) {
        return '<div class="wl-bar"><span>' + r[0] + '</span><i style="width:' +
          Math.round((r[1] / max) * 100) + '%"></i><span class="mono">' + fmt(r[1]) + "</span></div>";
      }).join("") + "</div>";
    $("#wlEnter").hidden = i !== 2;
    crumbs.world = ["Gyvasis pasaulis", info.h];
    if (app.dataset.view === "world")
      $("#crumb").innerHTML = "<b>Gyvasis pasaulis</b><span>›</span><em>" + info.h + "</em>";
  }
  $$(".wl-lv").forEach(function (b) {
    b.addEventListener("click", function () { setLevel(+b.dataset.lv); });
  });
  $("#wlEnterBtn").addEventListener("click", function () {
    go("opps");
    toast("Göteborg kontekstas atidarytas", true);
  });
  setLevel(0);

  /* ── provenance drawer ── */
  $("#provBtn").addEventListener("click", function () {
    openDrawer("Duomenų kilmė",
      '<div class="dr-sec"><b>Tikra</b>' +
      '<div class="fact-row">Visi rinkos skaičiai — labourmarket.ai produkcinė bazė<span class="mono">08-15 21:20</span></div>' +
      '<div class="fact-row">Šaltinis: Arbetsförmedlingen vieši skelbimai<span class="mono">CC0</span></div>' +
      '<div class="fact-row">Profesijų skaičiai — klasifikuotos dalies (41,5 %) atskiri skaičiai</div>' +
      '<div class="fact-row">Darbdaviai tik skaičiuojami — nė vienas neįvardytas</div></div>' +
      '<div class="dr-sec"><b>Demonstracinė</b>' +
      '<div class="fact-row">Asmuo, organizacija, dienoraštis, profiliai A/B/C — demo turinys</div>' +
      '<div class="fact-row">Nuotraukos — dokumentinė fotografija (Unsplash), tik prototipui</div></div>' +
      '<div class="dr-foot">R&D prototipas. Jokio ryšio su produkcine aplinka; jokio asmens balo; ' +
      "geokodavimo nėra — miestas žymimas pagal pavadinimą.</div>");
  });
  $("#bellBtn").addEventListener("click", function () {
    openDrawer("Pranešimai",
      '<div class="dr-sec"><b>Nauji</b>' +
      '<button class="fact-row" data-op="warehouse_worker">◈ Sandėlio kryptyje +6 naujos vietos per parą<span class="mono">Göteborg</span></button>' +
      '<button class="fact-row" data-go="identity">✳ Palečių tvarkymas pasiekė 19 įrodymų<span class="mono">vakar</span></button></div>');
  });

  /* start */
  go("entry");
  setCtx("me");
  go("entry");
})();
