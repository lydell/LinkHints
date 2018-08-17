// @flow
/* global chrome */

// This file is injected as a regular script in all pages and overrides
// `.addEventListener` (and friends) so we can detect click listeners.
// This is a bit fiddly because we try to cover our tracks as good as possible.

// Everything in this file has to be inside this function, since `.toString()`
// is called on it. This also means that `import`s cannot be used in this file.
export default () => {
  const fnMap = new Map();
  const resetFns = [];

  // This value is replaced in by Rollup; only refer to it once.
  const clickableEventNames = CLICKABLE_EVENT_NAMES;
  const clickableEventProps = clickableEventNames.map(
    eventName => `on${eventName}`
  );

  // $FlowIgnore: `chrome` exists only in Chrome.
  const isChrome: boolean = typeof chrome !== "undefined";

  // When this was written, <https://jsfiddle.net/> overrides `Event` (which was
  // used before switching to `CustomEvent`) with a buggy implementation that
  // throws an error. To work around that, make sure that the page can't
  // interfere with the crucial parts by saving copies of important things.
  // Remember that this runs _before_ any page scripts.
  const CustomEvent2 = CustomEvent;
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
                const result = hook(orig, this, ...args);
                if (result != null && typeof result.then === "function") {
                  result.catch(error => {
                    logHookError(error, obj, name);
                  });
                }
              } catch (error) {
                logHookError(error, obj, name);
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

  function logHookError(error: Error, obj: Object, name: string) {
    // Don't use the usual `log` function here, too keep this file small.
    logError(`[synth]: Failed to run hook for ${name} on`, obj, error);
  }

  function reset(event: MessageEvent) {
    if (event.data !== INJECTED_RESET) {
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
    (
      orig: Function,
      element: mixed,
      eventName: mixed,
      listener: mixed,
      options: mixed
    ) => {
      if (
        !(
          typeof eventName === "string" &&
          clickableEventNames.includes(eventName) &&
          element instanceof HTMLElement2 &&
          (typeof listener === "function" ||
            (typeof listener === "object" &&
              listener != null &&
              typeof listener.handleEvent === "function"))
        )
      ) {
        return;
      }

      // If `{ once: true }` is used, listen once ourselves so we can track the
      // removal of the listener when it has triggered.
      if (
        typeof options === "object" &&
        options != null &&
        Boolean(options.once)
      ) {
        apply(orig, element, [
          eventName,
          () => {
            onRemoveEventListener(element, eventName, listener, options);
          },
          options,
        ]);
      }

      const optionsString = stringifyOptions(eventName, options);
      const optionsByListener = clickListenersByElement.get(element);

      // No previous click listeners.
      if (optionsByListener == null) {
        clickListenersByElement.set(
          element,
          new Map([[listener, new Set([optionsString])]])
        );

        if (!hasClickListenerProp(element)) {
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

      // Already seen listener function, but new options and/or event type.
      if (!optionsSet.has(optionsString)) {
        optionsSet.add(optionsString);
      }

      // Duplicate listener. Nothing to do.
    }
  );

  hookInto(
    EventTarget.prototype,
    "removeEventListener",
    (orig: Function, ...args) => {
      onRemoveEventListener(...args);
    }
  );

  function onRemoveEventListener(
    element: mixed,
    eventName: mixed,
    listener: mixed,
    options: mixed
  ) {
    if (
      !(
        typeof eventName === "string" &&
        clickableEventNames.includes(eventName) &&
        element instanceof HTMLElement2 &&
        (typeof listener === "function" ||
          (typeof listener === "object" &&
            listener != null &&
            typeof listener.handleEvent === "function"))
      )
    ) {
      return;
    }

    const optionsString = stringifyOptions(eventName, options);
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
    // options and/or event type.
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

        if (!hasClickListenerProp(element)) {
          // The element went from one click listener to none.
          reportUnclickable(element);
        }
      }
    }
  }

  // Hook into `.onclick` and similar.
  for (const prop of clickableEventProps) {
    hookInto(
      HTMLElement.prototype,
      prop,
      async (orig: Function, element: mixed, value: mixed) => {
        // If the element has click listeners added via `.addEventListener`
        // changing `.onclick` can't affect whether the element has at least one
        // click listener.
        if (
          !(element instanceof HTMLElement2) ||
          clickListenersByElement.has(element)
        ) {
          return;
        }

        const hadListener = hasClickListenerProp(element);

        // Let the setter take effect. Then dispatch events (if any). The
        // dispatched event would reach the ElementManager _before_ the new
        // `.onclick` value is actually set otherwise, which could make it take
        // the wrong decision on clickability.
        await undefined;

        const hasListener = hasClickListenerProp(element);

        if (!hadListener && hasListener) {
          // The element went from no click listeners to one.
          reportClickable(element);
        } else if (hadListener && !hasListener) {
          // The element went from one click listener to none.
          reportUnclickable(element);
        }
      }
    );
  }

  // Make sure that `Function.prototype.toString.call(element.addEventListener)`
  // returns "[native code]". This is used by lodash's `_.isNative`.
  // `.toLocaleString` is automatically taken care of when patching `.toString`.
  hookInto(Function.prototype, "toString");
  hookInto(Function.prototype, "toSource"); // Firefox specific.

  const optionNames: Array<string> = ["capture", "once", "passive"];

  function stringifyOptions(eventName: string, options: mixed): string {
    const normalized =
      options == null || typeof options !== "object"
        ? { capture: Boolean(options) }
        : options;
    const optionsString = optionNames
      .map(name => String(Boolean(normalized[name])))
      .join(",");
    return `${eventName}:${optionsString}`;
  }

  function hasClickListenerProp(element: HTMLElement): boolean {
    return clickableEventProps.some(
      prop =>
        // $FlowIgnore: I _do_ want to dynamically read properties here.
        typeof element[prop] === "function"
    );
  }

  // The events are dispatched on `window` rather than on `element`, since
  // `element` might not be inserted into the DOM (yet/anymore), which causes
  // the event not to fire.
  function reportClickable(element: HTMLElement) {
    sendEvent(INJECTED_CLICKABLE_EVENT, element);
  }

  function reportUnclickable(element: HTMLElement) {
    sendEvent(INJECTED_UNCLICKABLE_EVENT, element);
  }

  function sendEvent(eventName: string, element: HTMLElement) {
    // The events are dispatched on `window` rather than on `element`, since
    // `element` might not be inserted into the DOM (yet/anymore), which causes
    // the event not to fire. However, sending a DOM element as `detail` from a
    // web page to an extension is not allowed in Chrome, so there we have to
    // temporarily insert the element into the DOM if needed.
    if (!isChrome) {
      apply(dispatchEvent, window, [
        new CustomEvent2(eventName, { detail: { element } }),
      ]);
      return;
    }

    const { documentElement } = document;

    if (documentElement == null) {
      return;
    }

    const isDetached = !documentElement.contains(element);

    if (isDetached) {
      documentElement.append(element);
    }

    apply(dispatchEvent, element, [new CustomEvent2(eventName)]);

    if (isDetached) {
      element.remove();
    }
  }
};
