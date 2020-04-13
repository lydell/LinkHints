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

// To make things even more complicated, in Firefox the `export default`
// function is actually executed rather than inserted as an inline script. This
// is to work around Firefox’s CSP limiations. As a bonus, Firefox can
// communicate with this file directly (via the `communicator` parameter) rather
// than via very clever usage of DOM events. This works in Firefox due to
// `.wrappedJSObject`, `exportFunction` and `XPCNativeWrapper`.

// All types of events that likely makes an element clickable. All code and
// comments that deal with this only refer to "click", though, to keep things
// simple.
export const CLICKABLE_EVENT_NAMES = ["click", "mousedown"];
export const CLICKABLE_EVENT_PROPS: Array<string> = CLICKABLE_EVENT_NAMES.map(
  (eventName) => `on${eventName}`
);

// Common prefix for events. It’s important to create a name unique from
// previous versions of the extension, in case this script hangs around after an
// update (it’s not possible to do cleanups before disabling an extension in
// Firefox). We don’t want the old version to interfere with the new one. This
// uses `BUILD_ID` rather than `makeRandomToken()` so that all frames share
// the same event name. Clickable elements created in this frame but inserted
// into another frame need to dispatch an event in their parent window rather
// than this one. However, since the prefix is static it will be possible for
// malicious sites to send these events. Luckily, that doesn’t hurt much. All
// the page could do is cause false positives or disable detection of click
// events altogether.
const prefix = `__${META_SLUG}WebExt_${BUILD_ID}_`;

// Events that don’t need to think about the iframe edge case described above
// can use this more secure prefix, with a practically unguessable part in it.
const secretPrefix = `__${META_SLUG}WebExt_${makeRandomToken()}_`;

export const CLICKABLE_CHANGED_EVENT = `${prefix}ClickableChanged`;
export const OPEN_SHADOW_ROOT_CREATED_EVENT = `${prefix}OpenShadowRootCreated`;
export const CLOSED_SHADOW_ROOT_CREATED_1_EVENT = `${prefix}ClosedShadowRootCreated1`;
export const CLOSED_SHADOW_ROOT_CREATED_2_EVENT = `${prefix}ClosedShadowRootCreated2`;

export const QUEUE_EVENT = `${secretPrefix}Queue`;

// If an element is not inserted into the page, events fired on it won’t reach
// ElementManager’s window event listeners. Instead, such elements are
// temporarily inserted into a secret element. This event is used to register
// the secret element in ElementManager.
export const REGISTER_SECRET_ELEMENT_EVENT = `${secretPrefix}RegisterSecretElement`;

// Events sent from ElementManager to this file.
export const FLUSH_EVENT = `${secretPrefix}Flush`;
export const RESET_EVENT = `${secretPrefix}Reset`;

export type FromInjected =
  | { type: "ClickableChanged", target: EventTarget, clickable: boolean }
  | { type: "ShadowRootCreated", shadowRoot: ShadowRoot }
  | { type: "Queue", hasQueue: boolean };

export default (communicator?: {
  +onInjectedMessage: (FromInjected) => mixed,
  +addEventListener: (string, () => mixed, _?: true) => mixed,
  ...
}) => {
  // Refers to the page `window` both in Firefox and other browsers.
  const win = BROWSER === "firefox" ? window.wrappedJSObject || window : window;

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
  const ShadowRoot2 = ShadowRoot;
  // Don't use the usual `log` function here, too keep this file small.
  const { error: consoleLogError, log: consoleLog } = console;
  const createElement = document.createElement.bind(document);
  const { appendChild, removeChild, getRootNode } = Node.prototype;
  const { replaceWith } = Element.prototype;
  const { addEventListener, dispatchEvent } = EventTarget.prototype;
  const { apply } = Reflect;
  const { get: mapGet } = Map.prototype;

  function logError(...args: Array<mixed>) {
    consoleLogError(`[${META_SLUG}]`, ...args);
  }

  type Deadline = { timeRemaining: () => number, ... };

  const infiniteDeadline: Deadline = {
    timeRemaining: () => Infinity,
  };

  class HookManager {
    fnMap: Map<AnyFunction, AnyFunction> = new Map();
    resetFns: Array<AnyFunction> = [];

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
    // 1. We don’t want to break websites. For example, naively overriding
    //    `addEventListener` breaks CKEditor: <https://jsfiddle.net/tv5x6zuj/>
    //    See also: <https://github.com/philc/vimium/issues/2900> (and its
    //    linked issues and PRs).
    // 2. We don’t want developers to see strange things in the console when
    //    they debug stuff.
    //
    // `hook` is run _after_ the original function. If you need to do something
    // _before_ the original function is called, use a `prehook`.
    hookInto<T>(
      obj: { [string]: mixed, ... },
      name: string,
      hook?: (
        { returnValue: any, prehookData: T | void },
        ...args: Array<any>
      ) => any,
      prehook?: (...args: Array<any>) => T
    ) {
      const descriptor = Reflect.getOwnPropertyDescriptor(obj, name);
      const prop = "value" in descriptor ? "value" : "set";
      const originalFn = descriptor[prop];

      const { fnMap } = this;

      // `f = { [name]: function(){} }[name]` is a way of creating a dynamically
      // named function (where `f.name === name`).
      const fn =
        hook == null
          ? {
              [originalFn.name](...args: Array<any>): any {
                // In the cases where no hook is provided we just want to make sure
                // that the method (such as `toString`) is called with the
                // _original_ function, not the overriding function.
                return apply(
                  originalFn,
                  apply(mapGet, fnMap, [this]) || this,
                  args
                );
              },
            }[originalFn.name]
          : {
              [originalFn.name](...args: Array<any>): any {
                let wrappedArgs = args;
                if (BROWSER === "firefox") {
                  wrappedArgs = args.map((arg) => XPCNativeWrapper(arg));
                }

                let prehookData = undefined;
                if (prehook != null) {
                  try {
                    prehookData = prehook(this, ...wrappedArgs);
                  } catch (error) {
                    logHookError(error, obj, name);
                  }
                }

                // Since Firefox does not support running cleanups when an
                // extension is disabled/updated (<bugzil.la/1223425>), hooks
                // from the previous version will still be around (until the
                // page is reloaded). `apply(originalFn, this, args)` fails with
                // "can't access dead object" for the old hooks will fail, so
                // ignore that error and abort those hooks.
                let returnValue = undefined;
                if (BROWSER === "firefox") {
                  try {
                    returnValue = XPCNativeWrapper(
                      apply(originalFn, this, args)
                    );
                  } catch (error) {
                    if (
                      error &&
                      error.name === "TypeError" &&
                      error.message === "can't access dead object"
                    ) {
                      return undefined;
                    }
                    throw error;
                  }
                } else {
                  returnValue = apply(originalFn, this, args);
                }

                // In case there's a mistake in `hook` it shouldn't cause the entire
                // overridden method to fail and potentially break the whole page.
                try {
                  // Remember that `hook` can be called with _anything,_ because the
                  // user can pass invalid arguments and use `.call`.
                  const result = hook(
                    { returnValue, prehookData },
                    this,
                    ...wrappedArgs
                  );
                  if (result != null && typeof result.then === "function") {
                    result.then(undefined, (error) => {
                      logHookError(error, obj, name);
                    });
                  }
                } catch (error) {
                  logHookError(error, obj, name);
                }

                return returnValue;
              },
            }[originalFn.name];

      // Make sure that `.length` is correct. This has to be done _after_
      // `exportFunction`.
      const setLength = (target) => {
        Reflect.defineProperty(target, "length", {
          ...Reflect.getOwnPropertyDescriptor(Function.prototype, "length"),
          value: originalFn.length,
        });
      };

      // Save the overriding and original functions so we can map overriding to
      // original in the case with no `hook` above.
      fnMap.set(fn, originalFn);

      // Cannot use a computed property here due to Flow.
      let newDescriptor =
        prop === "value"
          ? { ...descriptor, value: fn }
          : { ...descriptor, set: fn };

      if (BROWSER === "firefox") {
        if (prop === "value") {
          exportFunction(fn, obj, { defineAs: name });
          setLength(obj[name]);
          this.resetFns.push(() => {
            exportFunction(originalFn, obj, { defineAs: name });
          });
          return;
        }

        newDescriptor = Object.assign(new win.Object(), descriptor, {
          set: exportFunction(fn, new win.Object(), { defineAs: name }),
        });
      }

      setLength(newDescriptor[prop]);

      // Finally override the method with the created function.
      Reflect.defineProperty(obj, name, newDescriptor);
      this.resetFns.push(() => {
        Reflect.defineProperty(obj, name, descriptor);
      });
    }

    // Make sure that `Function.prototype.toString.call(element.addEventListener)`
    // returns "[native code]". This is used by lodash's `_.isNative`.
    // `.toLocaleString` is automatically taken care of when patching `.toString`.
    conceal() {
      // This isn’t needed in Firefox, thanks to `exportFunction`.
      if (BROWSER !== "firefox") {
        this.hookInto(win.Function.prototype, "toString");
      }
    }
  }

  function logHookError(
    error: Error,
    obj: { [string]: mixed, ... },
    name: string
  ) {
    logError(`Failed to run hook for ${name} on`, obj, error);
  }

  type ClickListenersByElement = Map<HTMLElement, OptionsByListener>;
  type OptionsByListener = Map<mixed, OptionsSet>;
  type OptionsSet = Set<string>;

  // Changes to event listeners.
  type QueueItem = QueueItemProp | QueueItemMethod;

  // `.onclick` and similar.
  type QueueItemProp = {
    type: "prop",
    hadListener: boolean,
    element: HTMLElement,
  };

  // `.addEventListener` and `.removeEventListener`.
  type QueueItemMethod = {
    type: "method",
    added: boolean,
    element: HTMLElement,
    eventName: string,
    listener: mixed,
    options: mixed,
  };

  // Elements waiting to be sent to ElementManager.js (in Chrome only).
  type SendQueueItem = {
    added: boolean,
    element: HTMLElement,
  };

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
        if (communicator != null) {
          communicator.onInjectedMessage({ type: "Queue", hasQueue: true });
        } else {
          sendWindowEvent(QUEUE_EVENT, true);
        }
      }
    }

    requestIdleCallback() {
      if (this.idleCallbackId == null) {
        this.idleCallbackId = requestIdleCallback((deadline) => {
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
        if (communicator != null) {
          communicator.onInjectedMessage({ type: "Queue", hasQueue: false });
        } else {
          sendWindowEvent(QUEUE_EVENT, false);
        }
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

        if (communicator != null) {
          communicator.onInjectedMessage({
            type: "ClickableChanged",
            target: item.element,
            clickable: item.added,
          });
        } else {
          sendElementEvent(CLICKABLE_CHANGED_EVENT, item.element, item.added);
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

  type Queue<T> = {
    items: Array<T>,
    index: number,
  };

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
      .map((name) => Boolean(normalized[name]).toString())
      .join(",");
    return `${eventName}:${optionsString}`;
  }

  function hasClickListenerProp(element: HTMLElement): boolean {
    return clickableEventProps.some(
      (prop) =>
        // $FlowIgnore: I _do_ want to dynamically read properties here.
        typeof element[prop] === "function"
    );
  }

  function sendWindowEvent(eventName: string, detail: any) {
    apply(dispatchEvent, window, [new CustomEvent2(eventName, { detail })]);
  }

  function makeSecretElement(): HTMLElement {
    // Content scripts running at `document_start` actually execute _before_
    // `document.head` exists! `document.documentElement` seems to be completely
    // empty when this runs (in new tabs). Just to be extra safe, use a `<head>`
    // element as the secret element. `<head>` is invisible (`display: none;`)
    // and a valid child of `<html>`. I’m worried injecting some other element
    // could cause the browser to paint that, resulting in a flash of unstyled
    // content.
    const secretElement = createElement("head");
    const { documentElement } = document;
    if (documentElement != null && communicator == null) {
      apply(appendChild, documentElement, [secretElement]);
      apply(dispatchEvent, secretElement, [
        new CustomEvent2(REGISTER_SECRET_ELEMENT_EVENT),
      ]);
      apply(removeChild, documentElement, [secretElement]);
    }
    return secretElement;
  }

  // In Firefox, it is also possible to use `sendWindowEvent` passing `element`
  // as `detail`, but that does not work properly in all cases when an element
  // is inserted into another frame. Chrome does not allow passing DOM elements
  // as `detail` from a page to an extension at all.
  const secretElement = makeSecretElement();
  function sendElementEvent(
    eventName: string,
    element: Element,
    detail: any = undefined,
    root: OpenComposedRootNode = getOpenComposedRootNode(element)
  ) {
    const send = () => {
      apply(dispatchEvent, element, [
        // `composed: true` is used to allow the event to be observed outside
        // the current ShadowRoot (if any).
        new CustomEvent2(eventName, { detail, composed: true }),
      ]);
    };

    switch (root.type) {
      // The element has 0 or more _open_ shadow roots above it and is connected
      // to the page. Nothing more to do – just fire the event.
      case "Document":
        send();
        break;

      // For the rest of the cases, the element is not inserted into the page
      // (yet/anymore), which means that ElementManager’s window event listeners
      // won’t fire. Instead, temporarily insert the element into a disconnected
      // element that ElementManager knows about and listens to, but nobody else
      // knows about. This avoids triggering MutationObservers on the page.
      // Note that the element might still have parent elements (which aren’t
      // inserted into the page either), so one cannot just insert `element`
      // into `secretElement` and then remove `element` again – then `element`
      // would also be removed from its original parent, and be missing when the
      // parent is inserted into the page.

      // We end up here if:
      // - `element` has no parents at all (if so, `element === root.element`).
      // - `element` has a (grand-)parent element that has no parents.
      // - `element` has one or more _open_ shadow roots above it, and the host
      //   element of the topmost shadow root has no parents.
      // In these cases, it’s the easiest and less invasive to move the entire
      // tree temporarily to the secret element.
      case "Element":
        apply(appendChild, secretElement, [root.element]);
        send();
        apply(removeChild, secretElement, [root.element]);
        break;

      // If there’s a _closed_ shadow root somewhere up the chain, we must
      // temporarily move `element` out of the top-most closed shadow root
      // before we can dispatch events. Replace `element` with a dummy element,
      // move it into the secret element, and then replace the dummy back with
      // `element` again.
      case "Closed": {
        const tempElement = createElement("div");
        apply(replaceWith, element, [tempElement]);
        apply(appendChild, secretElement, [element]);
        send();
        apply(replaceWith, tempElement, [element]);
        break;
      }

      default:
        logError("Unknown getOpenComposedRootNode type:", root);
    }
  }

  type OpenComposedRootNode =
    | { type: "Document" }
    | { type: "Element", element: Element }
    | { type: "Closed" };

  function getOpenComposedRootNode(element: Element): OpenComposedRootNode {
    const root = apply(getRootNode, element, []);
    return root === element
      ? { type: "Element", element }
      : root instanceof ShadowRoot2
      ? root.mode === "open"
        ? getOpenComposedRootNode(root.host)
        : { type: "Closed" }
      : { type: "Document" };
  }

  const clickListenerTracker = new ClickListenerTracker();
  const hookManager = new HookManager();

  function onAddEventListener(
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
      apply(addEventListener, element, [
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

  function onPropChangePreHook(element: mixed): QueueItem | void {
    if (!(element instanceof HTMLElement2)) {
      return undefined;
    }

    return {
      type: "prop",
      hadListener: hasClickListenerProp(element),
      element,
    };
  }

  function onPropChange({
    prehookData,
  }: {
    prehookData: QueueItem | void,
    ...
  }) {
    if (prehookData != null) {
      clickListenerTracker.queueItem(prehookData);
    }
  }

  function onShadowRootCreated({
    returnValue: shadowRoot,
  }: {
    returnValue: ShadowRoot,
    ...
  }) {
    if (communicator != null) {
      communicator.onInjectedMessage({
        type: "ShadowRootCreated",
        shadowRoot,
      });
      // $FlowIgnore: Flow doesn’t know about the `.mode` property yet.
    } else if (shadowRoot.mode === "open") {
      // In “open” mode, ElementManager can access shadow roots via the
      // `.shadowRoot` property on elements. All we need to do here is tell
      // the ElementManager that a shadow root has been created.
      sendElementEvent(OPEN_SHADOW_ROOT_CREATED_EVENT, shadowRoot.host);
    } else {
      // In “closed” mode, ElementManager cannot easily access shadow roots.
      // By creating a temporary element inside the shadow root and emitting
      // events on that element, ElementManager can obtain the shadow root
      // via the `.getRootNode()` method and store it in a WeakMap. This is
      // done in two steps – see the listeners in ElementManager to learn why.
      const tempElement = createElement("div");
      // Expose `tempElement`:
      sendElementEvent(CLOSED_SHADOW_ROOT_CREATED_1_EVENT, tempElement);
      apply(appendChild, shadowRoot, [tempElement]);
      // Expose `shadowRoot`:
      sendElementEvent(
        CLOSED_SHADOW_ROOT_CREATED_2_EVENT,
        tempElement,
        undefined,
        {
          // Force firing the event while `tempElement` is still inside the
          // closed shadow root. Normally we don’t do that, since events from
          // within closed shadow roots appear to come from its host element,
          // and the whole point of `sendElementEvent` is to set
          // `event.target` to `element`, not to some shadow root. But in this
          // special case `event.target` doesn’t matter and we _need_
          // `tempElement` to be inside `shadowRoot` so that `.getRootNode()`
          // returns it.
          type: "Document",
        }
      );
      apply(removeChild, shadowRoot, [tempElement]);
    }
  }

  function onFlush() {
    clickListenerTracker.flushQueue(infiniteDeadline);
  }

  function onReset() {
    if (!PROD) {
      consoleLog(`[${META_SLUG}] Resetting injected.js`, RESET_EVENT);
    }

    // ElementManager removes listeners itself on reset.
    if (communicator == null) {
      document.removeEventListener(FLUSH_EVENT, onFlush, true);
      document.removeEventListener(RESET_EVENT, onReset, true);
    }

    // Reset the overridden methods when the extension is shut down.
    clickListenerTracker.reset();
    hookManager.reset();
  }

  // Use `document` rather than `window` in order not to appear in the “Global
  // event listeners” listing in devtools.
  const target = communicator || document;
  target.addEventListener(FLUSH_EVENT, onFlush, true);
  target.addEventListener(RESET_EVENT, onReset, true);

  hookManager.hookInto(
    win.EventTarget.prototype,
    "addEventListener",
    (_data, ...args) => {
      onAddEventListener(...args);
    }
  );

  hookManager.hookInto(
    win.EventTarget.prototype,
    "removeEventListener",
    (_data, ...args) => {
      onRemoveEventListener(...args);
    }
  );

  // Hook into `.onclick` and similar.
  for (const prop of clickableEventProps) {
    hookManager.hookInto(
      win.HTMLElement.prototype,
      prop,
      onPropChange,
      onPropChangePreHook
    );
  }

  hookManager.hookInto(
    win.Element.prototype,
    "attachShadow",
    onShadowRootCreated
  );

  hookManager.conceal();
};
