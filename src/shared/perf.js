// @flow

export type Durations = Array<[string, number]>;

export type Perf = Array<{|
  timeToFirstPaint: number,
  topDurations: Durations,
  collectDurations: Array<{| url: string, durations: Durations |}>,
  renderDurations: Durations,
|}>;

export class TimeTracker {
  _durations: Durations;
  _current: ?{| label: string, timestamp: number |};

  constructor() {
    this._durations = [];
    this._current = undefined;
  }

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
    return this._durations;
  }
}
