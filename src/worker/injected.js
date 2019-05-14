// @flow

import { makeRandomToken } from "../shared/main";

// This file is injected as a regular script in all pages and overrides
// `.addEventListener` (and friends) so we can detect click listeners.
// This is a bit fiddly because we try to cover our tracks as good as possible.

// Basically everything in this file has to be inside the `export default`
// function, since `.toString()` is called on it in ElementManager. This also
// means that `import`s generally cannot be used in this file. All of the below
// constants are `.replace()`:ed in by ElementManager, but they are defined in
// this file so that ESLint and Flow know about them.

// NOTE: If you add a new constant, you have to update the `constants` object in
// ElementManager.js as well!

// All types of events that likely makes an element clickable. All code and
// comments that deal with this only refer to "click", though, to keep things
// simple.
export const CLICKABLE_EVENT_NAMES = ["click", "mousedown"];
export const CLICKABLE_EVENT_PROPS: Array<string> = CLICKABLE_EVENT_NAMES.map(
  eventName => `on${eventName}`
);

// Common prefix for events. It’s important to create a name unique from
// previous versions of Synth, in case this script hangs around after an update
// (it’s not possible to do cleanups before disabling an extension in Firefox).
// We don’t want the old version to interfere with the new one. This uses
// `BUILD_TIME` rather than `makeRandomToken()` so that all frames share the
// same event name. Clickable elements created in this frame but inserted into
// another frame need to dispatch an event in their parent window rather than
// this one. Finally, the `\uffff` is there to make the events sort last in the
// element inspector in Firefox when clicking the “event” button next to the
// `<html>` element, making it easier for developers to find their own events.
const prefix = `\uffff__SynthWebExt_${BUILD_TIME}_`;

// If a malicious site sends these events it doesn't hurt much. All the page
// could do is cause false positives or disable detection of click events
// altogeher.
export const CLICKABLE_EVENT = `${prefix}Clickable`;
export const UNCLICKABLE_EVENT = `${prefix}Unclickable`;
export const QUEUE_EVENT = `${prefix}Queue`;

// If an element is not inserted into the DOM, events can’t be fired on it.
// Instead, this attribute is added with the event name as value. If/when the
// element _is_ inserted into the DOM, the MutationObserver can find the
// attribute (and remove it) and as such receive the event. Remove the `\uffff`
// since it is not valid in attribute names.
export const EVENT_ATTRIBUTE = `data-${prefix.replace(/\W/g, "")}Event`;

// Name of the global variable created by the injected script. The `\0` prevents
// it from turning up in autocomplete when typing `window.` in the Chrome
// console. Firefox still shows it, but accepting the autocomplete causes a
// syntax error. Since we make the injected variable both non-writable and
// non-configurable it is impossible to overwrite it so we _have_ to use
// a new name when installing an update.
export const INJECTED_VAR = `__SynthWebExt_${BUILD_TIME}\0`;
export const INJECTED_VAR_PATTERN = RegExp(
  `^${INJECTED_VAR.replace(/\d+/, "\\d+").replace(/\0/, "\\0")}$`
);

export const MESSAGE_FLUSH = "flush";
export const MESSAGE_RESET = "reset";

export const SECRET = makeRandomToken();

export default () => {
  if (!PROD && BROWSER === "firefox") {
    cleanupOldScripts();
  }

  // These arrays are replaced in by ElementManager; only refer to them once.
  const clickableEventNames = CLICKABLE_EVENT_NAMES;
  const clickableEventProps = CLICKABLE_EVENT_PROPS;

  // When this was written, <https://jsfiddle.net/> overrides `Event` (which was
  // used before switching to `CustomEvent`) with a buggy implementation that
  // throws an error. To work around that, make sure that the page can't
  // interfere with the crucial parts by saving copies of important things.
  // Remember that this runs _before_ any page scripts.
  const CustomEvent2 = CustomEvent;
  const HTMLElement2 = HTMLElement;
  // Don't use the usual `log` function here, too keep this file small.
  const { error: logError } = console;
  const { setAttribute } = Element.prototype;
  const { dispatchEvent } = EventTarget.prototype;
  const { apply, defineProperty, getOwnPropertyDescriptor } = Reflect;
  const { get: mapGet } = Map.prototype;

  type Deadline = { timeRemaining: () => number };

  const infiniteDeadline: Deadline = {
    timeRemaining: () => Infinity,
  };

  class HookManager {
    fnMap: Map<Function, Function> = new Map();
    resetFns: Array<Function> = [];

    reset() {
      // Reset all overridden methods.
      for (const resetFn of this.resetFns) {
        resetFn();
      }

      this.fnMap.clear();
      this.resetFns = [];
    }

    // Hook into whenever `obj[name]()` (such as
    // `EventTarget.prototype["addEventListener"]`) is called, by calling
    // `hook`. This is done by overriding the method, but in a way that makes it
    // really difficult to detect that the method has been overridden. There are
    // two reasons for covering our tracks:
    //
    // 1. We don't want to break websites. For example, naively overriding
    //    `addEventListener` breaks CKEditor: <https://jsfiddle.net/tv5x6zuj/>
    //    See also: <https://github.com/philc/vimium/issues/2900> (and its
    //    linked issues and PRs).
    // 2. We don't want developers to see strange things in the console when
    //    they debug stuff.
    hookInto(
      obj: { [string]: mixed },
      name: string,
      hook: ?Function = undefined
    ) {
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

      const { fnMap } = this;

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
                    result.then(undefined, error => {
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
      this.resetFns.push(() => {
        defineProperty(obj, name, {
          ...desc,
          [prop]: orig,
        });
      });
    }

    // Make sure that `Function.prototype.toString.call(element.addEventListener)`
    // returns "[native code]". This is used by lodash's `_.isNative`.
    // `.toLocaleString` is automatically taken care of when patching `.toString`.
    conceal() {
      this.hookInto(Function.prototype, "toString");
      this.hookInto(Function.prototype, "toSource"); // Firefox specific.
    }
  }

  function logHookError(error: Error, obj: { [string]: mixed }, name: string) {
    logError(`[synth]: Failed to run hook for ${name} on`, obj, error);
  }

  type ClickListenersByElement = Map<HTMLElement, OptionsByListener>;
  type OptionsByListener = Map<mixed, OptionsSet>;
  type OptionsSet = Set<string>;

  // Changes to event listeners.
  type QueueItem = QueueItemProp | QueueItemMethod;

  // `.onclick` and similar.
  type QueueItemProp = {|
    type: "prop",
    hadListener: boolean,
    element: HTMLElement,
  |};

  // `.addEventListener` and `.removeEventListener`.
  type QueueItemMethod = {|
    type: "method",
    added: boolean,
    element: HTMLElement,
    eventName: string,
    listener: mixed,
    options: mixed,
  |};

  // Elements waiting to be sent to ElementManager.js (in Chrome only).
  type SendQueueItem = {|
    added: boolean,
    element: HTMLElement,
  |};

  class ClickListenerTracker {
    clickListenersByElement: ClickListenersByElement = new Map();
    queue: Queue<QueueItem> = makeEmptyQueue();
    sendQueue: Queue<SendQueueItem> = makeEmptyQueue();
    idleCallbackId: ?IdleCallbackID = undefined;

    reset() {
      if (this.idleCallbackId != null) {
        cancelIdleCallback(this.idleCallbackId);
      }

      this.clickListenersByElement = new Map();
      this.queue = makeEmptyQueue();
      this.sendQueue = makeEmptyQueue();
      this.idleCallbackId = undefined;
    }

    queueItem(item: QueueItem) {
      const numItems = this.queue.items.push(item);
      this.requestIdleCallback();

      if (numItems === 1 && this.sendQueue.items.length === 0) {
        sendWindowEvent(QUEUE_EVENT, { hasQueue: true });
      }
    }

    requestIdleCallback() {
      if (this.idleCallbackId == null) {
        this.idleCallbackId = requestIdleCallback(deadline => {
          this.idleCallbackId = undefined;
          this.flushQueue(deadline);
        });
      }
    }

    flushQueue(deadline: Deadline) {
      const hadQueue =
        this.queue.items.length > 0 || this.sendQueue.items.length > 0;
      this._flushQueue(deadline);
      const hasQueue =
        this.queue.items.length > 0 || this.sendQueue.items.length > 0;
      if (hadQueue && !hasQueue) {
        sendWindowEvent(QUEUE_EVENT, { hasQueue: false });
      }
    }

    _flushQueue(deadline: Deadline) {
      const done = this.flushSendQueue(deadline);

      if (!done || this.queue.items.length === 0) {
        return;
      }

      // Track elements that got their first listener, or lost their last one.
      // The data structure simplifies additions and removals: If first adding
      // an element and then removing it, it’s the same as never having added or
      // removed the element at all (and vice versa).
      const addedRemoved = new AddedRemoved();

      const startQueueIndex = this.queue.index;
      let timesUp = false;

      for (; this.queue.index < this.queue.items.length; this.queue.index++) {
        if (
          this.queue.index > startQueueIndex &&
          deadline.timeRemaining() <= 0
        ) {
          timesUp = true;
          break;
        }

        const item = this.queue.items[this.queue.index];

        // `.onclick` or similar changed.
        if (item.type === "prop") {
          const { hadListener, element } = item;
          // If the element has click listeners added via `.addEventListener`
          // changing `.onclick` can't affect whether the element has at least
          // one click listener.
          if (!this.clickListenersByElement.has(element)) {
            const hasListener = hasClickListenerProp(element);
            if (!hadListener && hasListener) {
              addedRemoved.add(element);
            } else if (hadListener && !hasListener) {
              addedRemoved.remove(element);
            }
          }
        }
        // `.addEventListener`
        else if (item.added) {
          const gotFirst = this.add(item);
          if (gotFirst) {
            addedRemoved.add(item.element);
          }
        }
        // `.removeEventListener`
        else {
          const lostLast = this.remove(item);
          if (lostLast) {
            addedRemoved.remove(item.element);
          }
        }
      }

      if (!timesUp) {
        this.queue = makeEmptyQueue();
      }

      const { added, removed } = addedRemoved;

      for (const element of added) {
        this.sendQueue.items.push({ added: true, element });
      }

      for (const element of removed) {
        this.sendQueue.items.push({ added: false, element });
      }

      if (timesUp) {
        this.requestIdleCallback();
      } else {
        this.flushSendQueue(deadline);
      }
    }

    flushSendQueue(deadline: Deadline): boolean {
      const startQueueIndex = this.sendQueue.index;
      for (
        ;
        this.sendQueue.index < this.sendQueue.items.length;
        this.sendQueue.index++
      ) {
        if (
          this.sendQueue.index > startQueueIndex &&
          deadline.timeRemaining() <= 0
        ) {
          this.requestIdleCallback();
          return false;
        }

        const item = this.sendQueue.items[this.sendQueue.index];

        if (item.added) {
          sendElementEvent(CLICKABLE_EVENT, item.element);
        } else {
          sendElementEvent(UNCLICKABLE_EVENT, item.element);
        }
      }

      this.sendQueue = makeEmptyQueue();
      return true;
    }

    add({ element, eventName, listener, options }: QueueItemMethod): boolean {
      const optionsString = stringifyOptions(eventName, options);
      const optionsByListener = this.clickListenersByElement.get(element);

      // No previous click listeners.
      if (optionsByListener == null) {
        this.clickListenersByElement.set(
          element,
          new Map([[listener, new Set([optionsString])]])
        );

        if (!hasClickListenerProp(element)) {
          // The element went from no click listeners to one.
          return true;
        }

        return false;
      }

      const optionsSet = optionsByListener.get(listener);

      // New listener function.
      if (optionsSet == null) {
        optionsByListener.set(listener, new Set([optionsString]));
        return false;
      }

      // Already seen listener function, but new options and/or event type.
      if (!optionsSet.has(optionsString)) {
        optionsSet.add(optionsString);
        return false;
      }

      // Duplicate listener. Nothing to do.
      return false;
    }

    remove({
      element,
      eventName,
      listener,
      options,
    }: QueueItemMethod): boolean {
      const optionsString = stringifyOptions(eventName, options);
      const optionsByListener = this.clickListenersByElement.get(element);

      // The element has no click listeners.
      if (optionsByListener == null) {
        // If the element was created and given a listener in another frame and
        // then was inserted in another frame, the element might actually have
        // had a listener after all that was now removed. In Chrome this is
        // tracked correctly, but in Firefox we need to "lie" here and say that
        // the last listener was removed in case it was.
        return BROWSER === "firefox";
      }

      const optionsSet = optionsByListener.get(listener);

      // The element has click listeners, but not with `listener` as a callback.
      if (optionsSet == null) {
        return false;
      }

      // The element has `listener` as a click callback, but with different
      // options and/or event type.
      if (!optionsSet.has(optionsString)) {
        return false;
      }

      // Match! Remove the current options.
      optionsSet.delete(optionsString);

      // If that was the last options for `listener`, remove `listener`.
      if (optionsSet.size === 0) {
        optionsByListener.delete(listener);

        // If that was the last `listener` for `element`, remove `element`.
        if (optionsByListener.size === 0) {
          this.clickListenersByElement.delete(element);

          if (!hasClickListenerProp(element)) {
            // The element went from one click listener to none.
            return true;
          }
        }
      }

      return false;
    }
  }

  type Queue<T> = {|
    items: Array<T>,
    index: number,
  |};

  function makeEmptyQueue<T>(): Queue<T> {
    return {
      items: [],
      index: 0,
    };
  }

  class AddedRemoved<T> {
    added: Set<T> = new Set();
    removed: Set<T> = new Set();

    add(item: T) {
      if (this.removed.has(item)) {
        this.removed.delete(item);
      } else {
        this.added.add(item);
      }
    }

    remove(item: T) {
      if (this.added.has(item)) {
        this.added.delete(item);
      } else {
        this.removed.add(item);
      }
    }
  }

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

  function sendWindowEvent(eventName: string, detail: any) {
    apply(dispatchEvent, window, [new CustomEvent2(eventName, { detail })]);
  }

  // In Firefox, it is also possible to use `sendWindowEvent` passing `element`
  // as `detail`, but that does not work properly in all cases when an element
  // is inserted into another frame. Chrome does not allow passing DOM elements
  // as `detail` from a page to an extension at all.
  function sendElementEvent(eventName: string, element: HTMLElement) {
    // The element might have been inserted into another frame.
    // `element.ownerDocument` refers to the document the element exists in.
    const { documentElement } = element.ownerDocument;
    if (documentElement == null) {
      return;
    }

    if (documentElement.contains(element)) {
      apply(dispatchEvent, element, [new CustomEvent2(eventName)]);
    } else {
      // The element is not be inserted into the DOM (yet/anymore), which causes
      // the event not to fire. If so, add a temporary attribute to it so it can
      // be recognized when added to the DOM (if at all). We used to temporarily
      // insert the element into the DOM and send the event here, but that
      // causes video titles to sometimes go missing on YouTube.
      apply(setAttribute, element, [EVENT_ATTRIBUTE, eventName]);
    }
  }

  const clickListenerTracker = new ClickListenerTracker();
  const hookManager = new HookManager();

  function onAddEventListener(
    orig: Function,
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

    clickListenerTracker.queueItem({
      type: "method",
      added: true,
      element,
      eventName,
      listener,
      options,
    });
  }

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

    clickListenerTracker.queueItem({
      type: "method",
      added: false,
      element,
      eventName,
      listener,
      options,
    });
  }

  function onPropChange(orig: Function, element: mixed) {
    if (!(element instanceof HTMLElement2)) {
      return;
    }

    clickListenerTracker.queueItem({
      type: "prop",
      hadListener: hasClickListenerProp(element),
      element,
    });
  }

  hookManager.hookInto(
    EventTarget.prototype,
    "addEventListener",
    onAddEventListener
  );

  hookManager.hookInto(
    EventTarget.prototype,
    "removeEventListener",
    (orig: Function, ...args) => {
      onRemoveEventListener(...args);
    }
  );

  // Hook into `.onclick` and similar.
  for (const prop of clickableEventProps) {
    hookManager.hookInto(HTMLElement.prototype, prop, onPropChange);
  }

  hookManager.conceal();

  defineProperty(window, INJECTED_VAR, {
    // Immediately call another function so that `.toString()` gives away as
    // little as possible (especially the secret).
    value: (...args) => external(...args),
    // The rest of the options default to being neither enumerable nor changable.
  });

  function external(message: mixed, secret: mixed) {
    if (
      secret !== SECRET &&
      // Allow reseting old versions of this script when developing in Firefox.
      // It is unfortunately not possible to run cleanup logic when an extension
      // is disabled in Firefox (like it is in Chrome – see renderer/Program.js
      // for more information) so injected.js from the old version will hang
      // around. That can be very annoying when developing, but doesn’t matter
      // match in production.
      !(!PROD && BROWSER === "firefox" && message === MESSAGE_RESET)
    ) {
      // Silently ignore wrong secrets in production.
      if (!PROD) {
        logError("[synth]: Secret mismatch", {
          actual: secret,
          expected: SECRET,
          message,
        });
      }

      return;
    }

    switch (message) {
      case MESSAGE_FLUSH:
        clickListenerTracker.flushQueue(infiniteDeadline);
        break;

      // Reset the overridden methods when the extension is shut down.
      case MESSAGE_RESET:
        clickListenerTracker.reset();
        hookManager.reset();
        // eslint-disable-next-line no-func-assign
        external = noop;
        break;

      default:
        // Silently ignore unknown messages in production.
        if (!PROD) {
          logError("[synth]: Unknown message", message);
        }
    }
  }

  function noop() {
    // Do nothing.
  }

  function cleanupOldScripts() {
    const candidates = Object.getOwnPropertyNames(window).filter(name =>
      INJECTED_VAR_PATTERN.test(name)
    );

    for (const name of candidates) {
      try {
        // No need to pass in a secret here (see the `external` function).
        window[name](MESSAGE_RESET);
      } catch (error) {
        logError(`[synth]: Failed to reset "${name}"`, error);
      }
    }
  }
};
