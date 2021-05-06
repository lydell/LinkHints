import { addListener, bind, log, Resets } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  ToBackground,
} from "../shared/messages";
import { h } from "./static-preact";

const CONTAINER_ID = "container";

export default class PopupProgram {
  debugInfo = "Debug info was never loaded.";

  resets: Resets = new Resets();

  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  async start(): Promise<void> {
    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    this.sendMessage({ type: "PopupScriptAdded" });

    try {
      this.debugInfo = await getDebugInfo();
    } catch (errorAny) {
      const error = errorAny as Error;
      this.debugInfo = `Failed to get debug info: ${error.message}`;
    }
  }

  stop(): void {
    this.resets.reset();
  }

  async sendMessage(message: FromPopup): Promise<void> {
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

    if (previous != null) {
      previous.remove();
    }

    const errorElement = <p className="Error" />;

    function showError(error: Error | undefined): void {
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
              } catch (errorAny) {
                const error = errorAny as Error;
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
              } catch (errorAny) {
                const error = errorAny as Error;
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
