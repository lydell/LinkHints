// @flow

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  TabState,
  Timestamps,
  ToBackground,
} from "../data/Messages";

const CONTAINER_ID = "container";

export default class PopupProgram {
  resets: Resets;

  constructor() {
    this.resets = new Resets();

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

  async sendMessage(message: FromPopup): Promise<void> {
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
      case "PopupData":
        log.level = message.logLevel;
        if (message.data == null) {
          this.renderDisabled();
        } else {
          this.render(message.data);
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render({ tabId, tabState }: {| tabId: number, tabState: TabState |}) {
    const previous = document.getElementById(CONTAINER_ID);

    if (previous != null) {
      previous.remove();
    }

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.padding = `0 20px`;
    container.style.minWidth = "200px";

    const heading = document.createElement("h2");
    heading.textContent = "Latest durations";
    container.append(heading);

    if (tabState.perf.length > 0) {
      const average = document.createElement("p");
      const averageDuration = getAverage(
        tabState.perf.map(({ startTime, timestamps }) =>
          getMostImportantDuration(startTime, timestamps)
        )
      );
      average.textContent = `Average: ${formatDuration(
        averageDuration
      )} ms (time to first paint)`;
      container.append(average);

      const list = document.createElement("ol");
      list.style.paddingLeft = "1em";
      for (const { startTime, timestamps } of tabState.perf) {
        const mostImportantDuration = getMostImportantDuration(
          startTime,
          timestamps
        );
        const li = document.createElement("li");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = `${formatDuration(mostImportantDuration)} ms`;
        details.append(summary);
        details.append(makeTimestampsList(startTime, timestamps));
        li.append(details);
        list.append(li);
      }
      container.append(list);

      const resetContainer = document.createElement("p");
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Reset";
      reset.onclick = () => {
        this.sendMessage({ type: "ResetPerf" });
      };
      resetContainer.append(reset);
      container.append(resetContainer);
    } else {
      const info = document.createElement("p");
      info.textContent = "(none so far)";
      info.style.fontStyle = "italic";
      container.append(info);
    }

    const pre = document.createElement("pre");
    pre.style.overflowX = "auto";
    pre.textContent = `${tabId} ${JSON.stringify(tabState, undefined, 2)}`;
    container.append(pre);

    if (document.body != null) {
      document.body.append(container);
    }
  }

  renderDisabled() {
    const container = document.createElement("p");
    container.style.minWidth = "250px";
    container.style.textAlign = "center";
    container.textContent = "Synth is not allowed to run on this page.";
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

function getAverage(numbers: Array<number>): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function formatDuration(duration: number): string {
  return duration.toFixed(2);
}

function makeTimestampsList(
  startTime: number,
  timestamps: Timestamps
): HTMLElement {
  const table = document.createElement("table");
  const headingsRow = document.createElement("tr");
  const padding = "0 5px";

  const headings = ["Phase", "Duration\xa0(ms)", "Total\xa0(ms)"];
  for (const [index, heading] of headings.entries()) {
    const th = document.createElement("th");
    th.textContent = heading;
    th.style.textAlign = index === 0 ? "left" : "right";
    th.style.padding = padding;
    headingsRow.append(th);
  }
  table.append(headingsRow);

  let last = startTime;
  for (const key of Object.keys(timestamps)) {
    const timestamp = timestamps[key];
    const duration = timestamp - last;
    const total = timestamp - startTime;
    const tr = document.createElement("tr");
    const items = [key, formatDuration(duration), formatDuration(total)];
    for (const [index, item] of items.entries()) {
      const td = document.createElement("td");
      td.textContent = item;
      td.style.textAlign = index === 0 ? "left" : "right";
      td.style.padding = padding;
      tr.append(td);
    }
    table.append(tr);
    last = timestamp;
  }
  return table;
}

function getMostImportantDuration(
  startTime: number,
  timestamps: Timestamps
): number {
  return timestamps.paint1 - startTime;
}
