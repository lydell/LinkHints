// @flow strict-local

import {
  array,
  fieldsAuto,
  number,
  record,
  string,
  tuple,
} from "tiny-decoders";

export const MAX_PERF_ENTRIES = 9;

export type Durations = ReturnType<typeof decodeDurations>;
export const decodeDurations = array(tuple([string, number]));

export type Stats = ReturnType<typeof decodeStats>;
export const decodeStats = fieldsAuto({
  url: string,
  numTotalElements: number,
  numTrackedElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: number,
  durations: decodeDurations,
});

export type Perf = ReturnType<typeof decodePerf>;
export const decodePerf = array(
  fieldsAuto({
    timeToFirstPaint: number,
    timeToLastPaint: number,
    topDurations: decodeDurations,
    collectStats: array(decodeStats),
    renderDurations: decodeDurations,
  })
);

export type TabsPerf = ReturnType<typeof decodeTabsPerf>;
export const decodeTabsPerf = record(decodePerf);

export class TimeTracker {
  _durations: Durations = [];

  _current: { label: string; timestamp: number } | undefined = undefined;

  start(label: string): void {
    this.stop();

    this._current = {
      label,
      timestamp: Date.now(),
    };
  }

  stop(): void {
    const current = this._current;
    if (current == null) {
      return;
    }

    const duration = Date.now() - current.timestamp;

    const previous = this._durations.find(([label]) => label === current.label);
    if (previous != null) {
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
