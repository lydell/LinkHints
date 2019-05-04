// @flow strict-local

import React from "preact";

import { type Durations, type TabsPerf } from "../shared/perf";

type Props = {|
  perf: TabsPerf,
|};

export default function Perf({ perf }: Props) {
  return (
    <div className="SpacedVertical">
      {Object.keys(perf).map(tabId => {
        const perfData = perf[tabId];
        if (perfData.length === 0) {
          return null;
        }

        const averageDuration = getAverage(
          perfData.map(({ timeToFirstPaint }) => timeToFirstPaint)
        );

        return (
          <div key={tabId} className="tmp">
            <h2>
              #{tabId}: {perfData[0].collectStats[0].url}
            </h2>

            <p>
              Average: {formatDuration(averageDuration)} ms (time to first
              paint)
            </p>

            {perfData.map(
              (
                {
                  timeToFirstPaint,
                  topDurations,
                  collectStats,
                  renderDurations,
                },
                perfIndex
              ) => {
                const collectTables =
                  collectStats.length === 1
                    ? [["Collect (no frames)", collectStats[0].durations]]
                    : [
                        [
                          "Collect total",
                          sumDurations(
                            collectStats.map(({ durations }) => durations)
                          ),
                        ],
                        ...collectStats.map(({ url, durations }) => [
                          `Collect ${url}`,
                          durations,
                        ]),
                      ];
                const tables = [
                  ["Top", topDurations],
                  ...collectTables,
                  ["Render", renderDurations],
                ];

                return (
                  <div key={perfIndex}>
                    <h3>{formatDuration(timeToFirstPaint)} ms</h3>
                    {tables.map(([caption, durations]) => {
                      const [durationsWithTotal] = durations.reduce(
                        ([list, prevTotal], [label, value]) => {
                          const total = prevTotal + value;
                          return [list.concat({ label, value, total }), total];
                        },
                        [[], 0]
                      );
                      return (
                        <table key={caption}>
                          <caption>{caption}</caption>
                          <tbody>
                            <tr>
                              <th>Phase</th>
                              <th>Duration (ms)</th>
                              <th>Total (ms)</th>
                            </tr>
                            {durationsWithTotal.map(
                              ({ label, value, total }, index) => (
                                <tr key={index}>
                                  <td>{label}</td>
                                  <td>{formatDuration(value)}</td>
                                  <td>{formatDuration(total)}</td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      );
                    })}
                  </div>
                );
              }
            )}
          </div>
        );
      })}
    </div>
  );
}

function getAverage(numbers: Array<number>): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function formatDuration(duration: number): string {
  return duration.toFixed(2);
}

function sumDurations(allDurations: Array<Durations>): Durations {
  const result: Map<string, number> = new Map();

  for (const durations of allDurations) {
    for (const [label, duration] of durations) {
      const previous = result.get(label) || 0;
      result.set(label, previous + duration);
    }
  }

  return Array.from(result);
}
