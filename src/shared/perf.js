// @flow strict-local

export type Durations = Array<[string, number]>;

export type Stats = {|
  url: string,
  title: string,
  numElements: number,
  numVisibleElements: number,
  numVisibleFrames: number,
  bailed: boolean,
  durations: Durations,
|};

export type Perf = Array<{|
  id: number,
  timeToFirstPaint: number,
  topDurations: Durations,
  collectStats: Array<Stats>,
  renderDurations: Durations,
|}>;

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
