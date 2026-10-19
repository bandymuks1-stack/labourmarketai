/**
 * REGEX LOOKBEHIND ON EVERY BROWSER (2026-10-18 production incident).
 *
 * A real candidate could not open labourmarket.ai: "Application error: a
 * client-side exception has occurred", again after every retry. The
 * conversation understanding (intent router, value statement, role label,
 * work-log readers, …) builds regular expressions with lookbehind —
 * `(?<!\p{L})`, `(?<=[.!?])` — and some of them are built while a module
 * loads. Safari / iOS before 16.4 (every iPhone 7 and older, and many phones
 * that are not updated) and old in-app web views cannot compile lookbehind:
 * `new RegExp("(?<!…)")` throws `SyntaxError` there, during module
 * evaluation, before any error boundary exists. The home, sign-up and sign-in
 * pages died on load. SWC already turns lookbehind regex LITERALS into
 * `new RegExp("…")` calls, so every one of them goes through the global
 * constructor — which is what makes one shim enough.
 *
 * This script runs first in <head> (app/[locale]/layout.tsx), before any
 * application module is evaluated. Where lookbehind compiles it does NOTHING
 * (every current browser: the native constructor is untouched). Where it does
 * not, `RegExp` is wrapped: construction is tried natively, and only a
 * pattern that fails AND contains a lookbehind is retried with its lookbehind
 * assertions removed. Matching on those old browsers is therefore slightly
 * looser (a word-boundary condition is dropped) — the page works instead of
 * dying, and nothing changes for anyone else.
 *
 * Plain ES2015, no build step: it runs untranspiled on exactly the browsers
 * that are old. `w` is the window, passed in so a test can run the script
 * against a constructor that lacks lookbehind.
 */
export const REGEXP_LOOKBEHIND_SHIM = `(function (w) {
  try { new w.RegExp("(?<=a)b"); return; } catch (e) {}
  var Native = w.RegExp;
  function skipClass(s, i) {
    for (i = i + 1; i < s.length; i++) {
      if (s.charAt(i) === "\\\\") { i++; continue; }
      if (s.charAt(i) === "]") return i + 1;
    }
    return s.length;
  }
  function skipGroup(s, i) {
    var depth = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === "\\\\") { i += 2; continue; }
      if (c === "[") { i = skipClass(s, i); continue; }
      if (c === "(") depth++;
      if (c === ")") { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    return s.length;
  }
  function strip(s) {
    var out = "", i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === "\\\\") { out += s.substr(i, 2); i += 2; continue; }
      if (c === "[") { var j = skipClass(s, i); out += s.slice(i, j); i = j; continue; }
      var head = s.substr(i, 4);
      if (head === "(?<=" || head === "(?<!") { i = skipGroup(s, i); continue; }
      out += c; i++;
    }
    return out;
  }
  function CompatRegExp(pattern, flags) {
    var target = this instanceof CompatRegExp ? this.constructor : Native;
    var build = function (p) {
      return typeof Reflect !== "undefined" && Reflect.construct
        ? Reflect.construct(Native, flags === undefined ? [p] : [p, flags], target)
        : (flags === undefined ? new Native(p) : new Native(p, flags));
    };
    try { return build(pattern); } catch (error) {
      if (typeof pattern === "string" && /\\(\\?<[=!]/.test(pattern)) return build(strip(pattern));
      throw error;
    }
  }
  CompatRegExp.prototype = Native.prototype;
  try { Object.setPrototypeOf(CompatRegExp, Native); } catch (e) {}
  w.RegExp = CompatRegExp;
})(window);`;
