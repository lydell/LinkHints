// @flow strict-local

import {
  array,
  dict,
  field,
  group,
  map,
  number,
  record,
  string,
} from "tiny-decoders";

export const MAX_PERF_ENTRIES = 9;

export type Durations = Array<[string, number]>;

export const decodeDurations: mixed => Durations = array(
  map(
    group({
      label: field(0, string),
      value: field(1, number),
    }),
    ({ label, value }) => [label, value]
  )
);

export type Stats = {|
  url: string,
  numElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: number,
  durations: Durations,
|};

export const decodeStats: mixed => Stats = record({
  url: string,
  numElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: number,
  durations: decodeDurations,
});

export type Perf = Array<{|
  timeToFirstPaint: number,
  timeToLastPaint: number,
  topDurations: Durations,
  collectStats: Array<Stats>,
  renderDurations: Durations,
|}>;

export const decodePerf: mixed => Perf = array(
  record({
    timeToFirstPaint: number,
    timeToLastPaint: number,
    topDurations: decodeDurations,
    collectStats: array(decodeStats),
    renderDurations: decodeDurations,
  })
);

export type TabsPerf = { [tabId: string]: Perf, ... };

export const decodeTabsPerf: mixed => TabsPerf = dict(decodePerf);

export class TimeTracker {
  _durations: Durations = [];
  _current: ?{| label: string, timestamp: number |} = undefined;

  start(label: string) {
    this.stop();

    this._current = {
      label,
      timestamp: performance.now(),
    };
  }

  stop() {
    const current = this._current;
    if (current == null) {
      return;
    }

    const duration = performance.now() - current.timestamp;
    this._durations.push([current.label, duration]);
    this._current = undefined;
  }

  export(): Durations {
    this.stop();
    return this._durations.slice();
  }
}
