// @flow strict-local

module.exports = ({ polyfill, js }: {| polyfill: ?string, js: string |}) =>
  `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Synth</title>
  </head>
  <body>
    ${polyfill == null ? "" : `<script src="${polyfill}"></script>`}
    <script src="${js}"></script>
  </body>
</html>
  `.trim();
