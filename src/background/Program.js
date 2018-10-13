// @flow

import huffman from "n-ary-huffman";

import {
  Resets,
  TimeTracker,
  addListener,
  bind,
  log,
  makeRandomToken,
  matchesText,
  partition,
  unreachable,
} from "../shared/main";
import iconsChecksum from "../icons/checksum";
// TODO: Move this type somewhere.
import type {
  ElementReport,
  ElementWithHint,
  ExtendedElementReport,
  FromBackground,
  FromPopup,
  FromRenderer,
  FromWorker,
  HintUpdate,
  HintsState,
  TabState,
  ToBackground,
  ToPopup,
  ToRenderer,
  ToWorker,
  UpdateState,
} from "../data/Messages";
import type { ElementTypes } from "../worker/ElementManager";
import type {
  HintsMode,
  KeyboardAction,
  KeyboardMapping,
  KeyboardShortcut,
} from "../data/KeyboardShortcuts";

type MessageInfo = {|
  tabId: number,
  frameId: number,
  url: ?string,
|};

type Hints = {|
  chars: string,
  autoActivate: boolean,
  timeout: number,
|};

// This is the same color as the pointer in the icon.
const BADGE_COLOR = "#323234";

// As far as I can tell, the top frameId is always 0. This is also mentioned here:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/Tabs/executeScript
// “frameId: Optional integer. The frame where the code should be injected.
// Defaults to 0 (the top-level frame).”
const TOP_FRAME_ID = 0;

// Some onscreen frames may never respond (if the frame 404s or hasn't loaded
// yet), but the parent can't now that. If a frame hasn't reported that it is
// alive after this timeout, ignore it.
const FRAME_REPORT_TIMEOUT = 100; // ms

// Only show the bagde “spinner” if the hints are slow.
const BADGE_COLLECTING_DELAY = 300; // ms

// Roughly how often to update the hints in hints mode. While a lower number
// might yield updates faster, that feels very stuttery. Having a somewhat
// longer interval feels better.
const UPDATE_INTERVAL = 500; // ms
const UPDATE_MIN_TIMEOUT = 100; // ms

const SHOW_TITLE_MODES: Set<HintsMode> = new Set([
  "Click",
  "ManyClick",
  "Select",
]);

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  hints: Hints;
  tabState: Map<number, TabState>;
  oneTimeWindowMessageToken: string;
  resets: Resets;

  constructor({
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
    hints,
  }: {|
    normalKeyboardShortcuts: Array<KeyboardMapping>,
    hintsKeyboardShortcuts: Array<KeyboardMapping>,
    hints: Hints,
  |}) {
    this.normalKeyboardShortcuts = normalKeyboardShortcuts;
    this.hintsKeyboardShortcuts = hintsKeyboardShortcuts;
    this.hints = hints;
    this.tabState = new Map();
    this.oneTimeWindowMessageToken = makeRandomToken();
    this.resets = new Resets();

    bind(this, [
      [this.onKeyboardShortcut, { catch: true }],
      [this.onMessage, { catch: true }],
      [this.onPopupMessage, { log: true, catch: true }],
      [this.onRendererMessage, { log: true, catch: true }],
      [this.onWorkerMessage, { log: true, catch: true }],
      [this.openNewTab, { catch: true }],
      [this.sendBackgroundMessage, { catch: true }],
      [this.sendContentMessage, { catch: true }],
      [this.sendPopupMessage, { log: true, catch: true }],
      [this.sendRendererMessage, { log: true, catch: true }],
      [this.sendWorkerMessage, { log: true, catch: true }],
      [this.start, { catch: true }],
      [this.stop, { log: true, catch: true }],
      [this.updateIcon, { catch: true }],
      this.onConnect,
      this.onTabCreated,
      this.onTabUpdated,
      this.onTabRemoved,
    ]);
  }

  async start(): Promise<void> {
    log("log", "BackgroundProgram#start", BROWSER, PROD);

    const tabs = await browser.tabs.query({});

    this.resets.add(
      addListener(browser.runtime.onMessage, this.onMessage),
      addListener(browser.runtime.onConnect, this.onConnect),
      addListener(browser.tabs.onCreated, this.onTabCreated),
      addListener(
        browser.tabs.onUpdated,
        this.onTabUpdated,
        // Chrome doesn’t support filters.
        BROWSER === "firefox" ? { properties: ["status"] } : undefined
      ),
      addListener(browser.tabs.onRemoved, this.onTabRemoved)
    );

    for (const tab of tabs) {
      this.updateIcon(tab.id);
    }

    browser.browserAction.setBadgeBackgroundColor({ color: BADGE_COLOR });

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
    { tabId, frameId }: {| tabId: number, frameId: number | "all_frames" |}
  ): Promise<void> {
    const tabState = this.tabState.get(tabId);

    if (
      tabState != null &&
      tabState.preventOverTypingTimeoutId != null &&
      message.type === "StateSync"
    ) {
      clearTimeout(tabState.preventOverTypingTimeoutId);
      tabState.preventOverTypingTimeoutId = undefined;
    }

    await this.sendContentMessage(
      { type: "ToWorker", message },
      { tabId, frameId }
    );
  }

  async sendRendererMessage(
    message: ToRenderer,
    { tabId }: {| tabId: number |}
  ): Promise<void> {
    await this.sendContentMessage(
      { type: "ToRenderer", message },
      { tabId, frameId: TOP_FRAME_ID }
    );
  }

  async sendPopupMessage(message: ToPopup): Promise<void> {
    await this.sendBackgroundMessage({ type: "ToPopup", message });
  }

  // This might seem like sending a message to oneself, but
  // `browser.runtime.sendMessage` seems to only send messages to *other*
  // background scripts, such as the popup script.
  async sendBackgroundMessage(message: FromBackground): Promise<void> {
    await browser.runtime.sendMessage(message);
  }

  async sendContentMessage(
    message: FromBackground,
    { tabId, frameId }: {| tabId: number, frameId: number | "all_frames" |}
  ): Promise<void> {
    await (frameId === "all_frames"
      ? browser.tabs.sendMessage(tabId, message)
      : browser.tabs.sendMessage(tabId, message, { frameId }));
  }

  onMessage(message: ToBackground, sender: MessageSender) {
    // `info` can be missing when the message comes from for example the popup
    // (which isn’t associated with a tab). The worker script can even load in
    // an `about:blank` frame somewhere when hovering the browserAction!
    const info = makeMessageInfo(sender);

    const tabStateRaw =
      info == null ? undefined : this.tabState.get(info.tabId);
    const tabState = tabStateRaw == null ? makeEmptyTabState() : tabStateRaw;

    if (info != null && tabStateRaw == null) {
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
          this.makeWorkerState(tabState.hintsState, { refreshToken: false }),
          {
            tabId: info.tabId,
            frameId: info.frameId,
          }
        );
        break;

      case "KeyboardShortcutMatched":
        this.onKeyboardShortcut(message.action, info, message.timestamp);
        break;

      case "NonKeyboardShortcutMatched": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }

        const { key } = message.shortcut;
        const isBackspace = key === "Backspace";
        const isEnter = key === "Enter";

        if (isPeekKey(message.shortcut)) {
          this.sendRendererMessage({ type: "Peek" }, { tabId: info.tabId });
          return;
        }

        // Ignore unknown/non-text keys.
        if (!(isBackspace || isEnter || key.length === 1)) {
          return;
        }

        const isHintKey =
          this.hints.chars.includes(key) ||
          (isBackspace && hintsState.enteredHintChars !== "");

        // Disallow filtering by text after having started entering hint chars.
        if (!isHintKey && hintsState.enteredHintChars !== "") {
          return;
        }

        // Update entered chars (either text chars or hint chars).
        const chars = isHintKey
          ? hintsState.enteredHintChars
          : hintsState.enteredTextChars;
        const newChars = isBackspace
          ? chars.slice(0, -1)
          : isEnter
            ? chars
            : `${chars}${key}`;
        const enteredHintChars = isHintKey
          ? newChars
          : hintsState.enteredHintChars;
        const enteredTextChars = isHintKey
          ? hintsState.enteredTextChars
          : newChars
              .toLowerCase()
              // Trim leading whitespace and allow only one trailing space.
              .replace(/^\s+/, "")
              .replace(/\s+$/, " ");

        const {
          elementsWithHints,
          allElementsWithHints,
          match: actualMatch,
          updates,
          words,
        } = updateHints({
          enteredHintChars,
          enteredTextChars,
          elementsWithHints: hintsState.elementsWithHints,
          hints: this.hints,
          matchHighlighted: isEnter,
          updateMeasurements: false,
        });

        // Disallow matching hints (by text) by backspacing away chars. This can
        // happen if your entered text matches two links and then the link you
        // were after is removed.
        const [match, preventOverTyping] =
          isBackspace || actualMatch == null
            ? [undefined, false]
            : [actualMatch.elementWithHint, actualMatch.autoActivated];

        // If pressing a hint char that is currently unused, ignore it.
        if (enteredHintChars !== "" && updates.every(update => update.hidden)) {
          return;
        }

        hintsState.enteredHintChars = enteredHintChars;
        hintsState.enteredTextChars = enteredTextChars;
        hintsState.elementsWithHints = allElementsWithHints;

        const shouldContinue =
          match == null
            ? true
            : this.handleHintMatch({
                hintsState,
                match,
                info,
                updates,
                preventOverTyping,
                shortcut: message.shortcut,
                timestamp: message.timestamp,
              });

        // Some hint modes handle updating hintsState and sending messages
        // themselves. The rest share the same implementation below.
        if (!shouldContinue) {
          return;
        }

        if (match != null) {
          clearUpdateTimeout(hintsState.updateState);
          tabState.hintsState = { type: "Idle" };
          this.updateWorkerStateAfterHintActivation({
            tabId: info.tabId,
            preventOverTyping,
          });
        }

        if (words.length > 0 && match == null) {
          const indexesByFrame: Map<number, Array<number>> = new Map();
          for (const { frame } of elementsWithHints) {
            const previous = indexesByFrame.get(frame.id);
            if (previous == null) {
              indexesByFrame.set(frame.id, [frame.index]);
            } else {
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
              { tabId: info.tabId, frameId }
            );
          }
        } else {
          this.sendRendererMessage(
            { type: "UnrenderTextRects" },
            { tabId: info.tabId }
          );
        }

        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            enteredTextChars,
          },
          { tabId: info.tabId }
        );

        if (match != null) {
          const { title } = match;
          this.sendRendererMessage(
            {
              type: "Unrender",
              mode:
                SHOW_TITLE_MODES.has(hintsState.mode) && title != null
                  ? { type: "title", title }
                  : { type: "delayed" },
            },
            { tabId: info.tabId }
          );
        }

        this.updateBadge(info.tabId);
        break;
      }

      case "Keyup": {
        if (isPeekKey(message.shortcut)) {
          this.sendRendererMessage({ type: "Unpeek" }, { tabId: info.tabId });
        }
        break;
      }

      case "ReportVisibleFrame": {
        const { hintsState } = tabState;

        if (hintsState.type !== "Collecting") {
          return;
        }

        hintsState.pendingElements.pendingFrames.answering = Math.max(
          0,
          hintsState.pendingElements.pendingFrames.answering - 1
        );

        if (
          hintsState.pendingElements.pendingFrames.answering === 0 &&
          hintsState.timeoutId != null
        ) {
          clearTimeout(hintsState.timeoutId);
          hintsState.timeoutId = undefined;
        }

        hintsState.pendingElements.pendingFrames.collecting += 1;
        break;
      }

      case "ReportVisibleElements": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Collecting") {
          return;
        }

        const elements: Array<ExtendedElementReport> = message.elements.map(
          element => ({
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

        hintsState.pendingElements.pendingFrames.answering += message.numFrames;

        hintsState.pendingElements.pendingFrames.collecting = Math.max(
          0,
          hintsState.pendingElements.pendingFrames.collecting - 1
        );

        hintsState.durations.push({
          url: info.url == null ? "?" : info.url,
          durations: message.durations,
        });

        if (message.numFrames === 0) {
          // If there are no frames, start hinting immediately, unless we're
          // waiting for frames in another frame.
          if (hintsState.timeoutId == null) {
            this.maybeStartHinting(info.tabId);
          }
        } else {
          // If there are frames, wait for them.
          if (hintsState.timeoutId != null) {
            clearTimeout(hintsState.timeoutId);
          }
          hintsState.timeoutId = setTimeout(() => {
            hintsState.timeoutId = undefined;
            this.maybeStartHinting(info.tabId);
          }, FRAME_REPORT_TIMEOUT);
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

        const { enteredHintChars, enteredTextChars } = hintsState;

        const { allElementsWithHints, updates } = updateHints({
          enteredHintChars,
          enteredTextChars,
          elementsWithHints: updatedElementsWithHints,
          hints: this.hints,
          matchHighlighted: false,
          updateMeasurements: true,
        });

        hintsState.elementsWithHints = allElementsWithHints;

        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            enteredTextChars,
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

          const elapsedTime =
            updateState.type === "Waiting"
              ? Date.now() - updateState.startTime
              : undefined;

          const timeout =
            elapsedTime == null
              ? UPDATE_INTERVAL
              : Math.max(0, UPDATE_INTERVAL - elapsedTime);

          clearUpdateTimeout(updateState);

          log("log", "Scheduling next elements update", {
            UPDATE_INTERVAL,
            elapsedTime,
            timeout,
            UPDATE_MIN_TIMEOUT,
          });

          hintsState.updateState = {
            type: "Timeout",
            timeoutId: setTimeout(() => {
              this.updateElements(info.tabId);
            }, Math.max(UPDATE_MIN_TIMEOUT, timeout)),
          };
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

      case "Interaction":
        this.removeTitle(info.tabId);
        break;

      case "ClickedElementRemoved":
        this.removeTitle(info.tabId);
        break;

      // When clicking a link using Synth that causes a page load (no
      // `.preventDefault()`, no internal fragment identifier, no `javascript:`
      // protocol, etc), exit hints mode. This is especially nice for the
      // "ManyClick" mode since it makes the hints go away immediately when
      // clicking the link rather than after a little while when the "pagehide"
      // event has fired.
      case "ClickedLinkNavigatingToOtherPage": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Idle") {
          this.exitHintsMode(info.tabId);
        }
        break;
      }

      case "PageLeave":
        // If the user clicks a link while hints mode is active, exit it.
        // Otherwise you’ll end up in hints mode on the new page (it is still
        // the tab, after all) but with no hints. Also, in Firefox, when
        // clicking the back button the content scripts aren’t re-run but
        // instead pick up from where they where when leaving the page. Exiting
        // hints mode before leaving makes sure that there are no left-over
        // hints shown when navigating back.
        this.exitHintsMode(info.tabId);
        break;

      // If the user used a ctrl or cmd (Windows key) shortcut to switch tabs or
      // windows while in hints mode, the page receives a keydown event but no
      // keyup event (since the modifier key is released in another tab or
      // window). This causes peek mode to be stuck when the user returns. So
      // unpeek if the user leaves the tab. Only the window of the current frame
      // seems to blurred, so we need to listen in all frames. Frames can also
      // be blurred by moving focus to another frame, which causes a false
      // positive but it doesn’t matter.
      case "WindowBlur":
        if (tabState.hintsState.type === "Hinting") {
          this.sendRendererMessage({ type: "Unpeek" }, { tabId: info.tabId });
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  // Executes some action on the element of the matched hint. Returns whether
  // the "NonKeyboardShortcutMatched" handler should continue with its default
  // implementation for updating hintsState and sending messages or not. Some
  // hint modes handle that themselves.
  handleHintMatch({
    hintsState,
    match,
    updates,
    preventOverTyping,
    info,
    shortcut,
    timestamp,
  }: {|
    hintsState: HintsState,
    match: ElementWithHint,
    updates: Array<HintUpdate>,
    preventOverTyping: boolean,
    info: MessageInfo,
    shortcut: KeyboardShortcut,
    timestamp: number,
  |}): boolean {
    if (hintsState.type !== "Hinting") {
      return true;
    }

    const { url, title } = match;

    const mode: HintsMode =
      url != null && shortcut.altKey ? "ForegroundTab" : hintsState.mode;

    switch (mode) {
      case "Click":
        this.clickElement(info.tabId, match);
        return true;

      case "ManyClick":
        if (match.isTextInput) {
          this.clickElement(info.tabId, match);
          return true;
        }

        this.sendWorkerMessage(
          {
            type: "ClickElement",
            index: match.frame.index,
            trackRemoval: false,
          },
          {
            tabId: info.tabId,
            frameId: match.frame.id,
          }
        );
        this.sendRendererMessage(
          { type: "UnrenderTextRects" },
          { tabId: info.tabId }
        );
        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            enteredTextChars: hintsState.enteredTextChars,
          },
          { tabId: info.tabId }
        );
        this.updateWorkerStateAfterHintActivation({
          tabId: info.tabId,
          preventOverTyping,
        });
        this.enterHintsMode({
          tabId: info.tabId,
          timestamp,
          mode: hintsState.mode,
        });
        return false;

      case "ManyTab":
        if (url == null) {
          log(
            "error",
            "Cannot open background tab (many) due to missing URL",
            match
          );
          return true;
        }
        hintsState.enteredHintChars = "";
        hintsState.enteredTextChars = "";
        this.openNewTab({
          url,
          elementIndex: match.frame.index,
          tabId: info.tabId,
          frameId: match.frame.id,
          foreground: false,
        });
        this.sendRendererMessage(
          { type: "UnrenderTextRects" },
          { tabId: info.tabId }
        );
        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates: assignHints(hintsState.elementsWithHints, {
              hintChars: this.hints.chars,
              hasEnteredTextChars: false,
            }).map((element, index) => ({
              type: "UpdateContent",
              index: element.index,
              order: index,
              matchedChars: "",
              restChars: element.hint,
              highlighted: element.index === match.index ? "temporarily" : "no",
              hidden: element.hidden,
            })),
            enteredTextChars: "",
          },
          { tabId: info.tabId }
        );
        this.updateBadge(info.tabId);
        return false;

      case "BackgroundTab":
        if (url == null) {
          log("error", "Cannot open background tab due to missing URL", match);
          return true;
        }
        this.openNewTab({
          url,
          elementIndex: match.frame.index,
          tabId: info.tabId,
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
          tabId: info.tabId,
          frameId: match.frame.id,
          foreground: true,
        });
        return true;

      case "Select": {
        this.sendWorkerMessage(
          {
            type: "SelectElement",
            index: match.frame.index,
            trackRemoval: title != null,
          },
          {
            tabId: info.tabId,
            frameId: match.frame.id,
          }
        );
        if (title != null) {
          this.sendWorkerMessage(
            {
              type: "TrackInteractions",
              track: true,
            },
            {
              tabId: info.tabId,
              frameId: "all_frames",
            }
          );
        }
        return true;
      }

      default:
        unreachable(mode);
        return true;
    }
  }

  removeTitle(tabId: number) {
    this.sendWorkerMessage(
      {
        type: "TrackInteractions",
        track: false,
      },
      {
        tabId,
        frameId: "all_frames",
      }
    );
    this.sendRendererMessage(
      {
        type: "Unrender",
        mode: { type: "immediate" },
      },
      { tabId }
    );
  }

  clickElement(tabId: number, match: ElementWithHint) {
    this.sendWorkerMessage(
      {
        type: "ClickElement",
        index: match.frame.index,
        trackRemoval: match.title != null,
      },
      {
        tabId,
        frameId: match.frame.id,
      }
    );
    if (match.title != null) {
      this.sendWorkerMessage(
        {
          type: "TrackInteractions",
          track: true,
        },
        {
          tabId,
          frameId: "all_frames",
        }
      );
    }
  }

  async openNewTab({
    url,
    elementIndex,
    tabId,
    frameId,
    foreground,
  }: {|
    url: string,
    elementIndex: number,
    tabId: number,
    frameId: number,
    foreground: boolean,
  |}): Promise<void> {
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
    // downside of using the fake ctrl-click method in Chrome.
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

    if (
      hintsState.type !== "Collecting" ||
      hintsState.pendingElements.pendingFrames.collecting > 0
    ) {
      return;
    }

    const { time } = hintsState;
    time.start("assign hints");

    const elementsWithHints = assignHints(
      hintsState.pendingElements.elements.map((element, index) => ({
        ...element,
        // These are filled in by `assignHints` but need to be set here for type
        // checking reasons.
        weight: 0,
        hint: "",
        // This is set for real in the next couple of lines, but set here also
        // to make sorting in Chrome stable. This can be removed when Chrome 70
        // is released (which makes `Array.prototype.sort` stable).
        index,
      })),
      { hintChars: this.hints.chars, hasEnteredTextChars: false }
      // `.index` was set to `-1` in "ReportVisibleElements". Now set it for
      // real to map these elements to DOM elements in RendererProgram.
    ).map((element, index) => ({ ...element, index }));

    tabState.hintsState = {
      type: "Hinting",
      mode: hintsState.mode,
      startTime: hintsState.startTime,
      time,
      durations: hintsState.durations,
      enteredHintChars: "",
      enteredTextChars: "",
      elementsWithHints,
      updateState: {
        type: "Timeout",
        timeoutId: setTimeout(() => {
          this.updateElements(tabId);
        }, UPDATE_INTERVAL),
      },
    };
    this.sendWorkerMessage(this.makeWorkerState(tabState.hintsState), {
      tabId,
      frameId: "all_frames",
    });

    time.start("render");
    this.sendRendererMessage(
      {
        type: "Render",
        elements: elementsWithHints,
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

    clearUpdateTimeout(updateState);

    hintsState.updateState = {
      type: "Waiting",
      startTime: Date.now(),
    };

    // Refresh `oneTimeWindowMessageToken`.
    this.sendWorkerMessage(this.makeWorkerState(hintsState), {
      tabId,
      frameId: "all_frames",
    });

    this.sendWorkerMessage(
      {
        type: "UpdateElements",
        words: splitEnteredTextChars(hintsState.enteredTextChars),
      },
      {
        tabId,
        frameId: TOP_FRAME_ID,
      }
    );
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

    for (const element of hintsState.elementsWithHints) {
      if (element.frame.id === info.frameId) {
        element.hidden = true;
      }
    }

    const { enteredHintChars, enteredTextChars } = hintsState;

    const { allElementsWithHints, updates } = updateHints({
      enteredHintChars,
      enteredTextChars,
      elementsWithHints: hintsState.elementsWithHints,
      hints: this.hints,
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
        enteredTextChars,
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
            logLevel: log.level,
          },
          { tabId: info.tabId }
        );
        break;

      case "Rendered": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Hinting") {
          return;
        }
        const { startTime, time, durations: collectDurations } = hintsState;
        time.stop();
        const { durations, firstPaintTimestamp } = message;
        const timeToFirstPaint = firstPaintTimestamp - startTime;
        tabState.perf = [
          {
            timeToFirstPaint,
            topDurations: time.export(),
            collectDurations,
            renderDurations: durations,
          },
          ...tabState.perf,
        ].slice(0, 10);
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  async onPopupMessage(message: FromPopup): Promise<void> {
    switch (message.type) {
      case "PopupScriptAdded": {
        const tab = await getCurrentTab();
        const tabState = this.tabState.get(tab.id);
        this.sendPopupMessage({
          type: "PopupData",
          logLevel: log.level,
          data:
            tabState == null
              ? undefined
              : {
                  tabId: tab.id,
                  tabState,
                },
        });
        break;
      }

      case "ResetPerf": {
        const tab = await getCurrentTab();
        const tabState = this.tabState.get(tab.id);

        if (tabState == null) {
          return;
        }

        tabState.perf = [];
        this.sendPopupMessage({
          type: "PopupData",
          logLevel: log.level,
          data: {
            tabId: tab.id,
            tabState,
          },
        });
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  onKeyboardShortcut(
    action: KeyboardAction,
    info: MessageInfo,
    timestamp: number
  ) {
    switch (action.type) {
      case "EnterHintsMode": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null || tabState.hintsState.type !== "Idle") {
          return;
        }
        this.enterHintsMode({
          tabId: info.tabId,
          timestamp,
          mode: action.mode,
        });
        break;
      }

      case "ExitHintsMode": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null || tabState.hintsState.type !== "Hinting") {
          return;
        }
        this.exitHintsMode(info.tabId);
        break;
      }

      case "RotateHints": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null || tabState.hintsState.type !== "Hinting") {
          return;
        }
        this.sendRendererMessage(
          {
            type: "RotateHints",
            forward: action.forward,
          },
          { tabId: info.tabId }
        );
        break;
      }

      case "RefreshHints": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null || tabState.hintsState.type !== "Hinting") {
          return;
        }
        this.enterHintsMode({
          tabId: info.tabId,
          timestamp,
          mode: tabState.hintsState.mode,
        });
        // `this.enterHintsMode` also updates the badge, but after a timeout.
        // Update it immediately so that one can see it flash in case you get
        // exactly the same hints after refreshing, so that you understand that
        // something happened.
        this.updateBadge(info.tabId);
        break;
      }

      case "Escape": {
        this.exitHintsMode(info.tabId);
        this.sendWorkerMessage(
          { type: "Escape" },
          { tabId: info.tabId, frameId: "all_frames" }
        );
        break;
      }

      case "ReverseSelection":
        this.sendWorkerMessage(
          { type: "ReverseSelection" },
          { tabId: info.tabId, frameId: "all_frames" }
        );
        break;

      default:
        unreachable(action.type, action);
    }
  }

  enterHintsMode({
    tabId,
    timestamp,
    mode,
  }: {|
    tabId: number,
    timestamp: number,
    mode: HintsMode,
  |}) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }
    const time = new TimeTracker();
    time.start("collect");
    this.sendWorkerMessage(
      {
        type: "StartFindElements",
        types: getHintsTypes(mode),
      },
      {
        tabId,
        frameId: TOP_FRAME_ID,
      }
    );
    if (tabState.hintsState.type === "Hinting") {
      clearUpdateTimeout(tabState.hintsState.updateState);
    }
    tabState.hintsState = {
      type: "Collecting",
      mode,
      pendingElements: {
        pendingFrames: {
          answering: 0,
          collecting: 0,
        },
        elements: [],
      },
      startTime: timestamp,
      time,
      durations: [],
      timeoutId: undefined,
    };
    setTimeout(() => {
      this.updateBadge(tabId);
    }, BADGE_COLLECTING_DELAY);
  }

  exitHintsMode(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
    }
    if (tabState.hintsState.type === "Hinting") {
      clearUpdateTimeout(tabState.hintsState.updateState);
    }
    tabState.hintsState = { type: "Idle" };
    this.sendWorkerMessage(this.makeWorkerState(tabState.hintsState), {
      tabId,
      frameId: "all_frames",
    });
    this.sendRendererMessage(
      {
        type: "Unrender",
        mode: { type: "immediate" },
      },
      { tabId }
    );
    this.updateBadge(tabId);
  }

  onTabCreated(tab: Tab) {
    this.updateIcon(tab.id);
  }

  onTabUpdated(tabId: number, changeInfo: TabChangeInfo) {
    if (changeInfo.status != null) {
      this.updateIcon(tabId);
    }
  }

  onTabRemoved(tabId: number) {
    this.tabState.delete(tabId);
  }

  async updateIcon(tabId: number): Promise<void> {
    let enabled = true;

    // Check if we’re allowed to execute content scripts on this page.
    try {
      await browser.tabs.executeScript(tabId, {
        code: "",
        runAt: "document_start",
      });
    } catch (_error) {
      enabled = false;
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

  makeWorkerState(
    hintsState: HintsState,
    {
      refreshToken = true,
      preventOverTyping = false,
    }: {| refreshToken?: boolean, preventOverTyping?: boolean |} = {}
  ): ToWorker {
    if (refreshToken) {
      this.oneTimeWindowMessageToken = makeRandomToken();
    }

    if (hintsState.type === "Hinting") {
      return {
        type: "StateSync",
        logLevel: log.level,
        clearElements: false,
        keyboardShortcuts: preventOverTyping ? [] : this.hintsKeyboardShortcuts,
        keyboardMode: preventOverTyping ? "PreventOverTyping" : "Hints",
        oneTimeWindowMessageToken: this.oneTimeWindowMessageToken,
      };
    }

    return {
      type: "StateSync",
      logLevel: log.level,
      clearElements: true,
      keyboardShortcuts: preventOverTyping ? [] : this.normalKeyboardShortcuts,
      keyboardMode: preventOverTyping ? "PreventOverTyping" : "Normal",
      oneTimeWindowMessageToken: this.oneTimeWindowMessageToken,
    };
  }

  // Send a "StateSync" message to WorkerProgram. If a hint was auto-activated
  // by text filtering, prevent “over-typing” (continued typing after the hint
  // got matched, before realizing it got matched) by temporarily removing all
  // keyboard shortcuts and suppressing all key presses for a short time.
  updateWorkerStateAfterHintActivation({
    tabId,
    preventOverTyping,
  }: {|
    tabId: number,
    preventOverTyping: boolean,
  |}) {
    const tabState = this.tabState.get(tabId);

    if (tabState == null) {
      return;
    }

    this.sendWorkerMessage(
      this.makeWorkerState(tabState.hintsState, { preventOverTyping }),
      {
        tabId,
        frameId: "all_frames",
      }
    );

    if (preventOverTyping) {
      if (tabState.preventOverTypingTimeoutId != null) {
        clearTimeout(tabState.preventOverTypingTimeoutId);
      }

      tabState.preventOverTypingTimeoutId = setTimeout(() => {
        tabState.preventOverTypingTimeoutId = undefined;

        // The tab might have been closed during the timeout.
        const newTabState = this.tabState.get(tabId);

        if (newTabState == null) {
          return;
        }

        this.sendWorkerMessage(this.makeWorkerState(newTabState.hintsState), {
          tabId,
          frameId: "all_frames",
        });
      }, this.hints.timeout);
    }
  }
}

// This is a function (not a constant), because of mutation.
function makeEmptyTabState(): TabState {
  return {
    hintsState: { type: "Idle" },
    preventOverTypingTimeoutId: undefined,
    perf: [],
  };
}

const CLICK_TYPES: ElementTypes = [
  "clickable",
  "clickable-event",
  "label",
  "link",
  "scrollable",
  "textarea",
  "title",
];

const TAB_TYPES: ElementTypes = ["link"];

function getHintsTypes(mode: HintsMode): ElementTypes {
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

function runContentScripts(tabs: Array<Tab>): Promise<Array<Array<any>>> {
  const manifest = browser.runtime.getManifest();

  const detailsList = [].concat(
    ...manifest.content_scripts
      .filter(script => script.matches.includes("<all_urls>"))
      .map(script =>
        script.js.map(file => ({
          file,
          allFrames: script.all_frames,
          matchAboutBlank: script.match_about_blank,
          runAt: script.run_at,
        }))
      )
  );

  return Promise.all(
    [].concat(
      ...tabs.map(tab =>
        detailsList.map(async details => {
          try {
            return await browser.tabs.executeScript(tab.id, details);
          } catch (_error) {
            // If `executeScript` fails it means that the extension is not
            // allowed to run content scripts in the tab. Example: most
            // `chrome://*` pages. We don’t need to do anything in that case.
            return [];
          }
        })
      )
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
  const tabs = await browser.tabs.query({ active: true });
  if (tabs.length !== 1) {
    throw new Error(
      `getCurrentTab: Got an unexpected amount of tabs: ${tabs.length}`
    );
  }
  return tabs[0];
}

type IconType = "normal" | "disabled";

function getIcons(type: IconType): { [string]: string } {
  const manifest = browser.runtime.getManifest();
  return Object.entries(manifest.browser_action.default_icon).reduce(
    (result, [key, value]) => {
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
        result[key] = finalValue;
      }
      return result;
    },
    {}
  );
}

// If there are a bunch boxes next to each other with seemingly the same size
// (and no other clickable elements around) the first box should get the first
// hint chars as a hint, the second should get the second hint char, and so on.
// However, the sizes of the boxes can differ ever so slightly (usually by less
// than 1px). If two elements have too little difference in size for a human to
// detect, consider their areas equal. These tiny size differences seem to
// result in weights that differ by less than 0.1.
const MIN_WEIGHT_DIFF = 0.1;

function compareWeights<T: { weight: number }>(a: T, b: T): number {
  const diff = a.weight - b.weight;
  if (a instanceof huffman.BranchPoint || b instanceof huffman.BranchPoint) {
    return diff;
  }
  if (diff <= -MIN_WEIGHT_DIFF) {
    return -1;
  }
  if (diff >= MIN_WEIGHT_DIFF) {
    return +1;
  }

  return 0;
}

function getBadgeText(hintsState: HintsState): string {
  switch (hintsState.type) {
    case "Idle":
      return "";
    case "Collecting":
      return "…";
    case "Hinting":
      return String(
        hintsState.elementsWithHints.filter(
          // "Hidden" elements have been removed from the DOM or moved
          // off-screen. Elements with blank hints don't are filtered out by
          // text.
          element => !element.hidden && element.hint !== ""
        ).length
      );
    default:
      return unreachable(hintsState.type);
  }
}

class Combined {
  children: Array<ElementWithHint>;
  weight: number;

  constructor(children: Array<ElementWithHint>) {
    this.children = children;
    this.weight = Math.max(...children.map(child => child.weight));
  }
}

function combineByHref(
  elements: Array<ElementWithHint>
): Array<Combined | ElementWithHint> {
  const map: Map<string, Array<ElementWithHint>> = new Map();
  const rest: Array<ElementWithHint> = [];

  for (const element of elements) {
    const { url } = element;
    // The diff expander buttons on GitHub are links to the same fragment
    // identifier. So are Bootstrap carousel next/previous “buttons”. So it’s
    // not safe to combine links with fragment identifiers at all. I guess they
    // aren’t as common anyway.
    if (url != null && !url.includes("#")) {
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
    .map(children => new Combined(children))
    .concat(rest);
}

function assignHints(
  passedElements: Array<ElementWithHint>,
  {
    hintChars,
    hasEnteredTextChars,
  }: {| hintChars: string, hasEnteredTextChars: boolean |}
): Array<ElementWithHint> {
  const largestTextWeight = hasEnteredTextChars
    ? Math.max(1, ...passedElements.map(element => element.textWeight))
    : 0;

  // Sort the elements so elements with more weight get higher z-index.
  const elements: Array<ElementWithHint> = passedElements
    .map(element => ({
      ...element,
      // When filtering by text, give better hints to elements with shorter
      // text. The more of the text that is matched, the more likely to be what
      // the user is looking for.
      weight: hasEnteredTextChars
        ? largestTextWeight - element.textWeight + 1
        : element.hintMeasurements.weight,
      // This is set to the real thing below.
      hint: "",
    }))
    // `hintsState.elementsWithHints` changes order as
    // `hintsState.enteredTextChars` come and go. Sort on `.index` if weights
    // are equal, so that elements don’t unexpectedly swap hints after erasing
    // some text chars.
    .sort((a, b) => compareWeights(b, a) || a.index - b.index);

  const combined = combineByHref(elements);

  const tree = huffman.createTree(combined, hintChars.length, {
    // Even though we sorted `elements` above, `combined` might not be sorted.
    sorted: false,
    compare: compareWeights,
  });

  tree.assignCodeWords(hintChars, (item, codeWord) => {
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

function isPeekKey(shortcut: KeyboardShortcut): boolean {
  return (
    shortcut.key === "Control" ||
    shortcut.key === "Meta" ||
    // Firefox's name for Meta: <bugzil.la/1232918>
    shortcut.key === "OS"
  );
}

function makeMessageInfo(sender: MessageSender): ?MessageInfo {
  return sender.tab != null && sender.frameId != null
    ? { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url }
    : undefined;
}

function updateHints({
  enteredHintChars,
  enteredTextChars,
  elementsWithHints: passedElementsWithHints,
  hints,
  matchHighlighted,
  updateMeasurements,
}: {|
  enteredHintChars: string,
  enteredTextChars: string,
  elementsWithHints: Array<ElementWithHint>,
  hints: Hints,
  matchHighlighted: boolean,
  updateMeasurements: boolean,
|}): {|
  elementsWithHints: Array<ElementWithHint>,
  allElementsWithHints: Array<ElementWithHint>,
  match: ?{| elementWithHint: ElementWithHint, autoActivated: boolean |},
  updates: Array<HintUpdate>,
  words: Array<string>,
|} {
  const hasEnteredTextChars = enteredTextChars !== "";
  const hasEnteredTextCharsOnly =
    hasEnteredTextChars && enteredHintChars === "";
  const words = splitEnteredTextChars(enteredTextChars);

  // Filter away elements/hints not matching by text.
  const [matching, nonMatching] = partition(passedElementsWithHints, element =>
    matchesText(element.text, words)
  );

  // Update the hints after the above filtering.
  const elementsWithHintsAndMaybeHidden = assignHints(matching, {
    hintChars: hints.chars,
    hasEnteredTextChars,
  });

  // Filter away elements that have become hidden _after_ assigning hints, so
  // that the hints stay the same.
  const elementsWithHints = elementsWithHintsAndMaybeHidden.filter(
    element => !element.hidden
  );

  // Find which hints to highlight (if any), and which to activate (if
  // any). This depends on whether only text chars have been enterd, if
  // auto activation is enabled, if the Enter key is pressed and if hint
  // chars have been entered.
  const allHints = elementsWithHints.map(element => element.hint);
  const matchingHints = allHints.filter(hint => hint === enteredHintChars);
  const autoActivate = hasEnteredTextCharsOnly && hints.autoActivate;
  const matchingHintsSet = autoActivate
    ? new Set(allHints)
    : new Set(matchingHints);
  const matchedHint =
    matchingHintsSet.size === 1 ? Array.from(matchingHintsSet)[0] : undefined;
  const highlightedHint = hasEnteredTextCharsOnly ? allHints[0] : undefined;
  const match = elementsWithHints.find(
    element =>
      element.hint === matchedHint ||
      (matchHighlighted && element.hint === highlightedHint)
  );

  const updates: Array<HintUpdate> = elementsWithHintsAndMaybeHidden
    .map((element, index) => {
      const matches = element.hint.startsWith(enteredHintChars);
      const highlighted =
        match != null || element.hint === highlightedHint ? "yes" : "no";

      return updateMeasurements
        ? {
            // Update the position of the hint.
            type: "UpdatePosition",
            index: element.index,
            order: index,
            hint: element.hint,
            hintMeasurements: element.hintMeasurements,
            highlighted,
            hidden: element.hidden || !matches,
          }
        : matches
          ? {
              // Update the hint (which can change based on text filtering),
              // which part of the hint has been matched and whether it
              // should be marked as highlighted/matched.
              type: "UpdateContent",
              index: element.index,
              order: index,
              matchedChars: enteredHintChars,
              restChars: element.hint.slice(enteredHintChars.length),
              highlighted,
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
      nonMatching.map(element => ({
        // Hide hints for elements filtered by text.
        type: "Hide",
        index: element.index,
        hidden: true,
      }))
    );

  // Blank out the hint for the elements filtered by text. The badge count
  // only includes non-empty hints.
  const allElementsWithHints = elementsWithHintsAndMaybeHidden.concat(
    nonMatching.map(element => ({ ...element, hint: "" }))
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
    updates.map(update => [update.index, update])
  );

  return elementsWithHints.map(element => {
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
      title: update.title,
      text: update.text,
      // Keep the original text weight so that hints don't change.
      textWeight: element.textWeight,
      isTextInput: update.isTextInput,
      frame: element.frame,
      hidden: false,
      weight: element.weight,
      hint: element.hint,
    };
  });
}

function splitEnteredTextChars(enteredTextChars: string): Array<string> {
  return enteredTextChars.split(" ").filter(word => word !== "");
}

function clearUpdateTimeout(updateState: UpdateState) {
  if (updateState.type === "Timeout") {
    clearTimeout(updateState.timeoutId);
  }
}
