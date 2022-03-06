import { fireAndForget } from "../shared/main";
import WorkerProgram from "./Program";

// In Firefox, `match_about_blank: true` triggers even if you visit
// `about:blank` directly, not just blank iframes and `window.open()`.
// It makes no sense doing anything in a completely blank page.
if (!(window.location.href === "about:blank" && window.top === window)) {
  hackXHTML();
  const program = new WorkerProgram();
  fireAndForget(program.start(), "main->WorkerProgram#start");
}

// XHTML annoyingly differs compared to HTML when it comes to casing. Example:
//
// <a>:
// - HTML: Valid anchor element. `.nodeName === "A"` (uppercase)
// - XHTML: Valid anchor element. `.nodeName === "a"` (preserves case)
//
// <A>:
// - HTML: Valid anchor element. `.nodeName === "A"` (uppercase)
// - XHTML: Invalid element (treated as text). `.nodeName === "A"` (preserves case)
//
// XHTML is pretty rare these days. Link Hints consistently uses `.nodeName`
// (never `.tagName` or `.localName`), and sometimes does so over `instanceof`
// checks for performance. Since `.nodeName` is always uppercase for elements in
// HTML, Link Hints has traditonally compared to uppercase string literals. Only
// later on did I find out about this XHTML difference. To avoid having to add
// `.toUpperCase()` everywhere (I’m both worried about performance, and about
// forgetting `.toUpperCase()` in some place), this hack lets us pretend as if
// `.nodeName` was uppercase in XHTML too. It might not be 100% correct from an
// XML standpoint, but in practice it should be totally fine for Link Hints’
// purposes. Note: This does not affect the webpage. Only Link Hints’ own code
// sees this `.nodeName` hack.
function hackXHTML(): void {
  if (document.createElement("a").nodeName === "A") {
    // No need for hacks in HTML documents.
    return;
  }
  const descriptor = Reflect.getOwnPropertyDescriptor(
    Node.prototype,
    "nodeName"
  );
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const get = descriptor?.get;
  if (get !== undefined) {
    Reflect.defineProperty(Node.prototype, "nodeName", {
      ...descriptor,
      get() {
        return this instanceof Element
          ? (get.call(this) as string).toUpperCase()
          : (get.call(this) as string);
      },
    });
  }
}
