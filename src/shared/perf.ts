import {
  array,
  fieldsAuto,
  number,
  record,
  string,
  tuple,
} from "tiny-decoders";

export const MAX_PERF_ENTRIES = 9;

export type Durations = ReturnType<typeof Durations>;
export const Durations = array(tuple([string, number]));

export type Stats = ReturnType<typeof Stats>;
export const Stats = fieldsAuto({
  url: string,
  numTotalElements: number,
  numTrackedElements: number,
  numVisibleFrames: number,
  durations: Durations,
});

export type Perf = ReturnType<typeof Perf>;
export const Perf = array(
  fieldsAuto({
    timeToFirstPaint: number,
    timeToLastPaint: number,
    topDurations: Durations,
    collectStats: array(Stats),
    renderDurations: Durations,
  })
);

export type TabsPerf = ReturnType<typeof TabsPerf>;
export const TabsPerf = record(Perf);

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
    if (current === undefined) {
      return;
    }

    const duration = Date.now() - current.timestamp;

    const previous = this._durations.find(([label]) => label === current.label);
    if (previous !== undefined) {
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
