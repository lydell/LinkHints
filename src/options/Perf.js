// @flow strict-local

import React from "preact";

import {
  type Durations,
  type Stats,
  type TabsPerf,
  MAX_PERF_ENTRIES,
} from "../shared/perf";

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

        const medianDuration = getMedian(
          perfData.map(({ timeToFirstPaint }) => timeToFirstPaint)
        );

        const colSpan = MAX_PERF_ENTRIES + 1;

        const topData = durationsToRows(
          perfData.map(({ topDurations }) => topDurations)
        );

        const allStats = perfData.map(({ collectStats }) => collectStats);
        const noFrames = allStats.every(stats => stats.length === 1);

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

        return (
          <div key={tabId} className="tmp">
            <h2>
              #{tabId}:{" "}
              <abbr title="Median time to first paint in milliseconds.">
                ({formatDuration(medianDuration)})
              </abbr>{" "}
              {perfData[0].collectStats[0].url}
            </h2>

            <table>
              <tr>
                <th>Phase</th>
                {Array.from({ length: MAX_PERF_ENTRIES }, (_, index) => (
                  <th key={index}>{index + 1}</th>
                ))}
              </tr>

              <tr>
                <th>time to first paint</th>
                {perfData.map(({ id, timeToFirstPaint }) => (
                  <td key={id}>{formatDuration(timeToFirstPaint)}</td>
                ))}
              </tr>
              <tr>
                <th>time to last paint</th>
                {perfData.map(({ id, timeToLastPaint }) => (
                  <td key={id}>{formatDuration(timeToLastPaint)}</td>
                ))}
              </tr>

              {allRows.map(({ title, data }) => [
                <tr key={title}>
                  <th colSpan={colSpan}>{title}</th>
                </tr>,
                data.map(({ heading, values }) => (
                  <tr key={`${title}-${heading}`}>
                    <th>{heading}</th>
                    {values.map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                  </tr>
                )),
              ])}
            </table>
          </div>
        );
      })}
    </div>
  );
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
  return String(Math.round(duration));
}

function sumStats(
  title: string,
  allStats: Array<Array<Stats>>
): Array<Array<Stats>> {
  return allStats.map(stats => {
    const sum = fn => stats.reduce((result, item) => result + fn(item), 0);

    return [
      {
        url: title,
        numElements: sum(({ numElements }) => numElements),
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
): Array<{| heading: string, values: Array<string> |}> {
  const labels = new Set(
    [].concat(
      ...allDurations.map(durations => durations.map(([label]) => label))
    )
  );

  return Array.from(labels, label => ({
    heading: label,
    values: allDurations.map(durations => {
      const match = durations.find(([label2]) => label2 === label);
      return match != null ? formatDuration(match[1]) : "-";
    }),
  }));
}

function statsToRows(
  allStats: Array<Array<Stats>>
): Array<{|
  title: string,
  data: Array<{| heading: string, values: Array<string> |}>,
|}> {
  const urls = new Set(
    [].concat(...allStats.map(stats => stats.map(({ url }) => url)))
  );

  return Array.from(urls, url => {
    const allData = allStats.map(stats => {
      const match = stats.find(({ url: url2 }) => url2 === url);
      return match != null
        ? {
            numElements: String(match.numElements),
            numVisibleElements: String(match.numVisibleElements),
            numVisibleFrames: String(match.numVisibleFrames),
            bailed: String(match.bailed),
            durations: match.durations,
          }
        : {
            numElements: "-",
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
          heading: "# elements",
          values: allData.map(({ numElements }) => numElements),
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
