import { h } from "preact";
import renderToString from "preact-render-to-string";

export default ({
  title,
  js,
  css,
}: {
  title: string;
  js: Array<string>;
  css: Array<string>;
}): string => {
  const doc = (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
        {css.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        {js.map((src) => (
          <script key={src} src={src} />
        ))}
      </body>
    </html>
  );
  return `<!DOCTYPE html>${renderToString(doc)}`;
};
