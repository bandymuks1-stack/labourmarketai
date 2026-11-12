/**
 * A PAGE THE BROWSER TRANSLATES (2026-11-05 production incident).
 *
 * A person in Bangladesh saved availability on the Lithuanian page through the
 * browser's translator ("Laisvas" reached them as "Free"). The row was stored,
 * and the page died with "Application error: a client-side exception", on every
 * try. A translator replaces a page's text nodes with its own <font> elements.
 * React still holds the old nodes, so `insertBefore(spinner, oldText)` and
 * `removeChild(oldText)` throw NotFoundError during commit. Any update that
 * adds or removes something beside a text node does this, on every surface, so
 * the repair is here and not in one button.
 *
 * Telling translators to stay away (`translate="no"`) is not the fix: for someone
 * who reads none of the product's languages, translation is how they use it.
 *
 * Both calls behave natively unless the node they name has left this parent.
 * Then: an insert goes before whatever now holds that node, or at the end when
 * nothing does; a remove takes the translator's wrapper with it if there is one,
 * and is otherwise already done. A word the translator holds can stay on screen
 * until the page is translated again. That is cosmetic; the page stays alive.
 *
 * Plain ES2015, no build step, same as the shim beside it. `w` is the window,
 * passed in so a test can run the script against its own Node.
 */
export const TRANSLATED_DOM_SHIM = `(function (w) {
  var proto = w.Node && w.Node.prototype;
  if (!proto) return;
  var nativeRemove = proto.removeChild;
  var nativeInsert = proto.insertBefore;
  function holderIn(parent, node) {
    var n = node;
    while (n && n.parentNode !== parent) n = n.parentNode;
    return n || null;
  }
  proto.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      var holder = holderIn(this, child);
      if (holder && holder.nodeName === "FONT") nativeRemove.call(this, holder);
      return child;
    }
    return nativeRemove.apply(this, arguments);
  };
  proto.insertBefore = function (node, ref) {
    if (ref && ref.parentNode !== this) return nativeInsert.call(this, node, holderIn(this, ref));
    return nativeInsert.apply(this, arguments);
  };
})(window);`;
