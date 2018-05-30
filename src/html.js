// @flow

module.exports = ({ js }: {| js: string |}) =>
  `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Synth</title>
  </head>
  <body>
    <script src="${js}"></script>
  </body>
</html>
  `.trim();
