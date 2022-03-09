/* global exports */

function macifyKbd() {
  if (/mac|iPhone|iPad|iPod/i.test(window.navigator.platform)) {
    [].forEach.call(
      document.querySelectorAll("kbd"),
      /** @type {(kbd: HTMLElement) => void} */ function (kbd) {
        var mac = kbd.getAttribute("data-mac");
        var text = mac !== null ? mac : kbd.textContent;
        switch (text) {
          case "Cmd":
            kbd.textContent = "⌘";
            kbd.title = "Command";
            break;
          case "Ctrl":
            kbd.textContent = "^";
            kbd.title = "Control";
            break;
          case "Alt":
            kbd.textContent = "⌥";
            kbd.title = "Option/Alt";
            break;
          case "Shift":
            kbd.textContent = "⇧";
            kbd.title = "Shift";
            break;
          default:
          // Do nothing.
        }
      }
    );
  }
}

function observeQuickLinks() {
  if (typeof IntersectionObserver === "undefined") {
    return;
  }

  var intersectionObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var a = document.querySelector(
          '[data-quick="' + entry.target.id + '"]'
        );
        if (a !== null) {
          a.classList.toggle("is-visible", entry.isIntersecting);
        }
      });
    },
    { rootMargin: "-32px" }
  );

  [].forEach.call(document.querySelectorAll("section[id]"), function (section) {
    intersectionObserver.observe(section);
  });
}

function autoCloseDetails() {
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.localName === "summary" ||
        (target.localName === "a" &&
          target.parentElement !== null &&
          target.parentElement.classList.contains("Pagination")))
    ) {
      var target2 = target;
      [].forEach.call(
        document.querySelectorAll("details"),
        /** @type {(details: HTMLDetailsElement) => void} */ function (
          details
        ) {
          if (details !== target2.parentNode) {
            details.open = false;
          }
        }
      );
    }
  });
}

exports.scripts = {
  macifyKbd: macifyKbd.toString(),
  observeQuickLinks: observeQuickLinks.toString(),
  autoCloseDetails: autoCloseDetails.toString(),
};
