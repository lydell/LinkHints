// @flow strict-local

module.exports = ({
  polyfill,
  js,
}: {|
  polyfill: ?string,
  js: Array<string>,
|}) =>
  `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Synth</title>
  </head>
  <body>
    ${polyfill == null ? "" : `<script src="${polyfill}"></script>`}
    ${js.map(src => `<script src="${src}"></script>`).join("\n    ")}
  </body>
</html>
  `.trim();
