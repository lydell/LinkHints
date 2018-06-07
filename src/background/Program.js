// @flow

import huffman from "n-ary-huffman";

import { bind, unreachable } from "../utils/main";
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
      pendingElements: PendingElements,
    |}
  | {|
      type: "Hinting",
      elementsWithHints: Array<ElementWithHint>,
      startTime: number,
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

  async sendRendererMessage(message: ToRenderer): Promise<any> {
    return this.sendMessage({ type: "ToRenderer", message });
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
            keyboardShortcuts: this.normalKeyboardShortcuts,
            suppressByDefault: false,
            oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
          },
          { tabId: info.tabId }
        );
        break;

      case "KeyboardShortcutMatched":
        this.onKeyboardShortcut(message.action, info, message.timestamp);
        break;

      case "ReportVisibleElements": {
        const { hintsState } = tabState;
        if (hintsState.type !== "Collecting") {
          return;
        }

        const elements = message.elements.map(
          ({ type, hintMeasurements, url }) => ({
            type,
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
            startTime: hintsState.pendingElements.startTime,
            elementsWithHints,
          };
          this.sendWorkerMessage(
            {
              type: "StateSync",
              keyboardShortcuts: this.hintsKeyboardShortcuts,
              suppressByDefault: true,
              oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
            },
            { tabId: info.tabId }
          );
          this.sendRendererMessage({
            type: "Render",
            elements: elementsWithHints,
          });
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
        tabState.perf = [duration, ...tabState.perf].slice(-10);
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
          { type: "StartFindElements" },
          {
            tabId: info.tabId,
            frameId: tabState.rendererFrameId,
          }
        );
        tabState.hintsState = {
          type: "Collecting",
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
        this.sendWorkerMessage({
          type: "StateSync",
          keyboardShortcuts: this.normalKeyboardShortcuts,
          suppressByDefault: false,
          oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
        });
        this.sendRendererMessage({
          type: "Unrender",
        });
        break;
      }

      case "PressHintChar":
        console.log("PressHintChar", action.char);
        break;

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
