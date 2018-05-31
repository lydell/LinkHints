// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ExtendedElementReport,
  FromBackground,
  ToAllFrames,
  ToBackground,
  ToTopFrame,
} from "../data/Messages";
import type {
  KeyboardAction,
  KeyboardMapping,
} from "../data/KeyboardShortcuts";

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  topFrameIds: Map<number, number>;
  pendingElements: {|
    elements: Array<ExtendedElementReport>,
    pendingFrames: number,
    startTime: ?number,
  |};

  perfByTabId: Map<number, Array<number>>;

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
    this.pendingElements = {
      elements: [],
      pendingFrames: 0,
      startTime: undefined,
    };
    this.perfByTabId = new Map();

    bind(this, ["onMessage"]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
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
    switch (message.type) {
      case "AllFramesScriptAdded":
        this.sendAllFramesMessage(
          {
            type: "StateSync",
            keyboardShortcuts: this.normalKeyboardShortcuts,
            suppressByDefault: false,
            oneTimeWindowMessageToken: makeOneTimeWindowMessage(),
          },
          { tabId: sender.tab == null ? undefined : sender.tab.id }
        );
        break;

      case "KeyboardShortcutMatched":
        this.onKeyboardShortcut(
          message.action,
          sender.tab == null ? undefined : sender.tab.id,
          message.timestamp
        );
        break;

      case "TopFrameScriptAdded":
        if (sender.tab != null && sender.frameId != null) {
          this.topFrameIds.set(sender.tab.id, sender.frameId);
        }
        break;

      case "ReportVisibleElements": {
        const { frameId } = sender;
        if (frameId != null) {
          const elements = message.elements.map(
            ({ type, hintMeasurements, url }) => ({
              type,
              hintMeasurements,
              url,
              frameId,
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
              sender.tab == null
                ? undefined
                : {
                    tabId: sender.tab.id,
                  }
            );
            this.sendTopFrameMessage({
              type: "Render",
              elements: this.pendingElements.elements,
            });
          }
        }
        break;
      }

      case "Rendered": {
        const tabId = sender.tab == null ? undefined : sender.tab.id;
        const { startTime } = this.pendingElements;
        if (tabId != null && startTime != null) {
          const duration = message.timestamp - startTime;
          const previous = this.perfByTabId.get(tabId) || [];
          const newItems = previous.concat(duration).slice(-10);
          this.perfByTabId.set(tabId, newItems);
        }
        break;
      }

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
          elements: [],
          pendingFrames: 1,
          startTime: timestamp,
        };
        break;

      case "ExitHintsMode":
        this.pendingElements = {
          elements: [],
          pendingFrames: 0,
          startTime: undefined,
        };
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
}

function makeOneTimeWindowMessage(): string {
  const array = new Uint32Array(3);
  window.crypto.getRandomValues(array);
  return array.join("");
}
