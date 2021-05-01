// @flow strict-local

import {
  type Decoder,
  array,
  autoRecord,
  dict,
  number,
  pair,
  string,
} from "tiny-decoders";

export const MAX_PERF_ENTRIES = 9;

export type Durations = Array<[string, number]>;

export const decodeDurations: Decoder<Durations> = array(pair(string, number));

export type Stats = {
  url: string,
  numTotalElements: number,
  numTrackedElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: number,
  durations: Durations,
};

export const decodeStats: Decoder<Stats> = autoRecord({
  url: string,
  numTotalElements: number,
  numTrackedElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: number,
  durations: decodeDurations,
});

export type Perf = Array<{
  timeToFirstPaint: number,
  timeToLastPaint: number,
  topDurations: Durations,
  collectStats: Array<Stats>,
  renderDurations: Durations,
}>;

export const decodePerf: Decoder<Perf> = array(
  autoRecord({
    timeToFirstPaint: number,
    timeToLastPaint: number,
    topDurations: decodeDurations,
    collectStats: array(decodeStats),
    renderDurations: decodeDurations,
  })
);

export type TabsPerf = { [tabId: string]: Perf, ... };

export const decodeTabsPerf: Decoder<TabsPerf> = dict(decodePerf);

export class TimeTracker {
  _durations: Durations = [];
  _current: ?{ label: string, timestamp: number } = undefined;

  start(label: string) {
    this.stop();

    this._current = {
      label,
      timestamp: Date.now(),
    };
  }

  stop() {
    const current = this._current;
    if (current == null) {
      return;
    }

    const duration = Date.now() - current.timestamp;

    const previous = this._durations.find(([label]) => label === current.label);
    if (previous) {
      previous[1] += duration;
    } else {
      this._durations.push([current.label, duration]);
    }

    this._current = undefined;
  }

  export(): Durations {
    this.stop();
    return this._durations.slice();
  }
}
