// @flow

import huffman from "n-ary-huffman";

import { LOADED_KEY, bind, log, unreachable } from "../shared/main";
// TODO: Move this type somewhere.
import type { ElementType } from "../worker/ElementManager";
import type {
  ElementWithHint,
  ExtendedElementReport,
  FromBackground,
  FromPopup,
  FromRenderer,
  FromWorker,
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

type PendingElements = {|
  elements: Array<ExtendedElementReport>,
  pendingFrames: number,
  startTime: number,
|};

type MessageInfo = {|
  tabId: number,
  frameId: number,
  // Currently unused, but nice to have in logging.
  url: ?string,
|};

type TabState = {|
  perf: Array<number>,
  hintsState: HintsState,
|};

type HintsState =
  | {|
      type: "Idle",
    |}
  | {|
      type: "Collecting",
      mode: HintsMode,
      pendingElements: PendingElements,
    |}
  | {|
      type: "Hinting",
      mode: HintsMode,
      elementsWithHints: Array<ElementWithHint>,
      startTime: number,
      enteredHintChars: string,
    |};

// As far as I can tell, the top frameId is always 0. This is also mentioned here:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/Tabs/executeScript
// “frameId: Optional integer. The frame where the code should be injected.
// Defaults to 0 (the top-level frame).”
const TOP_FRAME_ID = 0;

// Both Firefox and Chrome don't seem to like setting the icon too often, or
// during other events. This tiny timeout de-dupes `this.updateIcon` calls.
// Without the timeout, Firefox would sometimes not show the disabled icon when
// visiting `about:addons` in a tab which previously showed a web page. Chrome
// wouldn't show the disabled icon for the first new tab opened after install.
// The timeout is also nice to avoid flashing when clicking links, especially in
// Chrome. The old content script's port disconnect a couple of milliseconds
// before the new one connects.
const ICON_TIMEOUT = 10; // ms

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  hintChars: string;
  tabState: Map<number, TabState>;
  updateIconTimeoutIds: Map<number, number>;

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
    this.updateIconTimeoutIds = new Map();

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
      this.onTabRemoved,
    ]);
  }

  async start(): Promise<void> {
    log("log", "BackgroundProgram#start", BROWSER, BUILD_TIME, PROD);

    const tabs = await browser.tabs.query({});

    browser.runtime.onMessage.addListener(this.onMessage);
    browser.runtime.onConnect.addListener(this.onConnect);
    browser.tabs.onCreated.addListener(this.onTabCreated);
    browser.tabs.onRemoved.addListener(this.onTabRemoved);

    for (const tab of tabs) {
      this.updateIcon(tab.id);
    }

    await runContentScripts(tabs);
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    browser.runtime.onConnect.removeListener(this.onConnect);
    browser.tabs.onCreated.removeListener(this.onTabCreated);
    browser.tabs.onRemoved.removeListener(this.onTabRemoved);
  }

  async sendWorkerMessage(
    message: ToWorker,
    { tabId, frameId }: {| tabId: number, frameId?: number |}
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
    { tabId, frameId }: {| tabId: number, frameId?: number |}
  ): Promise<void> {
    await (frameId == null
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
      this.updateIcon(info.tabId);
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
    const { sender } = port;

    if (sender == null) {
      return;
    }

    port.onMessage.addListener((message: ToBackground) => {
      this.onMessage(message, sender);
    });

    const { tab } = sender;

    if (sender.frameId === TOP_FRAME_ID && tab != null) {
      port.onDisconnect.addListener(() => {
        // Trying to update the icon after the tab has been closed is an error.
        // So only try to update the icon if the tab is still open.
        if (this.tabState.has(tab.id)) {
          this.tabState.delete(tab.id);
          this.updateIcon(tab.id);
        }
      });
    }
  }

  async onWorkerMessage(
    message: FromWorker,
    info: MessageInfo,
    tabState: TabState
  ): Promise<void> {
    switch (message.type) {
      case "WorkerScriptAdded":
        this.sendWorkerMessage(
          {
            type: "StateSync",
            logLevel: log.level,
            clearElements: true,
            keyboardShortcuts: this.normalKeyboardShortcuts,
            keyboardOptions: {
              capture: false,
              suppressByDefault: false,
              sendAll: false,
            },
            oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
          },
          { tabId: info.tabId }
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
          const [match] = hintsState.elementsWithHints
            .filter(element => element.hint === hint)
            .sort((a, b) => b.weight - a.weight);
          const { url } = match;

          switch (hintsState.mode) {
            case "Click":
              this.sendWorkerMessage(
                {
                  type: "ClickElement",
                  index: match.index,
                },
                { tabId: info.tabId }
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
                { tabId: info.tabId }
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
                { tabId: info.tabId }
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
          this.sendWorkerMessage(
            {
              type: "StateSync",
              logLevel: log.level,
              clearElements: true,
              keyboardShortcuts: this.normalKeyboardShortcuts,
              keyboardOptions: {
                capture: false,
                suppressByDefault: false,
                sendAll: false,
              },
              oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
            },
            { tabId: info.tabId }
          );
          this.sendRendererMessage(
            {
              type: "Unrender",
              delayed: true,
            },
            { tabId: info.tabId }
          );
          browser.browserAction.setBadgeText({
            text: "",
            tabId: info.tabId,
          });
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

      case "ReportVisibleElements": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Collecting") {
          return;
        }

        const elements = message.elements.map(
          ({ type, index, hintMeasurements, url }) => ({
            type,
            index,
            hintMeasurements,
            url,
            frameId: info.frameId,
          })
        );
        hintsState.pendingElements.elements.push(...elements);
        hintsState.pendingElements.pendingFrames += message.pendingFrames - 1;
        if (hintsState.pendingElements.pendingFrames <= 0) {
          const elementsWithHints = hintsState.pendingElements.elements.map(
            element => ({
              type: element.type,
              index: element.index,
              hintMeasurements: element.hintMeasurements,
              url: element.url,
              frameId: element.frameId,
              weight: element.hintMeasurements.area,
              hint: "",
            })
          );
          const tree = huffman.createTree(
            elementsWithHints,
            this.hintChars.length
          );
          tree.assignCodeWords(this.hintChars, (item, codeWord) => {
            item.hint = codeWord;
          });
          tabState.hintsState = {
            type: "Hinting",
            mode: hintsState.mode,
            startTime: hintsState.pendingElements.startTime,
            elementsWithHints,
            enteredHintChars: "",
          };
          this.sendWorkerMessage(
            {
              type: "StateSync",
              logLevel: log.level,
              clearElements: false,
              keyboardShortcuts: this.hintsKeyboardShortcuts,
              keyboardOptions: {
                capture: true,
                suppressByDefault: true,
                sendAll: true,
              },
              oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
            },
            { tabId: info.tabId }
          );
          this.sendRendererMessage(
            {
              type: "Render",
              elements: elementsWithHints,
            },
            { tabId: info.tabId }
          );
          browser.browserAction.setBadgeText({
            text: String(hintsState.pendingElements.elements.length),
            tabId: info.tabId,
          });
        }
        break;
      }

      default:
        unreachable(message.type, message);
    }
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
        const duration = message.timestamp - startTime;
        tabState.perf = [duration, ...tabState.perf].slice(0, 10);
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
                  perf: tabState.perf,
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
            perf: tabState.perf,
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
            elements: [],
            pendingFrames: 1,
            startTime: timestamp,
          },
        };
        break;
      }

      case "ExitHintsMode": {
        const tabState = this.tabState.get(info.tabId);
        if (tabState == null || tabState.hintsState.type !== "Hinting") {
          return;
        }
        tabState.hintsState = { type: "Idle" };
        this.sendWorkerMessage(
          {
            type: "StateSync",
            logLevel: log.level,
            clearElements: true,
            keyboardShortcuts: this.normalKeyboardShortcuts,
            keyboardOptions: {
              capture: false,
              suppressByDefault: false,
              sendAll: false,
            },
            oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
          },
          { tabId: info.tabId }
        );
        this.sendRendererMessage(
          {
            type: "Unrender",
            delayed: false,
          },
          { tabId: info.tabId }
        );
        browser.browserAction.setBadgeText({
          text: "",
          tabId: info.tabId,
        });
        break;
      }

      default:
        unreachable(action.type, action);
    }
  }

  onTabCreated(tab: Tab) {
    this.updateIcon(tab.id);
  }

  onTabRemoved(tabId: number) {
    this.tabState.delete(tabId);

    // Trying to update the icon after the tab has been closed is an error.
    // Remove any scheduled updates.
    const previousTimeoutId = this.updateIconTimeoutIds.get(tabId);
    if (previousTimeoutId != null) {
      window.clearTimeout(previousTimeoutId);
      this.updateIconTimeoutIds.delete(tabId);
    }
  }

  updateIcon(tabId: number): Promise<void> {
    const previousTimeoutId = this.updateIconTimeoutIds.get(tabId);

    if (previousTimeoutId != null) {
      window.clearTimeout(previousTimeoutId);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.updateIconTimeoutIds.delete(tabId);
        const type: IconType = this.tabState.has(tabId) ? "normal" : "disabled";
        const icons = getIcons(type);
        log("log", "BackgroundProgram#updateIcon", tabId, type);
        browser.browserAction
          .setIcon({ path: icons, tabId })
          .then(resolve, reject);
      }, ICON_TIMEOUT);

      this.updateIconTimeoutIds.set(tabId, timeoutId);
    });
  }
}

function makeOneTimeWindowMessage(): string {
  const array = new Uint32Array(3);
  window.crypto.getRandomValues(array);
  return array.join("");
}

// This is a function (not a constant), because of mutation.
function makeEmptyTabState(): TabState {
  return {
    perf: [],
    hintsState: { type: "Idle" },
  };
}

function getHintsTypes(mode: HintsMode): Array<ElementType> {
  switch (mode) {
    case "Click":
      return ["clickable", "link"];

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
            // This `window` property is set by `RendererProgram`. If it’s set
            // to true, consider all `content_scripts` in manifest.json to be
            // already automatically loaded.
            const [loaded] = await browser.tabs.executeScript(tab.id, {
              code: `window[${JSON.stringify(LOADED_KEY)}]`,
              runAt: "document_start",
            });
            return loaded === true
              ? []
              : await browser.tabs.executeScript(tab.id, details);
          } catch (_error) {
            // If `executeScript` fails it means that the extension is not
            // allowed to run content scripts in the tab. Example: `about:*`
            // pages. We don’t need to do anything in that case.
            return [];
          }
        })
      )
    )
  );
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
            ? `${newValue.replace(/png/g, "svg")}?${Date.now()}`
            : newValue;
        result[key] = finalValue;
      }
      return result;
    },
    {}
  );
}
