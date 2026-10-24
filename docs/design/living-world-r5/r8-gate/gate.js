/* R8 gate runtime — navigation only; the language is the deliverable. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  function show(s) {
    app.dataset.screen = s;
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("is-on", el.dataset.s === s);
    });
    var ctx = s === "org" ? "org" : "personal";
    document.querySelectorAll(".ctx-it").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.ctx === ctx);
    });
    document.getElementById("meAva").textContent = s === "org" ? "ST" : "J";
  }
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (g) return show(g.dataset.go);
    var c = e.target.closest("[data-ctx]");
    if (c) return show(c.dataset.ctx === "org" ? "org" : "personal");
  });
  show("personal");
})();
