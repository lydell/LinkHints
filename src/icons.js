// @flow

const writeFile = require("write");

const config = require("../project.config");

type Point = [number, number];

type Colors = {|
  edges: string,
  surface: string,
  pointer: string,
|};

const COLORS = {
  light: {
    pointer: "#323234",
    edges: "#bebebe",
    surface: "#ddd",
  },
  dark: {
    pointer: "#f5f6f7",
    edges: "#5a5b5c",
    surface: "#777",
  },
};

const BACKGROUND_COLORS = {
  light: "#f5f6f7",
  dark: "#323234",
};

// start
//   |\
//   | \
//   |  \
//   |   \
//   |    \
//   |     \
//   |l2 r2_\
//   | /\ \  r1
//   |/  \ \
// l1     \_\
//       l3  r3
function pointer({
  height,
  inset,
  tailLength,
}: {|
  height: number, // start–l1, start–r1
  inset: number, // l1–l2, r1–r2
  tailLength: number, // l2–l3, r2–r3
|}): Array<Point> {
  const start = [0, 0];

  const l1 = go({ fromPoint: start, angle: -90, length: height });
  const l2 = go({ fromPoint: l1, angle: 45, length: inset });
  const l3 = go({ fromPoint: l2, angle: -67.5, length: tailLength });

  const r1 = go({ fromPoint: start, angle: -45, length: height });
  const r2 = go({ fromPoint: r1, angle: 180, length: inset });
  const r3 = go({ fromPoint: r2, angle: -67.5, length: tailLength });

  return [l3, l2, l1, start, r1, r2, r3];
}

// Starting at (x, y), go `length` units in the direction of `angle`, which is
// measured between the x axis and the resulting vector.
function go({
  fromPoint: [x, y],
  angle,
  length,
}: {|
  fromPoint: Point,
  angle: number,
  length: number,
|}): Point {
  // First make a vector with the requested length.
  const point = [length, 0];
  // Then rotate it by the requested angle.
  const [a, b] = rotate(point, angle);
  // Finally move it so it starts at (x, y).
  return [a + x, b + y];
}

function rotate([x, y]: Point, angle: number): Point {
  const r = toRadians(angle);
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

function toRadians(degrees: number): number {
  return degrees / 180 * Math.PI;
}

function render(size: number, colors: Colors): string {
  const surfaceRect = {
    left: size * (1 / 8),
    top: size * (1 / 24),
    width: size * (3 / 4),
    height: size * (5 / 6),
  };

  const numSparks = 6;
  const sparkOffset = size * (1 / 12);
  const sparkLength = size * (1 / 12);
  const sparkWidth = size * (1 / 24);
  const sparkAngle = 7.5;

  const sparkLeft = sparkLength + sparkOffset;
  const sparkTop =
    (sparkLength + sparkOffset) * Math.cos(toRadians(sparkAngle));

  const pointerPoints = pointer({
    height: size * (2 / 5),
    inset: size * 0.135,
    tailLength: size * (1 / 5),
  });

  const pointerWidth = Math.max(...pointerPoints.map(([x]) => x));
  const pointerHeight = Math.max(...pointerPoints.map(([, y]) => -y));

  const pointerLeft = Math.round(
    surfaceRect.left + (surfaceRect.width - pointerWidth) / 2 + sparkLeft / 2
  );
  const pointerTop = Math.round(
    surfaceRect.top + (surfaceRect.height - pointerHeight) / 2 + sparkTop / 2
  );

  const sparks = Array.from({ length: numSparks - 1 }, (_, n) => {
    const angle = -n * (360 / numSparks) + sparkAngle;

    const [x1, y1] = go({
      fromPoint: [pointerLeft, pointerTop],
      angle,
      length: sparkOffset,
    });

    const [x2, y2] = go({ fromPoint: [x1, y1], angle, length: sparkLength });

    return tag(
      "line",
      {
        x1: float(x1),
        y1: float(y1),
        x2: float(x2),
        y2: float(y2),
        stroke: colors.pointer,
        "stroke-width": float(Math.max(1, sparkWidth)),
        "stroke-linecap": "round",
      },
      []
    );
  });

  const pointerPointsString = pointerPoints
    .map(([x, y]) => `${float(pointerLeft + x)},${float(pointerTop - y)}`)
    .join(" ");

  const edgesRadius = integer(Math.max(2, size * (1 / 12)));
  const surfaceRadius = integer(Math.max(2, size * (1 / 16)));

  return tag(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${size} ${size}`,
      width: String(size),
      height: String(size),
    },
    [
      tag(
        "rect",
        {
          x: "0",
          y: "0",
          width: integer(size),
          height: integer(size),
          rx: edgesRadius,
          ry: edgesRadius,
          fill: colors.edges,
        },
        []
      ),
      tag(
        "rect",
        {
          x: integer(surfaceRect.left),
          y: integer(surfaceRect.top),
          width: integer(surfaceRect.width),
          height: integer(surfaceRect.height),
          rx: surfaceRadius,
          ry: surfaceRadius,
          fill: colors.surface,
        },
        []
      ),
      tag(
        "polygon",
        {
          points: pointerPointsString,
          fill: colors.pointer,
        },
        []
      ),
      ...sparks,
    ]
  );
}

function tag(
  name: string,
  attributes: { [key: string]: string },
  children: Array<string>
): string {
  const attributesString = Object.entries(attributes)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(" ");
  return [
    "<",
    name,
    ...(attributesString === "" ? [] : [" ", attributesString]),
    ...(children.length === 0
      ? [" />"]
      : [
          ">\n",
          ...children.map(child => `${indent(child)}\n`),
          "</",
          name,
          ">",
        ]),
  ].join("");
}

function indent(string: string): string {
  return string.replace(/^(?!$)/gm, "  ");
}

function float(number: number): string {
  return number
    .toFixed(2)
    .replace(/\.[1-9]*0+$/, "")
    .replace(/\.$/, "");
}

function integer(number: number): string {
  return String(Math.round(number));
}

function renderTestPage() {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Icons</title>
    <style>
      body {
        display: flex;
        flex-direction: column;
        margin: 0;
        min-height: 100vh;
      }

      .container {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 15px;
      }

      .container > * + * {
        margin-left: 10px;
      }
    </style>
  </head>
  <body>
    ${testContainer(config.icons.light, BACKGROUND_COLORS.dark)}
    ${testContainer(config.icons.dark, BACKGROUND_COLORS.light)}
    ${testContainer(config.icons.png, BACKGROUND_COLORS.light)}
  </body>
</html>
  `.trim();
}

function testContainer(icons: Array<[number, string]>, color: string): string {
  return `
<div class="container" style="background-color: ${color};">
  ${icons.map(([, path]) => `<img src="../${path}">`).join("\n  ")}
</div>
  `.trim();
}

module.exports = () => {
  const all = [
    { icons: config.icons.light, colors: COLORS.light },
    { icons: config.icons.dark, colors: COLORS.dark },
  ];

  for (const { icons, colors } of all) {
    for (const [size, path] of icons) {
      writeFile.sync(`${config.src}/${path}`, render(size, colors));
    }
  }

  writeFile.sync(`${config.src}/${config.icons.testPage}`, renderTestPage());

  return render(96, COLORS.light);
};
