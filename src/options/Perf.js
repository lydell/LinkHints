// @flow strict-local
import * as React from "preact";

import { classlist } from "../shared/main";
import {
  type Durations,
  type Stats,
  type TabsPerf,
  MAX_PERF_ENTRIES,
} from "../shared/perf";

export default function Perf({
  perf,
  expandedPerfTabIds,
  onExpandChange,
  onReset,
}: {
  perf: TabsPerf,
  expandedPerfTabIds: Array<string>,
  onExpandChange: (Array<string>) => void,
  onReset: () => void,
}) {
  const keys = Object.keys(perf);

  const isEmpty = keys.every((tabId) => perf[tabId].length === 0);

  return (
    <div className="SpacedVertical SpacedVertical--large">
      <div className="Intro" style={{ paddingBottom: 0 }}>
        <div className="Spaced">
          <div>
            <p>
              Here you can see some numbers on how entering hints mode the last{" "}
              {MAX_PERF_ENTRIES} times has performed. Most numbers are
              milliseconds.
            </p>

            {isEmpty && (
              <p>
                <strong>
                  Enter hints mode in a tab and stats will appear here!
                </strong>
              </p>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={isEmpty}
              title="Data is only stored in memory and is removed automatically when tabs are closed or the whole browser is closed."
              onClick={() => {
                onReset();
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {keys.map((tabId) => {
        const perfData = perf[tabId];
        if (perfData.length === 0) {
          return null;
        }

        const medianDuration = getMedian(
          perfData.map(({ timeToFirstPaint }) => timeToFirstPaint)
        );

        const topData = durationsToRows(
          perfData.map(({ topDurations }) => topDurations)
        );

        const allStats = perfData.map(({ collectStats }) => collectStats);
        const noFrames = allStats.every((stats) => stats.length === 1);
        const collectRows = statsToRows(
          sumStats(noFrames ? "(no frames)" : "total", allStats)
        ).concat(noFrames ? [] : statsToRows(allStats));

        const renderData = durationsToRows(
          perfData.map(({ renderDurations }) => renderDurations)
        );

        const allRows = [
          { title: "Top", data: topData },
          ...collectRows,
          { title: "Render", data: renderData },
        ];

        const expanded = expandedPerfTabIds.includes(tabId);

        return (
          <table key={tabId} className="PerfTable TextSmall">
            <caption className={classlist("Toggle", { "is-open": expanded })}>
              <button
                type="button"
                onClick={() => {
                  onExpandChange(
                    expandedPerfTabIds
                      .filter((id) => id !== tabId)
                      .concat(expanded ? [] : [tabId])
                  );
                }}
              >
                <span title={`Tab ID: ${tabId}`}>#{tabId}</span>
                {" – "}
                <span title="Median time to first paint in milliseconds.">
                  {formatDuration(medianDuration)} ms
                </span>
                {" – "}
                {Array.from(
                  new Set(
                    perfData.map(({ collectStats }) => collectStats[0].url)
                  )
                ).join(" | ")}
              </button>
            </caption>

            {expanded && (
              <thead>
                <tr>
                  <th>Phase</th>
                  {Array.from({ length: MAX_PERF_ENTRIES }, (_, index) => (
                    <th key={index}>
                      <span
                        title={
                          index < perfData.length
                            ? perfData[index].collectStats[0].url
                            : undefined
                        }
                      >
                        {index + 1}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
            )}

            {expanded && (
              <tbody>
                <tr className="PerfTable-alternate">
                  <th>time to first paint</th>
                  {toCells(
                    perfData.map(({ timeToFirstPaint }) =>
                      formatDuration(timeToFirstPaint)
                    )
                  )}
                </tr>
                <tr>
                  <th>time to last paint</th>
                  {toCells(
                    perfData.map(({ timeToLastPaint }) =>
                      formatDuration(timeToLastPaint)
                    )
                  )}
                </tr>

                {allRows.map(({ title, data }) => (
                  <>
                    <tr>
                      <th colSpan={MAX_PERF_ENTRIES + 1}>{title}</th>
                    </tr>
                    {data.map(({ heading, values }, index) => (
                      <tr
                        key={`${title}-${heading}`}
                        className={classlist({
                          "PerfTable-alternate": index % 2 === 0,
                        })}
                      >
                        <th>{heading}</th>
                        {toCells(values)}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            )}
          </table>
        );
      })}
    </div>
  );
}

function toCells(items: Array<string>): Array<React.Node> {
  const lastIndex = items.length - 1;
  return Array.from({ length: MAX_PERF_ENTRIES }, (_, index) => (
    <td key={index}>{index <= lastIndex ? items[index] : null}</td>
  ));
}

function getMedian(numbers: Array<number>): number {
  const sorted = numbers.slice().sort();
  if (sorted.length === 0) {
    return 0;
  }
  const mid = sorted.length / 2;
  if (Number.isInteger(mid)) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[Math.floor(mid)];
}

function formatDuration(duration: number): string {
  return Math.round(duration).toString();
}

function sumStats(
  title: string,
  allStats: Array<Array<Stats>>
): Array<Array<Stats>> {
  return allStats.map((stats) => {
    const sum = (fn) => stats.reduce((result, item) => result + fn(item), 0);

    return [
      {
        url: title,
        numTotalElements: sum(({ numTotalElements }) => numTotalElements),
        numTrackedElements: sum(({ numTrackedElements }) => numTrackedElements),
        numVisibleElements: sum(({ numVisibleElements }) => numVisibleElements),
        numVisibleFrames: sum(({ numVisibleFrames }) => numVisibleFrames),
        bailed: sum(({ bailed }) => bailed),
        durations: sumDurations(stats.map(({ durations }) => durations)),
      },
    ];
  });
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

function durationsToRows(
  allDurations: Array<Durations>
): Array<{ heading: string, values: Array<string> }> {
  const labels = new Set(
    allDurations.flatMap((durations) => durations.map(([label]) => label))
  );

  return Array.from(labels, (label) => ({
    heading: label,
    values: allDurations.map((durations) => {
      const match = durations.find(([label2]) => label2 === label);
      return match != null ? formatDuration(match[1]) : "-";
    }),
  }));
}

function statsToRows(
  allStats: Array<Array<Stats>>
): Array<{
  title: string,
  data: Array<{ heading: string, values: Array<string> }>,
}> {
  const urls = new Set(
    allStats.flatMap((stats) => stats.map(({ url }) => url))
  );

  return Array.from(urls, (url) => {
    const allData = allStats.map((stats) => {
      const match = stats.find(({ url: url2 }) => url2 === url);
      return match != null
        ? {
            numTotalElements: match.numTotalElements.toString(),
            numTrackedElements: match.numTrackedElements.toString(),
            numVisibleElements: match.numVisibleElements.toString(),
            numVisibleFrames: match.numVisibleFrames.toString(),
            bailed: match.bailed.toString(),
            durations: match.durations,
          }
        : {
            numTotalElements: "-",
            numTrackedElements: "-",
            numVisibleElements: "-",
            numVisibleFrames: "-",
            bailed: "-",
            durations: [],
          };
    });

    return {
      title: `Collect ${url}`,
      data: [
        ...durationsToRows(allData.map(({ durations }) => durations)),
        {
          heading: "# total elements",
          values: allData.map(({ numTotalElements }) => numTotalElements),
        },
        {
          heading: "# tracked elements",
          values: allData.map(({ numTrackedElements }) => numTrackedElements),
        },
        {
          heading: "# visible elements",
          values: allData.map(({ numVisibleElements }) => numVisibleElements),
        },
        {
          heading: "# visible frames",
          values: allData.map(({ numVisibleFrames }) => numVisibleFrames),
        },
        {
          heading: "# bailed",
          values: allData.map(({ bailed }) => bailed),
        },
      ],
    };
  });
}
