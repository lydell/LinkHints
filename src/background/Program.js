// @flow strict-local

import huffman from "n-ary-huffman";

import iconsChecksum from "../icons/checksum";
import {
  type ElementRender,
  type ElementReport,
  type ElementTypes,
  type ElementWithHint,
  type ExtendedElementReport,
  type HintMeasurements,
  type HintUpdate,
  elementKey,
} from "../shared/hints";
import {
  type HintsMode,
  type KeyboardAction,
  type KeyboardModeBackground,
  type NormalizedKeypress,
  PREVENT_OVERTYPING_ALLOWED_KEYBOARD_ACTIONS,
} from "../shared/keyboard";
import {
  addListener,
  bind,
  CONTAINER_ID,
  isMixedCase,
  log,
  makeRandomToken,
  partition,
  Resets,
  splitEnteredText,
  unreachable,
} from "../shared/main";
import type {
  FromBackground,
  FromOptions,
  FromPopup,
  FromRenderer,
  FromWorker,
  ToBackground,
  ToOptions,
  ToPopup,
  ToRenderer,
  ToWorker,
} from "../shared/messages";
import {
  type Options,
  type OptionsData,
  type PartialOptions,
  diffOptions,
  flattenOptions,
  getDefaults,
  getRawOptions,
  makeOptionsDecoder,
  unflattenOptions,
} from "../shared/options";
import {
  type Perf,
  type Stats,
  type TabsPerf,
  decodeTabsPerf,
  MAX_PERF_ENTRIES,
  TimeTracker,
} from "../shared/perf";
import { tweakable, unsignedInt } from "../shared/tweakable";

type MessageInfo = {
  tabId: number,
  frameId: number,
  url: ?string,
};

type TabState = {
  hintsState: HintsState,
  keyboardMode: KeyboardModeBackground,
  perf: Perf,
  isOptionsPage: boolean,
  isPinned: boolean,
};

type HintsState =
  | {
      type: "Idle",
      highlighted: Highlighted,
    }
  | {
      type: "Collecting",
      mode: HintsMode,
      pendingElements: PendingElements,
      startTime: number,
      time: TimeTracker,
      stats: Array<Stats>,
      refreshing: boolean,
      highlighted: Highlighted,
    }
  | {
      type: "Hinting",
      mode: HintsMode,
      startTime: number,
      time: TimeTracker,
      stats: Array<Stats>,
      enteredChars: string,
      enteredText: string,
      elementsWithHints: Array<ElementWithHint>,
      highlighted: Highlighted,
      updateState: UpdateState,
      peeking: boolean,
    };

// All HintsState types store the highlighted hints (highlighted due to being
// matched, not due to filtering by text), so that they can stay highlighted for
// `t.MATCH_HIGHLIGHT_DURATION` ms.
type Highlighted = Array<{
  sinceTimestamp: number,
  element: ElementWithHint,
}>;

type PendingElements = {
  pendingFrames: {
    answering: number,
    collecting: number,
    lastStartWaitTimestamp: number,
  },
  elements: Array<ExtendedElementReport>,
};

type UpdateState =
  | {
      type: "WaitingForTimeout",
      lastUpdateStartTimestamp: number,
    }
  | {
      type: "WaitingForResponse",
      lastUpdateStartTimestamp: number,
    };

type HintInput =
  | {
      type: "Input",
      keypress: NormalizedKeypress,
    }
  | {
      type: "ActivateHint",
      alt: boolean,
    }
  | {
      type: "Backspace",
    };

// As far as I can tell, the top frameId is always 0. This is also mentioned here:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/Tabs/executeScript
// “frameId: Optional integer. The frame where the code should be injected.
// Defaults to 0 (the top-level frame).”
const TOP_FRAME_ID = 0;

export const t = {
  // Some onscreen frames may never respond (if the frame 404s or hasn't loaded
  // yet), but the parent can't now that. If a frame hasn't reported that it is
  // alive after this timeout, ignore it.
  FRAME_REPORT_TIMEOUT: unsignedInt(100), // ms

  // Only show the badge “spinner” if the hints are slow.
  BADGE_COLLECTING_DELAY: unsignedInt(300), // ms

  // Roughly how often to update the hints in hints mode. While a lower number
  // might yield updates faster, that feels very stuttery. Having a somewhat
  // longer interval feels better.
  UPDATE_INTERVAL: unsignedInt(500), // ms
  UPDATE_MIN_TIMEOUT: unsignedInt(100), // ms

  // How long a matched/activated hint should show as highlighted.
  MATCH_HIGHLIGHT_DURATION: unsignedInt(200), // ms
};

export const tMeta = tweakable("Background", t);

export default class BackgroundProgram {
  options: OptionsData;
  tabState: Map<number, TabState> = new Map();
  restoredTabsPerf: TabsPerf = {};
  oneTimeWindowMessageToken: string = makeRandomToken();
  resets: Resets = new Resets();

  constructor() {
    const mac = false;
    const defaults = getDefaults({ mac });
    this.options = {
      defaults,
      values: defaults,
      raw: {},
      errors: [],
      mac,
    };

    bind(this, [
      [this.maybeOpenTutorial, { catch: true }],
      [this.maybeReopenOptions, { catch: true }],
      [this.onKeyboardShortcut, { catch: true }],
      [this.onMessage, { catch: true }],
      [this.onOptionsMessage, { log: true, catch: true }],
      [this.onPopupMessage, { log: true, catch: true }],
      [this.onRendererMessage, { log: true, catch: true }],
      [this.onTimeout, { catch: true }],
      [this.onWorkerMessage, { log: true, catch: true }],
      [this.openNewTab, { catch: true }],
      [this.sendBackgroundMessage, { log: true, catch: true }],
      [this.sendContentMessage, { catch: true }],
      [this.sendPopupMessage, { log: true, catch: true }],
      [this.sendRendererMessage, { log: true, catch: true }],
      [this.sendWorkerMessage, { log: true, catch: true }],
      [this.start, { catch: true }],
      [this.stop, { log: true, catch: true }],
      [this.updateIcon, { catch: true }],
      [this.updateOptions, { catch: true }],
      [this.updateOptionsPageData, { catch: true }],
      this.onConnect,
      this.onTabActivated,
      this.onTabCreated,
      this.onTabUpdated,
      this.onTabRemoved,
    ]);
  }

  async start() {
    log("log", "BackgroundProgram#start", BROWSER, PROD);

    try {
      await this.updateOptions({ isInitial: true });
    } catch (error) {
      this.options.errors = [error.message];
    }

    if (!PROD) {
      await this.restoreTabsPerf();
    }

    const tabs = await browser.tabs.query({});

    this.resets.add(
      addListener(browser.runtime.onMessage, this.onMessage),
      addListener(browser.runtime.onConnect, this.onConnect),
      addListener(browser.tabs.onActivated, this.onTabActivated),
      addListener(browser.tabs.onCreated, this.onTabCreated),
      addListener(
        browser.tabs.onUpdated,
        this.onTabUpdated,
        // Chrome doesn’t support filters.
        BROWSER === "firefox" ? { properties: ["status", "pinned"] } : undefined
      ),
      addListener(browser.tabs.onRemoved, this.onTabRemoved)
    );

    for (const tab of tabs) {
      this.updateIcon(tab.id);
    }

    browser.browserAction.setBadgeBackgroundColor({ color: COLOR_BADGE });

    this.maybeOpenTutorial();
    this.maybeReopenOptions();

    // Firefox automatically loads content scripts into existing tabs, while
    // Chrome only automatically loads content scripts into _new_ tabs.
    // Firefox requires a workaround (see renderer/Program.js), while we
    // manually load the content scripts into existing tabs in Chrome.
    if (BROWSER === "firefox") {
      firefoxWorkaround(tabs);
    } else {
      await runContentScripts(tabs);
    }
  }

  stop() {
    this.resets.reset();
  }

  async sendWorkerMessage(
    message: ToWorker,
    { tabId, frameId }: { tabId: number, frameId: number | "all_frames" }
  ) {
    await this.sendContentMessage(
      { type: "ToWorker", message },
      { tabId, frameId }
    );
  }

  async sendRendererMessage(message: ToRenderer, { tabId }: { tabId: number }) {
    await this.sendContentMessage(
      { type: "ToRenderer", message },
      { tabId, frameId: TOP_FRAME_ID }
    );
  }

  async sendPopupMessage(message: ToPopup) {
    await this.sendBackgroundMessage({ type: "ToPopup", message });
  }

  async sendOptionsMessage(message: ToOptions) {
    const optionsTabOpen = Array.from(this.tabState).some(
      ([, tabState]) => tabState.isOptionsPage
    );
    // Trying to send a message to Options when no Options tab is open results
    // in "errors" being logged to the console.
    if (optionsTabOpen) {
      await this.sendBackgroundMessage({ type: "ToOptions", message });
    }
  }

  // This might seem like sending a message to oneself, but
  // `browser.runtime.sendMessage` seems to only send messages to *other*
  // background scripts, such as the popup script.
  async sendBackgroundMessage(message: FromBackground) {
    await browser.runtime.sendMessage(message);
  }

  async sendContentMessage(
    message: FromBackground,
    { tabId, frameId }: { tabId: number, frameId: number | "all_frames" }
  ) {
    await (frameId === "all_frames"
      ? browser.tabs.sendMessage(tabId, message)
      : browser.tabs.sendMessage(tabId, message, { frameId }));
  }

  async onMessage(message: ToBackground, sender: MessageSender) {
    // `info` can be missing when the message comes from for example the popup
    // (which isn’t associated with a tab). The worker script can even load in
    // an `about:blank` frame somewhere when hovering the browserAction!
    const info = makeMessageInfo(sender);

    const tabStateRaw =
      info == null ? undefined : this.tabState.get(info.tabId);
    const tabState =
      tabStateRaw == null
        ? await makeEmptyTabState(info != null ? info.tabId : undefined)
        : tabStateRaw;

    if (info != null && tabStateRaw == null) {
      const { [info.tabId.toString()]: perf = [] } = this.restoredTabsPerf;
      tabState.perf = perf;
      this.tabState.set(info.tabId, tabState);
    }

    switch (message.type) {
      case "FromWorker":
        if (info != null) {
          this.onWorkerMessage(message.message, info, tabState);
        }
        break;

      case "FromRenderer":
        if (info != null) {
          this.onRendererMessage(message.message, info, tabState);
        }
        break;

      case "FromPopup":
        this.onPopupMessage(message.message);
        break;

      case "FromOptions":
        if (info != null) {
          this.onOptionsMessage(message.message, info, tabState);
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onConnect(port: Port) {
    port.onDisconnect.addListener(({ sender }) => {
      const info = sender == null ? undefined : makeMessageInfo(sender);
      if (info != null) {
        // A frame was removed. If in hints mode, hide all hints for elements in
        // that frame.
        this.hideElements(info);
      }
    });
  }

  onWorkerMessage(message: FromWorker, info: MessageInfo, tabState: TabState) {
    switch (message.type) {
      case "WorkerScriptAdded":
        this.sendWorkerMessage(
          // Make sure that the added worker script gets the same token as all
          // other frames in the page. Otherwise the first hints mode won't
          // reach into any frames.
          this.makeWorkerState(tabState, { refreshToken: false }),
          {
            tabId: info.tabId,
            frameId: info.frameId,
          }
        );
        break;

      case "KeyboardShortcutMatched":
        this.onKeyboardShortcut(message.action, info, message.timestamp);
        break;

      case "NonKeyboardShortcutKeypress":
        this.handleHintInput(info.tabId, message.timestamp, {
          type: "Input",
          keypress: message.keypress,
        });
        break;

      case "KeypressCaptured":
        this.sendOptionsMessage({
          type: "KeypressCaptured",
          keypress: message.keypress,
        });
        break;

      case "ReportVisibleFrame": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Collecting") {
          return;
        }

        const { pendingFrames } = hintsState.pendingElements;
        pendingFrames.answering = Math.max(0, pendingFrames.answering - 1);
        pendingFrames.collecting += 1;
        break;
      }

      case "ReportVisibleElements": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Collecting") {
          return;
        }

        const elements: Array<ExtendedElementReport> = message.elements.map(
          (element) => ({
            ...element,
            // Move the element index into the `.frame` property. `.index` is set
            // later (in `this.maybeStartHinting`) and used to map elements in
            // BackgroundProgram to DOM elements in RendererProgram.
            index: -1,
            frame: { id: info.frameId, index: element.index },
            hidden: false,
          })
        );

        hintsState.pendingElements.elements.push(...elements);

        const { pendingFrames } = hintsState.pendingElements;
        pendingFrames.answering += message.numFrames;
        pendingFrames.collecting = Math.max(0, pendingFrames.collecting - 1);

        hintsState.stats.push(message.stats);

        if (message.numFrames === 0) {
          this.maybeStartHinting(info.tabId);
        } else {
          pendingFrames.lastStartWaitTimestamp = Date.now();
          this.setTimeout(info.tabId, t.FRAME_REPORT_TIMEOUT.value);
        }
        break;
      }

      case "ReportUpdatedElements": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }

        const updatedElementsWithHints = mergeElements(
          hintsState.elementsWithHints,
          message.elements,
          info.frameId
        );

        const { enteredChars, enteredText } = hintsState;

        const { allElementsWithHints, updates } = updateHints({
          mode: hintsState.mode,
          enteredChars,
          enteredText,
          elementsWithHints: updatedElementsWithHints,
          highlighted: hintsState.highlighted,
          chars: this.options.values.chars,
          autoActivate: this.options.values.autoActivate,
          matchHighlighted: false,
          updateMeasurements: true,
        });

        hintsState.elementsWithHints = allElementsWithHints;

        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            enteredText,
          },
          { tabId: info.tabId }
        );

        this.sendRendererMessage(
          {
            type: "RenderTextRects",
            rects: message.rects,
            frameId: info.frameId,
          },
          { tabId: info.tabId }
        );

        this.updateBadge(info.tabId);

        if (info.frameId === TOP_FRAME_ID) {
          const { updateState } = hintsState;

          const now = Date.now();
          const elapsedTime = now - updateState.lastUpdateStartTimestamp;
          const timeout = Math.max(
            t.UPDATE_MIN_TIMEOUT.value,
            t.UPDATE_INTERVAL.value - elapsedTime
          );

          log("log", "Scheduling next elements update", {
            elapsedTime,
            timeout,
            UPDATE_INTERVAL: t.UPDATE_INTERVAL.value,
            UPDATE_MIN_TIMEOUT: t.UPDATE_MIN_TIMEOUT.value,
          });

          hintsState.updateState = {
            type: "WaitingForTimeout",
            lastUpdateStartTimestamp: updateState.lastUpdateStartTimestamp,
          };

          this.setTimeout(info.tabId, timeout);
        }
        break;
      }

      case "ReportTextRects":
        this.sendRendererMessage(
          {
            type: "RenderTextRects",
            rects: message.rects,
            frameId: info.frameId,
          },
          { tabId: info.tabId }
        );
        break;

      // When clicking a link using the extension that causes a page load (no
      // `.preventDefault()`, no internal fragment identifier, no `javascript:`
      // protocol, etc), exit hints mode. This is especially nice for the
      // "ManyClick" mode since it makes the hints go away immediately when
      // clicking the link rather than after a little while when the "pagehide"
      // event has fired.
      case "ClickedLinkNavigatingToOtherPage": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Idle") {
          // Exit in “Delayed” mode so that the matched hints still show as
          // highlighted.
          this.exitHintsMode({ tabId: info.tabId, delayed: true });
        }
        break;
      }

      // If the user clicks a link while hints mode is active, exit it.
      // Otherwise you’ll end up in hints mode on the new page (it is still the
      // same tab, after all) but with no hints. If changing the address bar of
      // the tab to for example `about:preferences` it is too late to send
      // message to the content scripts (“Error: Receiving end does not exist”).
      // Instead, syncing `WorkerProgram`s and unrendering is taken care of
      // if/when returning to the page via the back button. (See below.)
      case "TopPageHide": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Idle") {
          this.exitHintsMode({ tabId: info.tabId, sendMessages: false });
        }
        break;
      }

      // When clicking the back button In Firefox, the content scripts of the
      // previous page aren’t re-run but instead pick up from where they were
      // when leaving the page. If the user clicked a link while in hints mode
      // and then pressed the back button, the `tabState` for the tab won’t be
      // in hints mode, but the content scripts of the page might be out of
      // sync. They never got any messages saying that hints mode was exited,
      // and now they pick up from where they were. So after returning to a page
      // via the back/forward buttons, make sure that the content scripts are in
      // sync.
      case "PersistedPageShow":
        this.sendWorkerMessage(this.makeWorkerState(tabState), {
          tabId: info.tabId,
          frameId: "all_frames",
        });
        break;

      case "OpenNewTabs":
        if (BROWSER === "firefox") {
          openNewTabs(info.tabId, message.urls);
        }

        break;

      default:
        unreachable(message.type, message);
    }
  }

  // Instead of doing `setTimeout(doSomething, duration)`, call
  // `this.setTimeout(tabId, duration)` instead and add
  // `this.doSomething(tabId)` to `onTimeout` below. Every method called from
  // `onTimeout` is responsible for checking that everything is in the correct
  // state and that the correct amount of time has passed. No matter when or
  // from where or in which state `onTimeout` is called, it should always do the
  // correct thing. This means that we never have to clear any timeouts, which
  // is very tricky to keep track of.
  setTimeout(tabId: number, duration: number) {
    setTimeout(() => {
      return this.onTimeout(tabId);
    }, duration);
  }

  onTimeout(tabId: number) {
    this.updateBadge(tabId);
    this.maybeStartHinting(tabId);
    this.updateElements(tabId);
    this.unhighlightHints(tabId);
    this.stopPreventOvertyping(tabId);
  }

  getTextRects({
    enteredChars,
    allElementsWithHints,
    words,
    tabId,
  }: {
    enteredChars: string,
    allElementsWithHints: Array<ElementWithHint>,
    words: Array<string>,
    tabId: number,
  }) {
    const indexesByFrame: Map<number, Array<number>> = new Map();
    for (const { text, hint, frame } of allElementsWithHints) {
      const previous = indexesByFrame.get(frame.id) || [];
      indexesByFrame.set(frame.id, previous);
      if (matchesText(text, words) && hint.startsWith(enteredChars)) {
        previous.push(frame.index);
      }
    }
    for (const [frameId, indexes] of indexesByFrame) {
      this.sendWorkerMessage(
        {
          type: "GetTextRects",
          indexes,
          words,
        },
        { tabId, frameId }
      );
    }
  }

  handleHintInput(tabId: number, timestamp: number, input: HintInput) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;
    if (hintsState.type !== "Hinting") {
      return;
    }

    // Ignore unknown/non-text keys.
    if (input.type === "Input" && input.keypress.printableKey == null) {
      return;
    }

    const isHintKey =
      (input.type === "Input" &&
        input.keypress.printableKey != null &&
        this.options.values.chars.includes(input.keypress.printableKey)) ||
      (input.type === "Backspace" && hintsState.enteredChars !== "");

    // Disallow filtering by text after having started entering hint chars.
    if (
      !isHintKey &&
      input.type !== "ActivateHint" &&
      hintsState.enteredChars !== ""
    ) {
      return;
    }

    // Update entered chars (either text chars or hint chars).
    const updated = updateChars(
      isHintKey ? hintsState.enteredChars : hintsState.enteredText,
      input
    );
    const enteredChars = isHintKey ? updated : hintsState.enteredChars;
    const enteredText = isHintKey
      ? hintsState.enteredText
      : updated
          .toLowerCase()
          // Trim leading whitespace and allow only one trailing space.
          .replace(/^\s+/, "")
          .replace(/\s+$/, " ");

    const {
      allElementsWithHints,
      match: actualMatch,
      updates,
      words,
    } = updateHints({
      mode: hintsState.mode,
      enteredChars,
      enteredText,
      elementsWithHints: hintsState.elementsWithHints,
      highlighted: hintsState.highlighted,
      chars: this.options.values.chars,
      autoActivate: this.options.values.autoActivate,
      matchHighlighted: input.type === "ActivateHint",
      updateMeasurements: false,
    });

    // Disallow matching hints (by text) by backspacing away chars. This can
    // happen if your entered text matches two links and then the link you
    // were after is removed.
    const [match, preventOverTyping] =
      input.type === "Backspace" || actualMatch == null
        ? [undefined, false]
        : [actualMatch.elementWithHint, actualMatch.autoActivated];

    // If pressing a hint char that is currently unused, ignore it.
    if (enteredChars !== "" && updates.every((update) => update.hidden)) {
      return;
    }

    const now = Date.now();
    const highlighted =
      match != null
        ? allElementsWithHints
            .filter((element) => element.hint === match.hint)
            .map((element) => ({ sinceTimestamp: now, element }))
        : [];

    hintsState.enteredChars = enteredChars;
    hintsState.enteredText = enteredText;
    hintsState.elementsWithHints = allElementsWithHints;
    hintsState.highlighted = hintsState.highlighted.concat(highlighted);

    this.getTextRects({
      enteredChars,
      allElementsWithHints,
      words,
      tabId,
    });

    const shouldContinue =
      match == null
        ? true
        : this.handleHintMatch({
            tabId,
            match,
            updates,
            preventOverTyping,
            alt:
              // By holding a modifier while typing the last character to
              // activate a hint forces opening links in new tabs. On Windows
              // and Linux, alt is used (since it is the only safe modifier). On
              // mac, ctrl is used since alt/option types special characters and
              // cmd is not safe.
              (input.type === "Input" &&
                (this.options.mac
                  ? input.keypress.ctrl
                  : input.keypress.alt)) ||
              (input.type === "ActivateHint" && input.alt),
            timestamp,
          });

    // Some hint modes handle updating hintsState and sending messages
    // themselves. The rest share the same implementation below.
    if (!shouldContinue) {
      return;
    }

    this.sendRendererMessage(
      {
        type: "UpdateHints",
        updates,
        enteredText,
      },
      { tabId }
    );

    if (match != null) {
      tabState.hintsState = {
        type: "Idle",
        highlighted: hintsState.highlighted,
      };
      this.setTimeout(tabId, t.MATCH_HIGHLIGHT_DURATION.value);
      this.updateWorkerStateAfterHintActivation({
        tabId,
        preventOverTyping,
      });
    }

    this.updateBadge(tabId);
  }

  // Executes some action on the element of the matched hint. Returns whether
  // the "NonKeyboardShortcutKeypress" handler should continue with its default
  // implementation for updating hintsState and sending messages or not. Some
  // hint modes handle that themselves.
  handleHintMatch({
    tabId,
    match,
    updates,
    preventOverTyping,
    alt,
    timestamp,
  }: {
    tabId: number,
    match: ElementWithHint,
    updates: Array<HintUpdate>,
    preventOverTyping: boolean,
    alt: boolean,
    timestamp: number,
  }): boolean {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return true;
    }

    const { hintsState } = tabState;
    if (hintsState.type !== "Hinting") {
      return true;
    }

    const { url } = match;

    const mode: HintsMode =
      url != null && alt && hintsState.mode !== "Select"
        ? "ForegroundTab"
        : hintsState.mode;

    switch (mode) {
      case "Click":
        this.sendWorkerMessage(
          {
            type: "ClickElement",
            index: match.frame.index,
          },
          {
            tabId,
            frameId: match.frame.id,
          }
        );
        return true;

      case "ManyClick": {
        if (match.isTextInput) {
          this.sendWorkerMessage(
            {
              type: "ClickElement",
              index: match.frame.index,
            },
            {
              tabId,
              frameId: match.frame.id,
            }
          );
          return true;
        }

        this.sendWorkerMessage(
          {
            type: "ClickElement",
            index: match.frame.index,
          },
          {
            tabId,
            frameId: match.frame.id,
          }
        );

        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            enteredText: hintsState.enteredText,
          },
          { tabId }
        );

        this.updateWorkerStateAfterHintActivation({
          tabId,
          preventOverTyping,
        });

        this.enterHintsMode({
          tabId,
          timestamp,
          mode: hintsState.mode,
        });

        this.setTimeout(tabId, t.MATCH_HIGHLIGHT_DURATION.value);

        return false;
      }

      case "ManyTab": {
        if (url == null) {
          log(
            "error",
            "Cannot open background tab (many) due to missing URL",
            match
          );
          return true;
        }

        const matchedIndexes = new Set(
          hintsState.elementsWithHints
            .filter((element) => element.hint === match.hint)
            .map((element) => element.index)
        );

        const highlightedKeys = new Set(
          hintsState.highlighted.map(({ element }) => elementKey(element))
        );

        hintsState.enteredChars = "";
        hintsState.enteredText = "";

        this.openNewTab({
          url,
          elementIndex: match.frame.index,
          tabId,
          frameId: match.frame.id,
          foreground: false,
        });

        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates: assignHints(hintsState.elementsWithHints, {
              mode: "ManyTab",
              chars: this.options.values.chars,
              hasEnteredText: false,
            }).map((element, index) => ({
              type: "UpdateContent",
              index: element.index,
              order: index,
              matchedChars: "",
              restChars: element.hint,
              highlighted:
                matchedIndexes.has(element.index) ||
                highlightedKeys.has(elementKey(element)),
              hidden: element.hidden,
            })),
            enteredText: "",
          },
          { tabId }
        );

        this.updateWorkerStateAfterHintActivation({
          tabId,
          preventOverTyping,
        });

        this.updateBadge(tabId);
        this.setTimeout(tabId, t.MATCH_HIGHLIGHT_DURATION.value);

        return false;
      }

      case "BackgroundTab":
        if (url == null) {
          log("error", "Cannot open background tab due to missing URL", match);
          return true;
        }
        this.openNewTab({
          url,
          elementIndex: match.frame.index,
          tabId,
          frameId: match.frame.id,
          foreground: false,
        });
        return true;

      case "ForegroundTab":
        if (url == null) {
          log("error", "Cannot open foreground tab due to missing URL", match);
          return true;
        }
        this.openNewTab({
          url,
          elementIndex: match.frame.index,
          tabId,
          frameId: match.frame.id,
          foreground: true,
        });
        return true;

      case "Select":
        this.sendWorkerMessage(
          alt
            ? {
                type: "CopyElement",
                index: match.frame.index,
              }
            : {
                type: "SelectElement",
                index: match.frame.index,
              },
          {
            tabId,
            frameId: match.frame.id,
          }
        );
        return true;

      default:
        unreachable(mode);
        return true;
    }
  }

  refreshHintsRendering(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;
    if (hintsState.type !== "Hinting") {
      return;
    }

    const { enteredChars, enteredText } = hintsState;

    const { allElementsWithHints, updates, words } = updateHints({
      mode: hintsState.mode,
      enteredChars,
      enteredText,
      elementsWithHints: hintsState.elementsWithHints,
      highlighted: hintsState.highlighted,
      chars: this.options.values.chars,
      autoActivate: this.options.values.autoActivate,
      matchHighlighted: false,
      updateMeasurements: false,
    });

    this.getTextRects({ enteredChars, allElementsWithHints, words, tabId });

    this.sendRendererMessage(
      {
        type: "UpdateHints",
        updates,
        enteredText,
      },
      { tabId }
    );

    this.updateBadge(tabId);
  }

  async openNewTab({
    url,
    elementIndex,
    tabId,
    frameId,
    foreground,
  }: {
    url: string,
    elementIndex: number,
    tabId: number,
    frameId: number,
    foreground: boolean,
  }) {
    this.sendWorkerMessage(
      {
        type: "FocusElement",
        index: elementIndex,
      },
      { tabId, frameId }
    );

    // In Firefox, creating a tab with `openerTabId` works just like
    // right-clicking a link and choosing "Open Link in New Tab" (basically,
    // it's opened to the right of the current tab). In Chrome, created tabs are
    // always opened at the end of the tab strip. However, dispatching a
    // ctrl-click on an `<a>` element opens a tab just like ctrl-clicking it for
    // real. I considered keeping track of where to open tabs manually for
    // Chrome, but the logic for where to open tabs turned out to be too
    // complicated to replicate in a good way, and there does not seem to be a
    // downside of using the fake ctrl-click method in Chrome. In fact, there’s
    // even an upside to the ctrl-click method: The HTTP Referer header is sent,
    // just as if you had clicked the link for real. See: <bugzil.la/1615860>.
    if (BROWSER === "chrome") {
      this.sendWorkerMessage(
        {
          type: "OpenNewTab",
          url,
          foreground,
        },
        { tabId, frameId: TOP_FRAME_ID }
      );
    } else {
      await browser.tabs.create({
        active: foreground,
        url,
        openerTabId: tabId,
      });
    }
  }

  maybeStartHinting(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;
    if (hintsState.type !== "Collecting") {
      return;
    }

    const { pendingFrames } = hintsState.pendingElements;
    const frameWaitDuration = Date.now() - pendingFrames.lastStartWaitTimestamp;
    if (
      pendingFrames.collecting > 0 ||
      (pendingFrames.answering > 0 &&
        frameWaitDuration < t.FRAME_REPORT_TIMEOUT.value)
    ) {
      return;
    }

    const { time } = hintsState;
    time.start("assign hints");

    const elementsWithHints: Array<ElementWithHint> = assignHints(
      hintsState.pendingElements.elements.map((element, index) => ({
        ...element,
        // These are filled in by `assignHints` but need to be set here for type
        // checking reasons.
        weight: 0,
        hint: "",
        // This is set for real in the next couple of lines, but set here also
        // to be extra sure that the sorting really is stable.
        index,
      })),
      {
        mode: hintsState.mode,
        chars: this.options.values.chars,
        hasEnteredText: false,
      }
      // `.index` was set to `-1` in "ReportVisibleElements" (and to a temporary
      // index above). Now set it for real to map these elements to DOM elements
      // in RendererProgram.
    ).map((element, index) => ({ ...element, index }));

    const elementKeys = new Set(
      elementsWithHints.map((element) => elementKey(element))
    );
    const highlightedKeys = new Set(
      hintsState.highlighted.map(({ element }) => elementKey(element))
    );

    const [
      alreadyHighlighted,
      extraHighlighted,
    ] = partition(hintsState.highlighted, ({ element }) =>
      elementKeys.has(elementKey(element))
    );

    const updateIndex = ({ element, sinceTimestamp }, index) => ({
      element: { ...element, index },
      sinceTimestamp,
    });

    const numElements = elementsWithHints.length;
    const highlighted = extraHighlighted
      // Add indexes to the highlighted hints that get extra DOM nodes.
      .map((item, index) => updateIndex(item, numElements + index))
      // Other highlighted hints don’t get extra DOM nodes – they instead
      // highlight new hints with the same characters and position. Mark them
      // with an index of -1 for `unhighlightHints`’s sakes.
      .concat(alreadyHighlighted.map((item) => updateIndex(item, -1)));

    const elementRenders: Array<ElementRender> = elementsWithHints
      .map((element, index) => ({
        hintMeasurements: element.hintMeasurements,
        hint: element.hint,
        // Hints at the same position and with the same hint characters as a
        // previously matched hint are marked as highlighted.
        highlighted: highlightedKeys.has(elementKey(element)),
        invertedZIndex: index + 1,
      }))
      // Other previously matched hints are rendered (but not stored in
      // `hintsState.elementsWithHints`).
      .concat(
        extraHighlighted.map(({ element }) => ({
          hintMeasurements: element.hintMeasurements,
          hint: element.hint,
          highlighted: true,
          // Previously matched hints are always shown on top over regular hints.
          invertedZIndex: 0,
        }))
      );

    tabState.hintsState = {
      type: "Hinting",
      mode: hintsState.mode,
      startTime: hintsState.startTime,
      time,
      stats: hintsState.stats,
      enteredChars: "",
      enteredText: "",
      elementsWithHints,
      highlighted,
      updateState: {
        type: "WaitingForTimeout",
        lastUpdateStartTimestamp: hintsState.startTime,
      },
      peeking: false,
    };
    this.sendWorkerMessage(this.makeWorkerState(tabState), {
      tabId,
      frameId: "all_frames",
    });
    this.setTimeout(tabId, t.UPDATE_INTERVAL.value);

    time.start("render");
    this.sendRendererMessage(
      {
        type: "Render",
        elements: elementRenders,
        mixedCase: isMixedCase(this.options.values.chars),
      },
      { tabId }
    );
    this.updateBadge(tabId);
  }

  updateElements(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;
    if (hintsState.type !== "Hinting") {
      return;
    }

    const { updateState } = hintsState;
    if (updateState.type !== "WaitingForTimeout") {
      return;
    }

    if (
      Date.now() - updateState.lastUpdateStartTimestamp >=
      t.UPDATE_INTERVAL.value
    ) {
      if (hintsState.elementsWithHints.every((element) => element.hidden)) {
        this.enterHintsMode({
          tabId,
          timestamp: Date.now(),
          mode: hintsState.mode,
        });
      } else {
        hintsState.updateState = {
          type: "WaitingForResponse",
          lastUpdateStartTimestamp: Date.now(),
        };

        // Refresh `oneTimeWindowMessageToken`.
        this.sendWorkerMessage(this.makeWorkerState(tabState), {
          tabId,
          frameId: "all_frames",
        });

        this.sendWorkerMessage(
          { type: "UpdateElements" },
          {
            tabId,
            frameId: TOP_FRAME_ID,
          }
        );
      }
    }
  }

  hideElements(info: MessageInfo) {
    const tabState = this.tabState.get(info.tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;

    if (hintsState.type !== "Hinting") {
      return;
    }

    const prefix = "BackgroundProgram#hideElements";

    if (info.frameId === TOP_FRAME_ID) {
      log(
        "log",
        prefix,
        "Skipping because this should not happen for the top frame.",
        info
      );
      return;
    }

    log("log", prefix, info);

    for (const element of hintsState.elementsWithHints) {
      if (element.frame.id === info.frameId) {
        element.hidden = true;
      }
    }

    const { enteredChars, enteredText } = hintsState;

    const { allElementsWithHints, updates } = updateHints({
      mode: hintsState.mode,
      enteredChars,
      enteredText,
      elementsWithHints: hintsState.elementsWithHints,
      highlighted: hintsState.highlighted,
      chars: this.options.values.chars,
      autoActivate: this.options.values.autoActivate,
      matchHighlighted: false,
      updateMeasurements: false,
    });

    hintsState.elementsWithHints = allElementsWithHints;

    this.sendRendererMessage(
      {
        type: "RenderTextRects",
        rects: [],
        frameId: info.frameId,
      },
      { tabId: info.tabId }
    );

    this.sendRendererMessage(
      {
        type: "UpdateHints",
        updates,
        enteredText,
      },
      { tabId: info.tabId }
    );

    this.updateBadge(info.tabId);
  }

  onRendererMessage(
    message: FromRenderer,
    info: MessageInfo,
    tabState: TabState
  ) {
    switch (message.type) {
      case "RendererScriptAdded":
        this.sendRendererMessage(
          {
            type: "StateSync",
            css: this.options.values.css,
            logLevel: log.level,
          },
          { tabId: info.tabId }
        );
        // Both uBlock Origin and Adblock Plus use `browser.tabs.insertCSS` with
        // `{ display: none !important; }` and `cssOrigin: "user"` to hide
        // elements. I’ve seen LinkHint’s container to be hidden by a
        // `[style*="animation:"]` filter. This makes sure that the container
        // cannot be hidden by adblockers.
        // In Chrome, 255 ids have the same specificity as >=256 (for Firefox,
        // it’s 1023). One can increase the specificity even more by adding
        // classes, but I don’t think it’s worth the trouble.
        browser.tabs
          .insertCSS(info.tabId, {
            code: `${`#${CONTAINER_ID}`.repeat(
              255
            )} { display: block !important; }`,
            cssOrigin: "user",
            runAt: "document_start",
          })
          .catch((error) => {
            log(
              "error",
              "BackgroundProgram#onRendererMessage",
              "Failed to insert adblock workaround CSS",
              error,
              info,
              message
            );
          });
        break;

      case "Rendered": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }
        const { startTime, time, stats: collectStats } = hintsState;
        time.stop();
        const { durations, firstPaintTimestamp, lastPaintTimestamp } = message;
        const timeToFirstPaint = firstPaintTimestamp - startTime;
        const timeToLastPaint = lastPaintTimestamp - startTime;
        tabState.perf = [
          {
            timeToFirstPaint,
            timeToLastPaint,
            topDurations: time.export(),
            collectStats,
            renderDurations: durations,
          },
          ...tabState.perf,
        ].slice(0, MAX_PERF_ENTRIES);
        this.sendOptionsMessage({
          type: "PerfUpdate",
          perf: { [info.tabId]: tabState.perf },
        });
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  async onPopupMessage(message: FromPopup) {
    switch (message.type) {
      case "PopupScriptAdded": {
        const tab = await getCurrentTab();
        const tabState = this.tabState.get(tab.id);
        this.sendPopupMessage({
          type: "Init",
          logLevel: log.level,
          isEnabled: tabState != null,
        });
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  async onOptionsMessage(
    message: FromOptions,
    info: MessageInfo,
    tabState: TabState
  ) {
    switch (message.type) {
      case "OptionsScriptAdded": {
        tabState.isOptionsPage = true;
        this.updateOptionsPageData();
        this.sendOptionsMessage({
          type: "StateSync",
          logLevel: log.level,
          options: this.options,
        });
        const perf = Object.fromEntries(
          Array.from(this.tabState, ([tabId, tabState2]) => [
            tabId.toString(),
            tabState2.perf,
          ])
        );
        this.sendOptionsMessage({ type: "PerfUpdate", perf });
        break;
      }

      case "SaveOptions":
        await this.saveOptions(message.partialOptions);
        this.updateTabsAfterOptionsChange();
        break;

      case "ResetOptions":
        await this.resetOptions();
        this.updateTabsAfterOptionsChange();
        break;

      case "ResetPerf":
        for (const tabState2 of this.tabState.values()) {
          tabState2.perf = [];
        }
        if (!PROD) {
          await browser.storage.local.remove("perf");
        }
        break;

      case "ToggleKeyboardCapture":
        tabState.keyboardMode = message.capture
          ? { type: "Capture" }
          : { type: "FromHintsState" };
        this.sendWorkerMessage(this.makeWorkerState(tabState), {
          tabId: info.tabId,
          frameId: "all_frames",
        });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onKeyboardShortcut(
    action: KeyboardAction,
    info: MessageInfo,
    timestamp: number
  ) {
    const enterHintsMode = (mode: HintsMode) => {
      this.enterHintsMode({
        tabId: info.tabId,
        timestamp,
        mode,
      });
    };

    switch (action) {
      case "EnterHintsMode_Click":
        enterHintsMode("Click");
        break;

      case "EnterHintsMode_BackgroundTab":
        enterHintsMode("BackgroundTab");
        break;

      case "EnterHintsMode_ForegroundTab":
        enterHintsMode("ForegroundTab");
        break;

      case "EnterHintsMode_ManyClick":
        enterHintsMode("ManyClick");
        break;

      case "EnterHintsMode_ManyTab":
        enterHintsMode("ManyTab");
        break;

      case "EnterHintsMode_Select":
        enterHintsMode("Select");
        break;

      case "ExitHintsMode":
        this.exitHintsMode({ tabId: info.tabId });
        break;

      case "RotateHintsForward":
        this.sendRendererMessage(
          {
            type: "RotateHints",
            forward: true,
          },
          { tabId: info.tabId }
        );
        break;

      case "RotateHintsBackward":
        this.sendRendererMessage(
          {
            type: "RotateHints",
            forward: false,
          },
          { tabId: info.tabId }
        );
        break;

      case "RefreshHints": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null) {
          return;
        }

        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }

        // Refresh `oneTimeWindowMessageToken`.
        this.sendWorkerMessage(this.makeWorkerState(tabState), {
          tabId: info.tabId,
          frameId: "all_frames",
        });

        enterHintsMode(hintsState.mode);
        break;
      }

      case "TogglePeek": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null) {
          return;
        }

        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }

        this.sendRendererMessage(
          hintsState.peeking ? { type: "Unpeek" } : { type: "Peek" },
          { tabId: info.tabId }
        );

        hintsState.peeking = !hintsState.peeking;
        break;
      }

      case "Escape":
        this.exitHintsMode({ tabId: info.tabId });
        this.sendWorkerMessage(
          { type: "Escape" },
          { tabId: info.tabId, frameId: "all_frames" }
        );
        break;

      case "ActivateHint":
        this.handleHintInput(info.tabId, timestamp, {
          type: "ActivateHint",
          alt: false,
        });
        break;

      case "ActivateHintAlt":
        this.handleHintInput(info.tabId, timestamp, {
          type: "ActivateHint",
          alt: true,
        });
        break;

      case "Backspace":
        this.handleHintInput(info.tabId, timestamp, { type: "Backspace" });
        break;

      case "ReverseSelection":
        this.sendWorkerMessage(
          { type: "ReverseSelection" },
          { tabId: info.tabId, frameId: "all_frames" }
        );
        break;

      default:
        unreachable(action);
    }
  }

  enterHintsMode({
    tabId,
    timestamp,
    mode,
  }: {
    tabId: number,
    timestamp: number,
    mode: HintsMode,
  }) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const time = new TimeTracker();
    time.start("collect");

    this.sendWorkerMessage(
      {
        type: "StartFindElements",
        types: getElementTypes(mode),
      },
      {
        tabId,
        frameId: TOP_FRAME_ID,
      }
    );

    const refreshing = tabState.hintsState.type !== "Idle";

    tabState.hintsState = {
      type: "Collecting",
      mode,
      pendingElements: ({
        pendingFrames: {
          answering: 0,
          collecting: 1, // The top frame is collecting.
          lastStartWaitTimestamp: Date.now(),
        },
        elements: [],
      }: PendingElements),
      startTime: timestamp,
      time,
      stats: [],
      refreshing,
      highlighted: tabState.hintsState.highlighted,
    };

    this.updateBadge(tabId);
    this.setTimeout(tabId, t.BADGE_COLLECTING_DELAY.value);
  }

  exitHintsMode({
    tabId,
    delayed = false,
    sendMessages = true,
  }: {
    tabId: number,
    delayed?: boolean,
    sendMessages?: boolean,
  }) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    if (sendMessages) {
      if (delayed) {
        this.setTimeout(tabId, t.MATCH_HIGHLIGHT_DURATION.value);
      } else {
        this.sendRendererMessage({ type: "Unrender" }, { tabId });
      }
    }

    tabState.hintsState = {
      type: "Idle",
      highlighted: tabState.hintsState.highlighted,
    };

    if (sendMessages) {
      this.sendWorkerMessage(this.makeWorkerState(tabState), {
        tabId,
        frameId: "all_frames",
      });
    }

    this.updateBadge(tabId);
  }

  unhighlightHints(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;

    const now = Date.now();
    const [doneWaiting, stillWaiting] = partition(
      hintsState.highlighted,
      ({ sinceTimestamp }) =>
        now - sinceTimestamp >= t.MATCH_HIGHLIGHT_DURATION.value
    );

    const hideDoneWaiting = () => {
      if (doneWaiting.length > 0) {
        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates: doneWaiting
              // Highlighted elements with -1 as index don’t have their own DOM
              // nodes – instead, they have highlighted a new hint with the same
              // characters and position.
              .filter(({ element }) => element.index !== -1)
              .map(({ element }) => ({
                type: "Hide",
                index: element.index,
                hidden: true,
              })),
            enteredText: "",
          },
          { tabId }
        );
      }
    };

    hintsState.highlighted = stillWaiting;

    switch (hintsState.type) {
      case "Idle":
        if (stillWaiting.length === 0) {
          this.sendRendererMessage({ type: "Unrender" }, { tabId });
        } else {
          hideDoneWaiting();
        }
        break;

      case "Collecting":
        hideDoneWaiting();
        break;

      case "Hinting": {
        hideDoneWaiting();
        this.refreshHintsRendering(tabId);
        break;
      }

      default:
        unreachable(hintsState.type, hintsState);
    }
  }

  stopPreventOvertyping(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { keyboardMode } = tabState;
    if (
      keyboardMode.type === "PreventOverTyping" &&
      Date.now() - keyboardMode.sinceTimestamp >=
        this.options.values.overTypingDuration
    ) {
      tabState.keyboardMode = { type: "FromHintsState" };
      this.sendWorkerMessage(this.makeWorkerState(tabState), {
        tabId,
        frameId: "all_frames",
      });
    }
  }

  onTabCreated(tab: Tab) {
    this.updateIcon(tab.id);
  }

  onTabActivated() {
    this.updateOptionsPageData();
  }

  onTabUpdated(tabId: number, changeInfo: TabChangeInfo) {
    if (changeInfo.status != null) {
      this.updateIcon(tabId);
    }

    const tabState = this.tabState.get(tabId);
    if (tabState != null && changeInfo.status === "loading") {
      tabState.isOptionsPage = false;
      this.updateOptionsPageData();
    }

    if (tabState != null && changeInfo.pinned != null) {
      tabState.isPinned = changeInfo.pinned;
      this.sendWorkerMessage(this.makeWorkerState(tabState), {
        tabId,
        frameId: "all_frames",
      });
    }
  }

  onTabRemoved(tabId: number) {
    this.deleteTabState(tabId);
  }

  deleteTabState(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    this.tabState.delete(tabId);

    if (!tabState.isOptionsPage) {
      this.sendOptionsMessage({
        type: "PerfUpdate",
        perf: { [tabId]: [] },
      });
    }

    this.updateOptionsPageData();
  }

  async updateIcon(tabId: number) {
    // In Chrome the below check fails for the extension options page, so check
    // for the options page explicitly.
    const tabState = this.tabState.get(tabId);
    let enabled = tabState != null ? tabState.isOptionsPage : false;

    // Check if we’re allowed to execute content scripts on this page.
    if (!enabled) {
      try {
        await browser.tabs.executeScript(tabId, {
          code: "",
          runAt: "document_start",
        });
        enabled = true;
      } catch {
        enabled = false;
      }
    }

    const type: IconType = enabled ? "normal" : "disabled";
    const icons = getIcons(type);
    log("log", "BackgroundProgram#updateIcon", tabId, type);
    await browser.browserAction.setIcon({ path: icons, tabId });
  }

  updateBadge(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    const { hintsState } = tabState;

    browser.browserAction.setBadgeText({
      text: getBadgeText(hintsState),
      tabId,
    });
  }

  async updateOptions({ isInitial = false }: { isInitial?: boolean } = {}) {
    if (!PROD) {
      if (isInitial) {
        const defaultStorageSync = DEFAULT_STORAGE_SYNC;
        if (
          typeof defaultStorageSync === "object" &&
          defaultStorageSync != null
        ) {
          await browser.storage.sync.clear();
          await browser.storage.sync.set(defaultStorageSync);
        }
      }
    }

    const info = await browser.runtime.getPlatformInfo();
    const mac = info.os === "mac";
    const defaults = getDefaults({ mac });
    const rawOptions = await getRawOptions();
    const defaulted = { ...flattenOptions(defaults), ...rawOptions };
    const unflattened = unflattenOptions(defaulted);
    const decoder = makeOptionsDecoder(defaults);
    const decodeErrors: Array<string> = [];
    const options: Options = decoder(unflattened, decodeErrors);

    log("log", "BackgroundProgram#updateOptions", {
      defaults,
      rawOptions,
      defaulted,
      unflattened,
      options,
      decodeErrors,
    });

    this.options = {
      values: options,
      defaults,
      raw: rawOptions,
      errors: decodeErrors,
      mac,
    };

    log.level = options.logLevel;
  }

  async saveOptions(partialOptions: PartialOptions) {
    // The options are stored flattened to increase the chance of the browser
    // sync not overwriting things when options has changed from multiple
    // places. This means we have to retrieve the whole storage, unflatten it,
    // merge in the `partialOptions`, flatten that and finally store it. Just
    // flattening `partialOptions` and storing that would mean that you couldn't
    // remove any `options.keys`, for example.
    try {
      const rawOptions = await getRawOptions();
      const { keysToRemove, optionsToSet } = diffOptions(
        flattenOptions(this.options.defaults),
        flattenOptions({ ...this.options.values, ...partialOptions }),
        rawOptions
      );
      log("log", "BackgroundProgram#saveOptions", {
        partialOptions,
        keysToRemove,
        optionsToSet,
      });
      await browser.storage.sync.remove(keysToRemove);
      await browser.storage.sync.set(optionsToSet);
      await this.updateOptions();
    } catch (error) {
      this.options.errors = [error.message];
    }
  }

  async resetOptions() {
    try {
      await browser.storage.sync.clear();
      await this.updateOptions();
    } catch (error) {
      this.options.errors = [error.message];
    }
  }

  updateTabsAfterOptionsChange() {
    this.sendOptionsMessage({
      type: "StateSync",
      logLevel: log.level,
      options: this.options,
    });
    for (const tabId of this.tabState.keys()) {
      // This also does a "StateSync" for all workers.
      this.exitHintsMode({ tabId });
      this.sendRendererMessage(
        {
          type: "StateSync",
          css: this.options.values.css,
          logLevel: log.level,
        },
        { tabId }
      );
    }
  }

  makeWorkerState(
    tabState: TabState,
    { refreshToken = true }: { refreshToken?: boolean } = {}
  ): ToWorker {
    const { hintsState } = tabState;

    if (refreshToken) {
      this.oneTimeWindowMessageToken = makeRandomToken();
    }

    const common = {
      logLevel: log.level,
      keyTranslations: this.options.values.useKeyTranslations
        ? this.options.values.keyTranslations
        : {},
      oneTimeWindowMessageToken: this.oneTimeWindowMessageToken,
      mac: this.options.mac,
      isPinned: tabState.isPinned,
    };

    const getKeyboardShortcuts = (shortcuts) =>
      tabState.keyboardMode.type === "PreventOverTyping"
        ? shortcuts.filter((shortcut) =>
            PREVENT_OVERTYPING_ALLOWED_KEYBOARD_ACTIONS.has(shortcut.action)
          )
        : shortcuts;

    const getKeyboardMode = (mode) =>
      tabState.keyboardMode.type === "FromHintsState"
        ? mode
        : tabState.keyboardMode.type;

    return hintsState.type === "Hinting"
      ? {
          type: "StateSync",
          clearElements: false,
          keyboardShortcuts: getKeyboardShortcuts(
            this.options.values.hintsKeyboardShortcuts
          ),
          keyboardMode: getKeyboardMode("Hints"),
          ...common,
        }
      : {
          type: "StateSync",
          clearElements: true,
          keyboardShortcuts: getKeyboardShortcuts(
            this.options.values.normalKeyboardShortcuts
          ),
          keyboardMode: getKeyboardMode("Normal"),
          ...common,
        };
  }

  // Send a "StateSync" message to WorkerProgram. If a hint was auto-activated
  // by text filtering, prevent “over-typing” (continued typing after the hint
  // got matched, before realizing it got matched) by temporarily removing all
  // keyboard shortcuts and suppressing all key presses for a short time.
  updateWorkerStateAfterHintActivation({
    tabId,
    preventOverTyping,
  }: {
    tabId: number,
    preventOverTyping: boolean,
  }) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }

    if (preventOverTyping) {
      tabState.keyboardMode = {
        type: "PreventOverTyping",
        sinceTimestamp: Date.now(),
      };
      this.setTimeout(tabId, this.options.values.overTypingDuration);
    }

    this.sendWorkerMessage(this.makeWorkerState(tabState), {
      tabId,
      frameId: "all_frames",
    });
  }

  async updateOptionsPageData() {
    if (!PROD) {
      const optionsTabState = Array.from(this.tabState).filter(
        ([, tabState]) => tabState.isOptionsPage
      );
      let isActive = false;
      for (const [tabId] of optionsTabState) {
        try {
          const tab = await browser.tabs.get(tabId);
          if (tab.active) {
            isActive = true;
            break;
          }
        } catch {
          // Tab was not found. Try the next one.
        }
      }
      if (optionsTabState.length > 0) {
        browser.storage.local.set({ optionsPage: isActive });
      } else {
        browser.storage.local.remove("optionsPage");
      }
    }
  }

  async maybeOpenTutorial() {
    const { tutorialShown } = await browser.storage.local.get("tutorialShown");
    if (tutorialShown !== true) {
      await browser.tabs.create({
        active: true,
        url: META_TUTORIAL,
      });
      await browser.storage.local.set({ tutorialShown: true });
    }
  }

  async maybeReopenOptions() {
    if (!PROD) {
      const { optionsPage } = await browser.storage.local.get("optionsPage");
      if (typeof optionsPage === "boolean") {
        const isActive = optionsPage;
        const activeTab = await getCurrentTab;
        await browser.runtime.openOptionsPage();
        if (!isActive) {
          await browser.tabs.update(activeTab.id, { active: true });
        }
      }
    }
  }

  async restoreTabsPerf() {
    if (!PROD) {
      try {
        const { perf } = await browser.storage.local.get("perf");
        if (perf != null) {
          this.restoredTabsPerf = decodeTabsPerf(perf);
          log(
            "log",
            "BackgroundProgram#restoreTabsPerf",
            this.restoredTabsPerf
          );
        }
      } catch (error) {
        log(
          "error",
          "BackgroundProgram#restoreTabsPerf",
          "Failed to restore.",
          error
        );
      }
    }
  }
}

async function makeEmptyTabState(tabId: ?number): Promise<TabState> {
  const tab = tabId != null ? await browser.tabs.get(tabId) : undefined;
  return {
    hintsState: {
      type: "Idle",
      highlighted: [],
    },
    keyboardMode: { type: "FromHintsState" },
    perf: [],
    isOptionsPage: false,
    isPinned: tab != null ? tab.pinned : false,
  };
}

const CLICK_TYPES: ElementTypes = [
  "clickable",
  "clickable-event",
  "label",
  "link",
  "scrollable",
  "textarea",
];

const TAB_TYPES: ElementTypes = ["link"];

function getElementTypes(mode: HintsMode): ElementTypes {
  switch (mode) {
    case "Click":
      return CLICK_TYPES;

    case "BackgroundTab":
      return TAB_TYPES;

    case "ForegroundTab":
      return TAB_TYPES;

    case "ManyClick":
      return CLICK_TYPES;

    case "ManyTab":
      return TAB_TYPES;

    case "Select":
      return "selectable";

    default:
      return unreachable(mode);
  }
}

function getCombiningUrl(mode: HintsMode, element: ElementWithHint): ?string {
  switch (mode) {
    case "Click":
      return shouldCombineHintsForClick(element)
        ? element.urlWithTarget
        : undefined;

    case "BackgroundTab":
      return element.url;

    case "ForegroundTab":
      return element.url;

    case "ManyClick":
      return shouldCombineHintsForClick(element)
        ? element.urlWithTarget
        : undefined;

    case "ManyTab":
      return element.url;

    case "Select":
      return undefined;

    default:
      return unreachable(mode);
  }
}

function shouldCombineHintsForClick(element: ElementWithHint): boolean {
  const { url, hasClickListener } = element;
  // The diff expander buttons on GitHub are links to the same fragment
  // identifier. So are Bootstrap carousel next/previous “buttons”. So it’s not
  // safe to combine links with fragment identifiers at all. (They may be
  // powered by delegated event listeners.) I guess they aren’t as common
  // anyway. Also don’t combine if the elements themselves have click listeners.
  // Some sites use `<a>` as buttons with click listeners but still include an
  // href for some reason.
  return url != null && !url.includes("#") && !hasClickListener;
}

function runContentScripts(tabs: Array<Tab>): Promise<Array<Array<mixed>>> {
  const manifest = browser.runtime.getManifest();

  const detailsList = manifest.content_scripts
    .filter((script) => script.matches.includes("<all_urls>"))
    .flatMap((script) =>
      script.js.map((file) => ({
        file,
        allFrames: script.all_frames,
        matchAboutBlank: script.match_about_blank,
        runAt: script.run_at,
      }))
    );

  return Promise.all(
    tabs.flatMap((tab) =>
      detailsList.map(async (details) => {
        try {
          return await browser.tabs.executeScript(tab.id, details);
        } catch {
          // If `executeScript` fails it means that the extension is not
          // allowed to run content scripts in the tab. Example: most
          // `chrome://*` pages. We don’t need to do anything in that case.
          return [];
        }
      })
    )
  );
}

function firefoxWorkaround(tabs: Array<Tab>) {
  for (const tab of tabs) {
    const message: FromBackground = { type: "FirefoxWorkaround" };
    browser.tabs.sendMessage(tab.id, message).catch(() => {
      // If `sendMessage` fails it means that there’s no content script
      // listening in that tab. Example:  `about:` pages (where extensions
      // are not allowed to run content scripts). We don’t need to do
      // anything in that case.
    });
  }
}

async function getCurrentTab(): Promise<Tab> {
  const tabs = await browser.tabs.query({
    active: true,
    windowId: browser.windows.WINDOW_ID_CURRENT,
  });
  if (tabs.length !== 1) {
    throw new Error(
      `getCurrentTab: Got an unexpected amount of tabs: ${tabs.length}`
    );
  }
  return tabs[0];
}

// Open a bunch of tabs, and then focus the first of them.
async function openNewTabs(tabId: number, urls: Array<string>) {
  try {
    const newTabs = await Promise.all(
      urls.map((url) =>
        browser.tabs.create({
          active: urls.length === 1,
          url,
          openerTabId: tabId,
        })
      )
    );
    if (newTabs.length >= 2) {
      await browser.tabs.update(newTabs[0].id, { active: true });
    }
  } catch (error) {
    log("error", "openNewTabs", "Failed to open new tabs:", error, urls);
  }
}

type IconType = "normal" | "disabled";

function getIcons(type: IconType): { [string]: string, ... } {
  const manifest = browser.runtime.getManifest();
  return Object.fromEntries(
    Object.entries(manifest.browser_action.default_icon)
      .map(([key, value]) => {
        if (typeof value === "string") {
          const newValue = value.replace(/(\$)\w+/, `$1${type}`);
          // Default icons are always PNG in development to support Chrome. Switch
          // to SVG in Firefox during development to make it easier to work on the
          // SVG icon source (automatic reloading). This also requires a
          // cache-bust.
          const finalValue =
            !PROD && BROWSER === "firefox"
              ? `${newValue.replace(/png/g, "svg")}?${iconsChecksum}`
              : newValue;
          return [key, finalValue];
        }
        return undefined;
      })
      .filter(Boolean)
  );
}

// Left to right, top to bottom.
function comparePositions(a: HintMeasurements, b: HintMeasurements): number {
  return a.x - b.x || a.y - b.y;
}

function getBadgeText(hintsState: HintsState): string {
  switch (hintsState.type) {
    case "Idle":
      return "";

    case "Collecting":
      // Only show the badge “spinner” if the hints are slow. But show it
      // immediately when refreshing so that one can see it flash in case you
      // get exactly the same hints after refreshing, so that you understand
      // that something happened. It’s also nice to show in "ManyClick" mode.
      return Date.now() - hintsState.startTime >
        t.BADGE_COLLECTING_DELAY.value || hintsState.refreshing
        ? "…"
        : "";

    case "Hinting": {
      const { enteredChars, enteredText } = hintsState;
      const words = splitEnteredText(enteredText);
      return hintsState.elementsWithHints
        .filter(
          (element) =>
            // "Hidden" elements have been removed from the DOM or moved off-screen.
            !element.hidden &&
            matchesText(element.text, words) &&
            element.hint.startsWith(enteredChars)
        )
        .length.toString();
    }

    default:
      return unreachable(hintsState.type, hintsState);
  }
}

class Combined {
  children: Array<ElementWithHint>;
  weight: number;

  constructor(children: Array<ElementWithHint>) {
    this.children = children;
    this.weight = Math.max(...children.map((child) => child.weight));
  }
}

function combineByHref(
  elements: Array<ElementWithHint>,
  mode: HintsMode
): Array<Combined | ElementWithHint> {
  const map: Map<string, Array<ElementWithHint>> = new Map();
  const rest: Array<ElementWithHint> = [];

  for (const element of elements) {
    const url = getCombiningUrl(mode, element);
    if (url != null) {
      const previous = map.get(url);
      if (previous != null) {
        previous.push(element);
      } else {
        map.set(url, [element]);
      }
    } else {
      rest.push(element);
    }
  }

  return Array.from(map.values())
    .map((children) => new Combined(children))
    .concat(rest);
}

function assignHints(
  passedElements: Array<ElementWithHint>,
  {
    mode,
    chars,
    hasEnteredText,
  }: { mode: HintsMode, chars: string, hasEnteredText: boolean }
): Array<ElementWithHint> {
  const largestTextWeight = hasEnteredText
    ? Math.max(1, ...passedElements.map((element) => element.textWeight))
    : 0;

  // Sort the elements so elements with more weight get higher z-index.
  const elements: Array<ElementWithHint> = passedElements
    .map((element) => ({
      ...element,
      // When filtering by text, give better hints to elements with shorter
      // text. The more of the text that is matched, the more likely to be what
      // the user is looking for.
      weight: hasEnteredText
        ? largestTextWeight - element.textWeight + 1
        : element.hintMeasurements.weight,
      // This is set to the real thing below.
      hint: "",
    }))
    .sort(
      (a, b) =>
        // Higher weights first.
        b.weight - a.weight ||
        // If the weights are the same, sort by on-screen position, left to
        // right and then top to bottom (reading order in LTR languages). If you
        // scroll _down_ to a list of same-weight links they usually end up in
        // the order naturally, but if you scroll _up_ to the same list the
        // IntersectionObserver fires in a different order, so it’s important
        // not to rely on that to get consistent hints.
        comparePositions(a.hintMeasurements, b.hintMeasurements) ||
        // `hintsState.elementsWithHints` changes order as
        // `hintsState.enteredText` come and go. Sort on `.index` if all other
        // things are equal, so that elements don’t unexpectedly swap hints after
        // erasing some text chars.
        a.index - b.index
    );

  const combined = combineByHref(elements, mode);

  const tree = huffman.createTree(combined, chars.length, {
    // Even though we sorted `elements` above, `combined` might not be sorted.
    sorted: false,
  });

  tree.assignCodeWords(chars, (item, codeWord) => {
    if (item instanceof Combined) {
      for (const child of item.children) {
        child.hint = codeWord;
      }
    } else {
      item.hint = codeWord;
    }
  });

  return elements;
}

function makeMessageInfo(sender: MessageSender): ?MessageInfo {
  return sender.tab != null && sender.frameId != null
    ? { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url }
    : undefined;
}

function updateChars(chars: string, input: HintInput): string {
  switch (input.type) {
    case "Input": {
      const key = input.keypress.printableKey;
      return key != null ? `${chars}${key}` : chars;
    }
    case "ActivateHint":
      return chars;
    case "Backspace":
      return chars.slice(0, -1);
    default:
      return unreachable(input.type, input);
  }
}

function updateHints({
  mode,
  enteredChars,
  enteredText,
  elementsWithHints: passedElementsWithHints,
  highlighted,
  chars,
  autoActivate: autoActivateOption,
  matchHighlighted,
  updateMeasurements,
}: {
  mode: HintsMode,
  enteredChars: string,
  enteredText: string,
  elementsWithHints: Array<ElementWithHint>,
  highlighted: Highlighted,
  chars: string,
  autoActivate: boolean,
  matchHighlighted: boolean,
  updateMeasurements: boolean,
}): {
  elementsWithHints: Array<ElementWithHint>,
  allElementsWithHints: Array<ElementWithHint>,
  match: ?{ elementWithHint: ElementWithHint, autoActivated: boolean },
  updates: Array<HintUpdate>,
  words: Array<string>,
} {
  const hasEnteredText = enteredText !== "";
  const hasEnteredTextOnly = hasEnteredText && enteredChars === "";
  const words = splitEnteredText(enteredText);

  // Filter away elements/hints not matching by text.
  const [matching, nonMatching] = partition(
    passedElementsWithHints,
    (element) => matchesText(element.text, words)
  );

  // Update the hints after the above filtering.
  const elementsWithHintsAndMaybeHidden = assignHints(matching, {
    mode,
    chars,
    hasEnteredText,
  });

  // Filter away elements that have become hidden _after_ assigning hints, so
  // that the hints stay the same.
  const elementsWithHints = elementsWithHintsAndMaybeHidden.filter(
    (element) => !element.hidden
  );

  // Find which hints to highlight (if any), and which to activate (if
  // any). This depends on whether only text chars have been entered, if
  // auto activation is enabled, if the Enter key is pressed and if hint
  // chars have been entered.
  const allHints = elementsWithHints
    .map((element) => element.hint)
    .filter((hint) => hint.startsWith(enteredChars));
  const matchingHints = allHints.filter((hint) => hint === enteredChars);
  const autoActivate = hasEnteredTextOnly && autoActivateOption;
  const matchingHintsSet = autoActivate
    ? new Set(allHints)
    : new Set(matchingHints);
  const matchedHint =
    matchingHintsSet.size === 1 ? Array.from(matchingHintsSet)[0] : undefined;
  const highlightedHint = hasEnteredText ? allHints[0] : undefined;
  const match = elementsWithHints.find(
    (element) =>
      element.hint === matchedHint ||
      (matchHighlighted && element.hint === highlightedHint)
  );

  const highlightedKeys = new Set(
    highlighted.map(({ element }) => elementKey(element))
  );

  const updates: Array<HintUpdate> = elementsWithHintsAndMaybeHidden
    .map((element, index) => {
      const matches = element.hint.startsWith(enteredChars);
      const isHighlighted =
        (match != null && element.hint === match.hint) ||
        element.hint === highlightedHint ||
        highlightedKeys.has(elementKey(element));

      return updateMeasurements
        ? {
            // Update the position of the hint.
            type: "UpdatePosition",
            index: element.index,
            order: index,
            hint: element.hint,
            hintMeasurements: element.hintMeasurements,
            highlighted: isHighlighted,
            hidden: element.hidden || !matches,
          }
        : matches && (match == null || highlighted)
        ? {
            // Update the hint (which can change based on text filtering),
            // which part of the hint has been matched and whether it
            // should be marked as highlighted/matched.
            type: "UpdateContent",
            index: element.index,
            order: index,
            matchedChars: enteredChars,
            restChars: element.hint.slice(enteredChars.length),
            highlighted: isHighlighted,
            hidden: element.hidden || !matches,
          }
        : {
            // Hide hints that don’t match the entered hint chars.
            type: "Hide",
            index: element.index,
            hidden: true,
          };
    })
    .concat(
      nonMatching.map((element) => ({
        // Hide hints for elements filtered by text.
        type: "Hide",
        index: element.index,
        hidden: true,
      }))
    );

  const allElementsWithHints = elementsWithHintsAndMaybeHidden.concat(
    nonMatching
  );

  return {
    elementsWithHints,
    allElementsWithHints,
    match:
      match == null
        ? undefined
        : {
            elementWithHint: match,
            autoActivated: autoActivate,
          },
    updates,
    words,
  };
}

function mergeElements(
  elementsWithHints: Array<ElementWithHint>,
  updates: Array<ElementReport>,
  frameId: number
): Array<ElementWithHint> {
  const updateMap: Map<number, ElementReport> = new Map(
    updates.map((update) => [update.index, update])
  );

  return elementsWithHints.map((element) => {
    if (element.frame.id !== frameId) {
      return element;
    }

    const update = updateMap.get(element.frame.index);

    if (update == null) {
      return { ...element, hidden: true };
    }

    return {
      type: update.type,
      index: element.index,
      hintMeasurements: {
        ...update.hintMeasurements,
        // Keep the original weight so that hints don't change.
        weight: element.hintMeasurements.weight,
      },
      url: update.url,
      urlWithTarget: update.urlWithTarget,
      text: update.text,
      textContent: update.textContent,
      // Keep the original text weight so that hints don't change.
      textWeight: element.textWeight,
      isTextInput: update.isTextInput,
      hasClickListener: update.hasClickListener,
      frame: element.frame,
      hidden: false,
      weight: element.weight,
      hint: element.hint,
    };
  });
}

function matchesText(passedText: string, words: Array<string>): boolean {
  const text = passedText.toLowerCase();
  return words.every((word) => text.includes(word));
}
