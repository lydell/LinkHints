// @flow strict-local

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  ToBackground,
} from "../shared/messages";
import React from "./static-react";

const META = META_CONFIG;
const CONTAINER_ID = "container";

export default class PopupProgram {
  resets: Resets = new Resets();

  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    this.sendMessage({ type: "PopupScriptAdded" });
  }

  stop() {
    this.resets.reset();
  }

  async sendMessage(message: FromPopup) {
    log("log", "PopupProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
  }

  // Technically, `ToWorker` and `ToRenderer` messages (which are part of
  // `FromBackground`) can never appear here, since they are sent using
  // `browser.tabs.sendMessage` rather than `browser.runtime.sendMessage`.
  // Instead, `FromWorker` and `FromRenderer` messages can appear (which are
  // part of `ToBackground`)! That's because a popup counts as a background
  // script, which can receive messages from content scripts. So the
  // `FromBackground` type annotation isn't entirely true, but the
  // `wrappedMessage.type` check narrows the messages down correctly anyway.
  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToPopup") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "PopupProgram#onMessage", message.type, message);

    switch (message.type) {
      case "Init":
        log.level = message.logLevel;
        this.render({ isEnabled: message.isEnabled });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render({ isEnabled }: {| isEnabled: boolean |}) {
    const previous = document.getElementById(CONTAINER_ID);

    if (previous != null) {
      previous.remove();
    }

    const container = (
      <div id={CONTAINER_ID} className="Container">
        <div>
          <h1>
            {META.name} {META.version}
          </h1>

          <p>
            <a href={META.homepage}>Homepage</a>
          </p>
        </div>

        {!isEnabled && (
          <p>
            <strong>Browser extensions are not allowed on this page.</strong>
          </p>
        )}

        <p className="Buttons">
          <button
            type="button"
            className="browser-style"
            onClick={async () => {
              await openOptionsPage();
              window.close();
            }}
          >
            Options
          </button>

          <button
            type="button"
            className="browser-style"
            onClick={async () => {
              await copyDebugInfo();
              window.close();
            }}
          >
            Copy debug info
          </button>
        </p>
      </div>
    );

    if (document.body != null) {
      document.body.append(container);
    }
  }
}

function wrapMessage(message: FromPopup): ToBackground {
  return {
    type: "FromPopup",
    message,
  };
}

async function openOptionsPage() {
  try {
    await browser.runtime.openOptionsPage();
  } catch (error) {
    log("error", "PopupProgram", "Failed to open options page", error);
  }
}

async function copyDebugInfo() {
  try {
    const [browserInfo, platformInfo, storage, layoutMap] = await Promise.all([
      typeof browser.runtime.getBrowserInfo === "function"
        ? browser.runtime.getBrowserInfo()
        : null,
      browser.runtime.getPlatformInfo(),
      browser.storage.sync.get(),
      // $FlowIgnore: Flow doesn’t know about `navigator.keyboard` yet.
      navigator.keyboard != null ? navigator.keyboard.getLayoutMap() : null,
    ]);

    const layout =
      layoutMap != null
        ? Array.from(layoutMap).reduce((result, [code, key]) => {
            result[code] = key;
            return result;
          }, {})
        : null;

    const info = JSON.stringify(
      {
        version: META.version,
        browser: BROWSER,
        buildTime: BUILD_TIME,
        userAgent: navigator.userAgent,
        language: navigator.language,
        browserInfo,
        platformInfo,
        storage,
        layout,
      },
      undefined,
      2
    );

    const markdown = `
<details>
<summary>Debug info</summary>

\`\`\`json
${info}
\`\`\`

</details>
    `.trim();

    await navigator.clipboard.writeText(markdown);
  } catch (error) {
    log("error", "PopupProgram", "Failed to copy debug info.", error);
  }
}
