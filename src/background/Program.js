// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ExtendedElementReport,
  FromAllFrames,
  FromBackground,
  FromPopup,
  FromTopFrame,
  ToAllFrames,
  ToBackground,
  ToTopFrame,
} from "../data/Messages";
import type {
  KeyboardAction,
  KeyboardMapping,
} from "../data/KeyboardShortcuts";

type PendingElements = {|
  tabId: ?number,
  elements: Array<ExtendedElementReport>,
  pendingFrames: number,
  startTime: ?number,
|};

type MessageInfo = {|
  tabId: number,
  frameId: number,
|};

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;

  topFrameIds: Map<number, number>;
  perfByTabId: Map<number, Array<number>>;
  pendingElements: PendingElements;

  constructor({
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
  }: {|
    normalKeyboardShortcuts: Array<KeyboardMapping>,
    hintsKeyboardShortcuts: Array<KeyboardMapping>,
  |}) {
    this.normalKeyboardShortcuts = normalKeyboardShortcuts;
    this.hintsKeyboardShortcuts = hintsKeyboardShortcuts;
    this.topFrameIds = new Map();
    this.pendingElements = makeEmptyPendingElements();
    this.perfByTabId = new Map();

    bind(this, ["onMessage", "onTabRemoved"]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
    browser.tabs.onRemoved.addListener(this.onTabRemoved);
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendAllFramesMessage(
    message: ToAllFrames,
    { tabId, frameId }: {| tabId?: number, frameId?: number |} = {}
  ): Promise<any> {
    return this.sendMessage(
      { type: "ToAllFrames", message },
      { tabId, frameId }
    );
  }

  async sendTopFrameMessage(message: ToTopFrame): Promise<any> {
    return this.sendMessage({ type: "ToTopFrame", message });
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

    switch (message.type) {
      case "FromAllFrames":
        if (info != null) {
          return this.onAllFramesMessage(message.message, info);
        }
        console.error(
          "BackgroundProgram#onMessage: Missing info",
          info,
          message.type,
          message
        );

        break;

      case "FromTopFrame":
        if (info != null) {
          return this.onTopFrameMessage(message.message, info);
        }
        console.error(
          "BackgroundProgram#onMessage: Missing info",
          info,
          message.type,
          message
        );

        break;

      case "FromPopup":
        return this.onPopupMessage(message.message);

      default:
        unreachable(message.type, message);
    }
    return undefined;
  }

  async onAllFramesMessage(
    message: FromAllFrames,
    info: MessageInfo
  ): Promise<any> {
    switch (message.type) {
      case "AllFramesScriptAdded":
        this.sendAllFramesMessage(
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
        this.onKeyboardShortcut(message.action, info.tabId, message.timestamp);
        break;

      case "ReportVisibleElements": {
        const elements = message.elements.map(
          ({ type, hintMeasurements, url }) => ({
            type,
            hintMeasurements,
            url,
            frameId: info.frameId,
          })
        );
        this.pendingElements.elements.push(...elements);
        this.pendingElements.pendingFrames += message.pendingFrames - 1;
        if (this.pendingElements.pendingFrames <= 0) {
          this.sendAllFramesMessage(
            {
              type: "StateSync",
              keyboardShortcuts: this.hintsKeyboardShortcuts,
              suppressByDefault: true,
              oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
            },
            { tabId: info.tabId }
          );
          this.sendTopFrameMessage({
            type: "Render",
            elements: this.pendingElements.elements,
          });
        }
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  async onTopFrameMessage(
    message: FromTopFrame,
    info: MessageInfo
  ): Promise<any> {
    switch (message.type) {
      case "TopFrameScriptAdded":
        this.topFrameIds.set(info.tabId, info.frameId);
        break;

      case "Rendered": {
        const { tabId, startTime } = this.pendingElements;
        if (tabId != null && startTime != null) {
          const duration = message.timestamp - startTime;
          const previous = this.perfByTabId.get(tabId) || [];
          const newItems = previous.concat(duration).slice(-10);
          this.perfByTabId.set(tabId, newItems);
        }
        break;
      }

      default:
        unreachable(message.type, message);
    }
    return undefined;
  }

  async onPopupMessage(message: FromPopup): Promise<any> {
    switch (message.type) {
      case "GetPerf": {
        const tabId = (await browser.tabs.query({ active: true }))[0].id;
        const perf = this.perfByTabId.get(tabId);
        const hasFrameScripts = this.topFrameIds.has(tabId);
        return hasFrameScripts ? (perf == null ? [] : perf) : null;
      }

      default:
        unreachable(message.type, message);
    }
    return undefined;
  }

  onKeyboardShortcut(
    action: KeyboardAction,
    tabId: ?number,
    timestamp: number
  ) {
    switch (action.type) {
      case "EnterHintsMode":
        this.sendAllFramesMessage(
          { type: "StartFindElements" },
          tabId == null
            ? undefined
            : {
                tabId,
                frameId: this.topFrameIds.get(tabId),
              }
        );
        this.pendingElements = {
          tabId,
          elements: [],
          pendingFrames: 1,
          startTime: timestamp,
        };
        break;

      case "ExitHintsMode":
        this.pendingElements = makeEmptyPendingElements();
        this.sendAllFramesMessage({
          type: "StateSync",
          keyboardShortcuts: this.normalKeyboardShortcuts,
          suppressByDefault: false,
          oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
        });
        this.sendTopFrameMessage({
          type: "Unrender",
        });
        break;

      case "PressHintChar":
        console.log("PressHintChar", action.char);
        break;

      default:
        unreachable(action.type, action);
    }
  }

  onTabRemoved(tabId: number) {
    this.topFrameIds.delete(tabId);
    this.perfByTabId.delete(tabId);
    if (tabId === this.pendingElements.tabId) {
      this.pendingElements = makeEmptyPendingElements();
    }
  }
}

function makeOneTimeWindowMessage(): string {
  const array = new Uint32Array(3);
  window.crypto.getRandomValues(array);
  return array.join("");
}

// This is a function (not a constant), since `this.pendingElements` is mutated.
function makeEmptyPendingElements(): PendingElements {
  return {
    tabId: undefined,
    elements: [],
    pendingFrames: 0,
    startTime: undefined,
  };
}
