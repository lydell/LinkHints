// @flow

import {
  CLICKABLE_EVENT,
  RESET_INJECTION,
  UNCLICKABLE_EVENT,
} from "./constants";

// This file is injected as a regular script in all pages and overrides
// `.addEventListener` (and friends) so we can detect click listeners.
// This is a bit fiddly because we try to cover our tracks as good as possible.

const fnMap = new Map();
const resetFns = [];

// When this was written, <https://jsfiddle.net/> overrides `Event` with a buggy
// implementation that throws an error. To work around that, make sure that the
// page can't interfere with the crucial parts by saving copies of important
// things. Remember that this runs _before_ any page scripts.
const Event2 = Event;
const HTMLElement2 = HTMLElement;
const { error: logError } = console;
const { dispatchEvent } = EventTarget.prototype;
const { apply, defineProperty, getOwnPropertyDescriptor } = Reflect;
const { get: mapGet } = Map.prototype;

// Reset the overridden methods when the extension is shut down. This listener
// is registered before we override in order not to trigger our hook.
window.addEventListener("message", reset, true);

// Hook into whenever `obj[name]()` (such as
// `EventTarget.prototype["addEventListener"]`) is called, by calling `hook`.
// This is done by overriding the method, but in a way that makes it really
// difficult to detect that the method has been overridden. There are two
// reasons for covering our tracks:
//
// 1. We don't want to break websites. For example, naively overriding
//    `addEventListener` breaks CKEditor: <https://jsfiddle.net/tv5x6zuj/>
//    See also: <https://github.com/philc/vimium/issues/2900> (and its linked
//    issues and PRs).
// 2. We don't want developers to see strange things in the console when they
//    debug stuff.
function hookInto(obj: Object, name: string, hook: ?Function = undefined) {
  const desc = getOwnPropertyDescriptor(obj, name);

  // Chrome doesn't support `toSource`.
  if (desc == null) {
    return;
  }

  const prop = "value" in desc ? "value" : "set";
  const orig = desc[prop];

  // To please Flow.
  if (orig == null) {
    return;
  }

  // `f = { [name]: function(){} }[name]` is a way of creating a dynamically
  // named function (where `f.name === name`).
  const fn =
    hook == null
      ? {
          [orig.name](...args: Array<any>): any {
            // In the cases where no hook is provided we just want to make sure
            // that the method (such as `toString`) is called with the
            // _original_ function, not the overriding function.
            return apply(orig, apply(mapGet, fnMap, [this]) || this, args);
          },
        }[orig.name]
      : {
          [orig.name](...args: Array<any>): any {
            // In case there's a mistake in `hook` it shouldn't cause the entire
            // overridden method to fail and potentially break the whole page.
            try {
              // Remember that `hook` can be called with _anything,_ because the
              // user can pass invalid arguments and use `.call`.
              // $FlowIgnore: `hook` isn't undefined here.
              hook(this, ...args);
            } catch (error) {
              // Don't use the usual `log` function here, too keep this file small.
              logError(
                `[synth]: Failed to run hook for ${name} on`,
                obj,
                error
              );
            }
            return apply(orig, this, args);
          },
        }[orig.name];

  // Save the overriding and original functions so we can map overriding to
  // original in the case with no `hook` above.
  fnMap.set(fn, orig);

  // Make sure that `.length` is correct.
  defineProperty(fn, "length", {
    ...getOwnPropertyDescriptor(Function.prototype, "length"),
    value: orig.length,
  });

  // Finally override the method with the created function.
  defineProperty(obj, name, {
    ...desc,
    [prop]: fn,
  });

  // Save a function that will reset the method back again.
  resetFns.push(() => {
    defineProperty(obj, name, {
      ...desc,
      [prop]: orig,
    });
  });
}

function reset(event: MessageEvent) {
  if (event.data !== RESET_INJECTION) {
    return;
  }

  // Reset all overridden methods.
  for (const resetFn of resetFns) {
    resetFn();
  }

  window.removeEventListener("message", reset, true);
}

type ClickListenersByElement = Map<HTMLElement, OptionsByListener>;
type OptionsByListener = Map<mixed, OptionsSet>;
type OptionsSet = Set<string>;
const clickListenersByElement: ClickListenersByElement = new Map();

hookInto(
  EventTarget.prototype,
  "addEventListener",
  (element: mixed, eventName: mixed, listener: mixed, options: mixed) => {
    if (
      !(
        eventName === "click" &&
        element instanceof HTMLElement2 &&
        (typeof listener === "function" ||
          (typeof listener === "object" &&
            listener != null &&
            typeof listener.handleEvent === "function"))
      )
    ) {
      return;
    }

    const optionsString = stringifyOptions(options);
    const optionsByListener = clickListenersByElement.get(element);

    // No previous click listeners.
    if (optionsByListener == null) {
      clickListenersByElement.set(
        element,
        new Map([[listener, new Set([optionsString])]])
      );

      if (typeof element.onclick !== "function") {
        // The element went from no click listeners to one.
        reportClickable(element);
      }

      return;
    }

    const optionsSet = optionsByListener.get(listener);

    // New listener function.
    if (optionsSet == null) {
      optionsByListener.set(listener, new Set([optionsString]));
      return;
    }

    // Already seen listener function, but new options.
    if (!optionsSet.has(optionsString)) {
      optionsSet.add(optionsString);
    }

    // Duplicate listener. Nothing to do.
  }
);

hookInto(
  EventTarget.prototype,
  "removeEventListener",
  (element: mixed, eventName: mixed, listener: mixed, options: mixed) => {
    if (
      !(
        eventName === "click" &&
        element instanceof HTMLElement2 &&
        (typeof listener === "function" ||
          (typeof listener === "object" &&
            listener != null &&
            typeof listener.handleEvent === "function"))
      )
    ) {
      return;
    }

    const optionsString = stringifyOptions(options);
    const optionsByListener = clickListenersByElement.get(element);

    // The element has no click listeners.
    if (optionsByListener == null) {
      return;
    }

    const optionsSet = optionsByListener.get(listener);

    // The element has click listeners, but not with `listener` as a callback.
    if (optionsSet == null) {
      return;
    }

    // The element has `listener` as a click callback, but with different
    // options.
    if (!optionsSet.has(optionsString)) {
      return;
    }

    // Match! Remove the current options.
    optionsSet.delete(optionsString);

    // If that was the last options for `listener`, remove `listener`.
    if (optionsSet.size === 0) {
      optionsByListener.delete(listener);

      // If that was the last `listener` for `element`, remove `element`.
      if (optionsByListener.size === 0) {
        clickListenersByElement.delete(element);

        if (typeof element.onclick !== "function") {
          // The element went from one listener to none.
          reportUnclickable(element);
        }
      }
    }
  }
);

hookInto(
  HTMLElement.prototype,
  "onclick",
  async (element: mixed, value: mixed) => {
    // If the element has click listeners added via `.addEventListener` changing
    // `.onclick` can't affect whether the element has at least one click
    // listener.
    if (
      !(element instanceof HTMLElement2) ||
      clickListenersByElement.has(element)
    ) {
      return;
    }

    const hasListenerAlready = typeof element.onclick === "function";

    // Let the setter take effect. Then dispatch events (if any). The dispatched
    // event would reach the ElementManager _before_ the new `.onclick` value is
    // actually set otherwise, which could make it take the wrong decision on
    // clickability.
    await undefined;

    if (typeof value === "function") {
      if (!hasListenerAlready) {
        // The element went from no click listeners to one.
        reportClickable(element);
      }
    } else if (hasListenerAlready) {
      // The element went from one click listeners to none.
      reportUnclickable(element);
    }
  }
);

// Make sure that `Function.prototype.toString.call(element.addEventListener)`
// returns "[native code]". This is used by lodash's `_.isNative`.
// `.toLocaleString` is automatically taken care of when patching `.toString`.
hookInto(Function.prototype, "toString");
hookInto(Function.prototype, "toSource"); // Firefox specific.

const optionNames: Array<string> = ["capture", "once", "passive"];

function stringifyOptions(options: mixed): string {
  const normalized =
    options == null || typeof options !== "object"
      ? { capture: Boolean(options) }
      : options;
  return optionNames.map(name => String(Boolean(normalized[name]))).join(",");
}

function reportClickable(element: HTMLElement) {
  apply(dispatchEvent, element, [new Event2(CLICKABLE_EVENT)]);
}

function reportUnclickable(element: HTMLElement) {
  apply(dispatchEvent, element, [new Event2(UNCLICKABLE_EVENT)]);
}
