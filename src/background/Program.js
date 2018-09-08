// @flow

import huffman from "n-ary-huffman";

import {
  Resets,
  addListener,
  bind,
  log,
  makeRandomToken,
  stableSort,
  unreachable,
} from "../shared/main";
import iconsChecksum from "../icons/checksum";
// TODO: Move this type somewhere.
import type { ElementType } from "../worker/ElementManager";
import type {
  ExtendedElementReport,
  FromBackground,
  FromPopup,
  FromRenderer,
  FromWorker,
  HintsState,
  TabState,
  ToBackground,
  ToPopup,
  ToRenderer,
  ToWorker,
} from "../data/Messages";
import type {
  HintsMode,
  KeyboardAction,
  KeyboardMapping,
} from "../data/KeyboardShortcuts";

type MessageInfo = {|
  tabId: number,
  frameId: number,
  // Currently unused, but nice to have in logging.
  url: ?string,
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

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  hintChars: string;
  tabState: Map<number, TabState>;
  oneTimeWindowMessageToken: string;
  resets: Resets;

  constructor({
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
    hintChars,
  }: {|
    normalKeyboardShortcuts: Array<KeyboardMapping>,
    hintsKeyboardShortcuts: Array<KeyboardMapping>,
    hintChars: string,
  |}) {
    this.normalKeyboardShortcuts = normalKeyboardShortcuts;
    this.hintsKeyboardShortcuts = hintsKeyboardShortcuts;
    this.hintChars = hintChars;
    this.tabState = new Map();
    this.oneTimeWindowMessageToken = makeRandomToken();
    this.resets = new Resets();

    bind(this, [
      [this.onKeyboardShortcut, { catch: true }],
      [this.onMessage, { catch: true }],
      [this.onPopupMessage, { log: true, catch: true }],
      [this.onRendererMessage, { log: true, catch: true }],
      [this.onWorkerMessage, { log: true, catch: true }],
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
    const info =
      sender.tab != null && sender.frameId != null
        ? { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url }
        : undefined;

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

  // Let the content scripts create a `Port` that will disconnect when the
  // extension is disabled so that they can perform cleanups. In order for a
  // port to connect, somebody must be listening on the other side, so use a
  // dummy function as a listener.
  onConnect() {
    // Do nothing.
  }

  async onWorkerMessage(
    message: FromWorker,
    info: MessageInfo,
    tabState: TabState
  ): Promise<void> {
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

        if (
          !isBackspace &&
          (key.length !== 1 || !this.hintChars.includes(key))
        ) {
          return;
        }

        const enteredHintChars = isBackspace
          ? hintsState.enteredHintChars.slice(0, -1)
          : `${hintsState.enteredHintChars}${key}`;

        const updates = hintsState.elementsWithHints.map(
          element =>
            element.hint.startsWith(enteredHintChars)
              ? {
                  type: "Update",
                  matched: enteredHintChars,
                  rest: element.hint.slice(enteredHintChars.length),
                }
              : { type: "Hide" }
        );

        if (updates.length === 0) {
          return;
        }

        const matchingHints = new Set(
          updates
            .map(
              update =>
                update.type === "Update" && update.rest === ""
                  ? update.matched
                  : undefined
            )
            .filter(Boolean)
        );

        const done = matchingHints.size === 1;

        if (done) {
          const [hint] = Array.from(matchingHints);
          const [match] = stableSort(
            hintsState.elementsWithHints.filter(
              element => element.hint === hint
            ),
            (a, b) => b.weight - a.weight
          );
          const { url, title } = match;

          switch (hintsState.mode) {
            case "Click":
              this.sendWorkerMessage(
                {
                  type: "ClickElement",
                  index: match.index,
                },
                {
                  tabId: info.tabId,
                  frameId: match.frameId,
                }
              );
              break;

            case "BackgroundTab":
              if (url == null) {
                log(
                  "error",
                  "Cannot open background tab due to missing URL",
                  match
                );
                break;
              }
              this.sendWorkerMessage(
                {
                  type: "FocusElement",
                  index: match.index,
                },
                {
                  tabId: info.tabId,
                  frameId: match.frameId,
                }
              );
              await browser.tabs.create({
                active: false,
                url,
                openerTabId: info.tabId,
              });
              break;

            case "ForegroundTab":
              if (url == null) {
                log(
                  "error",
                  "Cannot open background tab due to missing URL",
                  match
                );
                break;
              }
              this.sendWorkerMessage(
                {
                  type: "FocusElement",
                  index: match.index,
                },
                {
                  tabId: info.tabId,
                  frameId: match.frameId,
                }
              );
              await browser.tabs.create({
                active: true,
                url,
                openerTabId: info.tabId,
              });
              break;

            default:
              unreachable(hintsState.mode);
          }
          tabState.hintsState = { type: "Idle" };
          this.sendWorkerMessage(this.makeWorkerState(tabState.hintsState), {
            tabId: info.tabId,
            frameId: "all_frames",
          });
          this.sendRendererMessage(
            {
              type: "Unrender",
              mode:
                hintsState.mode === "Click" && title != null
                  ? { type: "title", title }
                  : { type: "delayed" },
            },
            { tabId: info.tabId }
          );
          this.updateBadge(info.tabId);
        }

        hintsState.enteredHintChars = enteredHintChars;
        this.sendRendererMessage(
          {
            type: "UpdateHints",
            updates,
            markMatched: done,
          },
          { tabId: info.tabId }
        );
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

        const elements = message.elements.map(
          ({ type, index, hintMeasurements, url, title }) => ({
            type,
            index,
            hintMeasurements,
            url,
            title,
            frameId: info.frameId,
          })
        );

        hintsState.pendingElements.elements.push(...elements);

        hintsState.pendingElements.pendingFrames.answering += message.numFrames;

        hintsState.pendingElements.pendingFrames.collecting = Math.max(
          0,
          hintsState.pendingElements.pendingFrames.collecting - 1
        );

        if (message.numFrames === 0) {
          // If there are no frames, start hinting immediately, unless we're
          // waiting for frames in another frame.
          if (hintsState.timeoutId == null) {
            this.maybeStartHinting(tabState, info.tabId);
          }
        } else {
          // If there are frames, wait for them.
          if (hintsState.timeoutId != null) {
            clearTimeout(hintsState.timeoutId);
          }
          hintsState.timeoutId = setTimeout(() => {
            hintsState.timeoutId = undefined;
            this.maybeStartHinting(tabState, info.tabId);
          }, FRAME_REPORT_TIMEOUT);
        }
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  maybeStartHinting(tabState: TabState, tabId: number) {
    const { hintsState } = tabState;
    if (
      hintsState.type !== "Collecting" ||
      hintsState.pendingElements.pendingFrames.collecting > 0
    ) {
      return;
    }

    const elementsWithHints = stableSort(
      hintsState.pendingElements.elements.map(element => ({
        type: element.type,
        index: element.index,
        hintMeasurements: element.hintMeasurements,
        url: element.url,
        title: element.title,
        frameId: element.frameId,
        weight: hintWeight(element),
        hint: "",
      })),
      (a, b) => compareWeights(b, a)
    );
    const tree = huffman.createTree(elementsWithHints, this.hintChars.length, {
      sorted: true,
      compare: compareWeights,
    });
    tree.assignCodeWords(this.hintChars, (item, codeWord) => {
      item.hint = codeWord;
    });
    tabState.hintsState = {
      type: "Hinting",
      mode: hintsState.mode,
      startTime: hintsState.pendingElements.startTime,
      enteredHintChars: "",
      elementsWithHints,
    };
    this.sendWorkerMessage(this.makeWorkerState(tabState.hintsState), {
      tabId,
      frameId: "all_frames",
    });
    this.sendRendererMessage(
      {
        type: "Render",
        elements: elementsWithHints,
      },
      { tabId }
    );
    this.updateBadge(tabId);
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
        const { startTime } = hintsState;
        const { timestamps } = message;
        tabState.perf = [{ startTime, timestamps }, ...tabState.perf].slice(
          0,
          10
        );
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
        this.sendWorkerMessage(
          {
            type: "StartFindElements",
            types: getHintsTypes(action.mode),
          },
          {
            tabId: info.tabId,
            frameId: TOP_FRAME_ID,
          }
        );
        tabState.hintsState = {
          type: "Collecting",
          mode: action.mode,
          pendingElements: {
            pendingFrames: {
              answering: 0,
              collecting: 0,
            },
            startTime: timestamp,
            elements: [],
          },
          timeoutId: undefined,
        };
        this.updateBadge(info.tabId);
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

      case "Escape": {
        this.exitHintsMode(info.tabId);
        this.sendWorkerMessage(
          { type: "Escape" },
          { tabId: info.tabId, frameId: "all_frames" }
        );
        break;
      }

      default:
        unreachable(action.type, action);
    }
  }

  exitHintsMode(tabId: number) {
    const tabState = this.tabState.get(tabId);
    if (tabState == null) {
      return;
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
    { refreshToken = true }: {| refreshToken: boolean |} = {}
  ): ToWorker {
    if (refreshToken) {
      this.oneTimeWindowMessageToken = makeRandomToken();
    }
    if (hintsState.type === "Hinting") {
      return {
        type: "StateSync",
        logLevel: log.level,
        clearElements: false,
        keyboardShortcuts: this.hintsKeyboardShortcuts,
        keyboardOptions: {
          suppressByDefault: true,
          sendAll: true,
        },
        oneTimeWindowMessageToken: this.oneTimeWindowMessageToken,
      };
    }
    return {
      type: "StateSync",
      logLevel: log.level,
      clearElements: true,
      keyboardShortcuts: this.normalKeyboardShortcuts,
      keyboardOptions: {
        suppressByDefault: false,
        sendAll: false,
      },
      oneTimeWindowMessageToken: this.oneTimeWindowMessageToken,
    };
  }
}

// This is a function (not a constant), because of mutation.
function makeEmptyTabState(): TabState {
  return {
    hintsState: { type: "Idle" },
    perf: [],
  };
}

function getHintsTypes(mode: HintsMode): Array<ElementType> {
  switch (mode) {
    case "Click":
      return [
        "clickable",
        "clickable-event",
        "label",
        "link",
        "scrollable",
        "textarea",
      ];

    case "BackgroundTab":
      return ["link"];

    case "ForegroundTab":
      return ["link"];

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

// These types of elements can be very large, making them get much shorter hints
// than they deserve. There’s also the case of `<div
// onclick="..."><input></div>` where the hint for the `<div>` and the hint for
// the `<input>` end up on top of each other. Usually only clicking the
// `<input>` actually focuses the `<input>`, so giving it a better weight makes
// sure it stays on top.
const DOWN_PRIORITIZED_ELEMENT_TYPES: Set<ElementType> = new Set([
  "clickable-event",
  "scrollable",
]);

// The types of elements above get the area of a small-ish link (plus log2 of
// their original area to distinguish the elements from each other somewhat).
const DOWN_PRIORITIZED_ELEMENT_AREA = 1000; // px

function hintWeight(element: ExtendedElementReport): number {
  const { area } = element.hintMeasurements;
  return DOWN_PRIORITIZED_ELEMENT_TYPES.has(element.type)
    ? Math.min(area, DOWN_PRIORITIZED_ELEMENT_AREA + Math.log2(area))
    : area;
}

// If there are a bunch boxes next to each other with seemingly the same area
// (and no other clickable elements around) the first box should get the first
// hint chars as a hint, the second should get the second hint char, and so on.
// However, the areas of the boxes can differ ever so slightly (usually by less
// than 1px). If two elements have too little difference in area for a human to
// detect, consider their areas equal.
const MIN_WEIGHT_DIFF = 10; // Pixels of area.

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
      return String(hintsState.elementsWithHints.length);
    default:
      return unreachable(hintsState.type);
  }
}
