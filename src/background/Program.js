// @flow

import huffman from "n-ary-huffman";

import { bind, unreachable } from "../utils/main";
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
|};

type TabState = {|
  rendererFrameId: number,
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

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  hintChars: string;
  tabState: Map<number, TabState>;

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

    bind(this, ["onMessage", "onTabRemoved"]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
    browser.tabs.onRemoved.addListener(this.onTabRemoved);
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendWorkerMessage(
    message: ToWorker,
    { tabId, frameId }: {| tabId?: number, frameId?: number |} = {}
  ): Promise<any> {
    return this.sendMessage({ type: "ToWorker", message }, { tabId, frameId });
  }

  async sendRendererMessage(
    message: ToRenderer,
    { tabId }: {| tabId?: number |} = {}
  ): Promise<any> {
    const tabState = tabId == null ? undefined : this.tabState.get(tabId);
    const frameId = tabState == null ? undefined : tabState.rendererFrameId;
    return this.sendMessage(
      { type: "ToRenderer", message },
      { tabId, frameId }
    );
  }

  async sendMessage(
    message: FromBackground,
    { tabId: passedTabId, frameId }: {| tabId?: number, frameId?: number |} = {}
  ): Promise<any> {
    try {
      const tabId =
        passedTabId == null
          ? (await browser.tabs.query({ active: true }))[0].id
          : passedTabId;
      return frameId == null
        ? await browser.tabs.sendMessage(tabId, message)
        : await browser.tabs.sendMessage(tabId, message, { frameId });
    } catch (error) {
      console.error("BackgroundProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  async onMessage(message: ToBackground, sender: MessageSender): Promise<any> {
    const info =
      sender.tab != null && sender.frameId != null
        ? { tabId: sender.tab.id, frameId: sender.frameId }
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
          return this.onWorkerMessage(message.message, info, tabState);
        }
        console.error(
          "BackgroundProgram#onMessage: Missing info",
          info,
          message.type,
          message,
          sender
        );
        break;

      case "FromRenderer":
        if (info != null) {
          return this.onRendererMessage(message.message, info, tabState);
        }
        console.error(
          "BackgroundProgram#onMessage: Missing info",
          info,
          message.type,
          message,
          sender
        );
        break;

      case "FromPopup":
        return this.onPopupMessage(message.message);

      default:
        unreachable(message.type, message);
    }
    return undefined;
  }

  async onWorkerMessage(
    message: FromWorker,
    info: MessageInfo,
    tabState: TabState
  ): Promise<any> {
    switch (message.type) {
      case "WorkerScriptAdded":
        this.sendWorkerMessage(
          {
            type: "StateSync",
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
                console.error(
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
              openTab({ active: false, url, openerTabId: info.tabId });
              break;

            case "ForegroundTab":
              if (url == null) {
                console.error(
                  "Cannot open foreground tab due to missing URL",
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
              openTab({ active: true, url, openerTabId: info.tabId });
              break;

            default:
              unreachable(hintsState.mode);
          }
          tabState.hintsState = { type: "Idle" };
          this.sendWorkerMessage(
            {
              type: "StateSync",
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
        this.sendRendererMessage({
          type: "UpdateHints",
          updates,
          markMatched: done,
        });
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

  async onRendererMessage(
    message: FromRenderer,
    info: MessageInfo,
    tabState: TabState
  ): Promise<any> {
    switch (message.type) {
      case "RendererScriptAdded":
        tabState.rendererFrameId = info.frameId;
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

  async onPopupMessage(message: FromPopup): Promise<any> {
    switch (message.type) {
      case "GetPerf": {
        const tabId = (await browser.tabs.query({ active: true }))[0].id;
        const tabState = this.tabState.get(tabId);
        return tabState == null ? null : tabState.perf;
      }

      default:
        unreachable(message.type, message);
    }
    return undefined;
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
            frameId: tabState.rendererFrameId,
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

  onTabRemoved(tabId: number) {
    this.tabState.delete(tabId);
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
    // This is a bit ugly, I know. This ID will quickly be replaced with a real
    // one.
    rendererFrameId: 0,
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

async function openTab({
  active,
  url,
  openerTabId,
}: {|
  active: boolean,
  url: string,
  openerTabId: number,
|}): Promise<void> {
  try {
    browser.tabs.create({ active, url, openerTabId });
  } catch (error) {
    console.error("Failed to open tab", error);
  }
}
