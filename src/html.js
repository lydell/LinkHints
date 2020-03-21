// @flow strict-local

import * as React from "preact";
import renderToString from "preact-render-to-string";

export default ({
  title,
  polyfill,
  js,
  css,
}: {
  title: string,
  polyfill: ?string,
  js: Array<string>,
  css: Array<string>,
}) => {
  const doc = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{title}</title>
        {css.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        {polyfill != null && <script src={polyfill} />}
        {js.map((src) => (
          <script key={src} src={src} />
        ))}
      </body>
    </html>
  );
  return `<!DOCTYPE html>${renderToString(doc)}`;
};
