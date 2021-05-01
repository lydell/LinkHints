// @flow strict-local

import { addListener, bind, log, Resets, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  ToBackground,
} from "../shared/messages";
import React from "./static-react";

const CONTAINER_ID = "container";

export default class PopupProgram {
  debugInfo: string = "Debug info was never loaded.";
  resets: Resets = new Resets();

  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  async start() {
    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    this.sendMessage({ type: "PopupScriptAdded" });

    try {
      this.debugInfo = await getDebugInfo();
    } catch (error) {
      this.debugInfo = `Failed to get debug info: ${error.message}`;
    }
  }

  stop() {
    this.resets.reset();
  }

  async sendMessage(message: FromPopup) {
    log("log", "PopupProgram#sendMessage", message.type, message, this);
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

    log("log", "PopupProgram#onMessage", message.type, message, this);

    switch (message.type) {
      case "Init":
        log.level = message.logLevel;
        this.render({ isEnabled: message.isEnabled });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render({ isEnabled }: { isEnabled: boolean }) {
    const previous = document.getElementById(CONTAINER_ID);

    if (previous != null) {
      previous.remove();
    }

    const errorElement = <p className="Error" />;

    function showError(error: ?Error) {
      errorElement.textContent =
        error != null ? error.message : "An unknown error ocurred.";
    }

    const container = (
      <div id={CONTAINER_ID} className="Container">
        <div>
          <h1>
            {META_NAME} {META_VERSION}
          </h1>

          <p>
            <a href={META_HOMEPAGE}>Homepage</a>
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
              try {
                await browser.runtime.openOptionsPage();
                window.close();
              } catch (error) {
                showError(error);
              }
            }}
          >
            Options
          </button>

          <button
            type="button"
            className="browser-style"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(this.debugInfo);
                window.close();
              } catch (error) {
                showError(error);
              }
            }}
          >
            Copy debug info
          </button>
        </p>

        {errorElement}
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

async function getDebugInfo(): Promise<string> {
  const [
    browserInfo,
    platformInfo,
    storageSync,
    storageLocal,
    layoutMap,
  ] = await Promise.all([
    typeof browser.runtime.getBrowserInfo === "function"
      ? browser.runtime.getBrowserInfo()
      : null,
    browser.runtime.getPlatformInfo(),
    browser.storage.sync.get(),
    browser.storage.local.get(),
    // $FlowIgnore: Flow doesn’t know about `navigator.keyboard` yet.
    navigator.keyboard != null ? navigator.keyboard.getLayoutMap() : null,
  ]);

  const layout = layoutMap != null ? Object.fromEntries(layoutMap) : null;

  const info = JSON.stringify(
    {
      version: META_VERSION,
      browser: BROWSER,
      userAgent: navigator.userAgent,
      browserInfo,
      platformInfo,
      "storage.sync": storageSync,
      "storage.local": storageLocal,
      language: navigator.language,
      layout,
    },
    undefined,
    2
  );

  return `
<details>
<summary>Debug info</summary>

\`\`\`json
${info}
\`\`\`

</details>
    `.trim();
}
