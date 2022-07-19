import { addListener, fireAndForget, log, Resets } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  ToBackground,
} from "../shared/messages";
import { h } from "./static-preact";

const CONTAINER_ID = "container";

export default class PopupProgram {
  debugInfo = "Debug info was never loaded.";

  resets = new Resets();

  async start(): Promise<void> {
    log("log", "PopupProgram#start");

    this.resets.add(
      addListener(
        browser.runtime.onMessage,
        this.onMessage.bind(this),
        "PopupProgram#onMessage"
      )
    );

    this.sendMessage({ type: "PopupScriptAdded" });

    try {
      this.debugInfo = await getDebugInfo();
    } catch (errorAny) {
      const error = errorAny as Error;
      this.debugInfo = `Failed to get debug info: ${error.message}`;
    }
  }

  stop(): void {
    log("log", "PopupProgram#stop");
    this.resets.reset();
  }

  sendMessage(message: FromPopup): void {
    log("log", "PopupProgram#sendMessage", message.type, message, this);
    fireAndForget(
      browser.runtime.sendMessage(wrapMessage(message)).then(() => undefined),
      "PopupProgram#sendMessage",
      message
    );
  }

  // Technically, `ToWorker` and `ToRenderer` messages (which are part of
  // `FromBackground`) can never appear here, since they are sent using
  // `browser.tabs.sendMessage` rather than `browser.runtime.sendMessage`.
  // Instead, `FromWorker` and `FromRenderer` messages can appear (which are
  // part of `ToBackground`)! That's because a popup counts as a background
  // script, which can receive messages from content scripts. So the
  // `FromBackground` type annotation isn't entirely true, but the
  // `wrappedMessage.type` check narrows the messages down correctly anyway.
  onMessage(wrappedMessage: FromBackground): void {
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
    }
  }

  render({ isEnabled }: { isEnabled: boolean }): void {
    const previous = document.getElementById(CONTAINER_ID);

    if (previous !== null) {
      previous.remove();
    }

    const errorElement = <p className="Error" />;

    function showError(error: Error | undefined): void {
      errorElement.textContent =
        error !== undefined ? error.message : "An unknown error ocurred.";
    }

    const container = (
      <div id={CONTAINER_ID} className="Container">
        <div>
          <h1>
            {META_NAME} {META_VERSION}
          </h1>

          <p>
            <a href={META_HOMEPAGE} target="_blank" rel="noreferrer">
              Homepage
            </a>
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
            onClick={() => {
              browser.runtime
                .openOptionsPage()
                .then(() => {
                  window.close();
                })
                .catch((error: Error) => {
                  showError(error);
                });
            }}
          >
            Options
          </button>

          <button
            type="button"
            className="browser-style"
            onClick={() => {
              navigator.clipboard
                .writeText(this.debugInfo)
                .then(() => {
                  window.close();
                })
                .catch((error: Error) => {
                  showError(error);
                });
            }}
          >
            Copy debug info
          </button>
        </p>

        {errorElement}
      </div>
    );

    document.body.append(container);
  }
}

function wrapMessage(message: FromPopup): ToBackground {
  return {
    type: "FromPopup",
    message,
  };
}

async function getDebugInfo(): Promise<string> {
  const [browserInfo, platformInfo, storageSync, storageLocal, layoutMap] =
    await Promise.all([
      typeof browser.runtime.getBrowserInfo === "function"
        ? browser.runtime.getBrowserInfo()
        : undefined,
      browser.runtime.getPlatformInfo(),
      browser.storage.sync.get(),
      browser.storage.local.get(),
      // Handle disabled Keyboard API in Brave.
      // See: https://github.com/brave/brave-core/pull/10935
      navigator.keyboard !== undefined && navigator.keyboard !== null
        ? navigator.keyboard.getLayoutMap()
        : undefined,
    ]);

  const layout =
    layoutMap !== undefined ? Object.fromEntries(layoutMap) : undefined;

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
