import { ComponentChildren, h, VNode } from "preact";

import config from "../project.config";

export default function Page({
  title,
  description,
  css,
  children,
}: {
  title: string;
  description: string;
  css: string;
  children: ComponentChildren;
}): VNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta name="description" content={description} />
        {config.docs.favicons.map(({ output, size }) => (
          <link
            key={output}
            rel="icon"
            type="image/png"
            sizes={`${size}x${size}`}
            href={`${config.docs.root}/${config.docs.iconsDir}/${output}`}
          />
        ))}
        <link
          rel="stylesheet"
          href={`${config.docs.root}/${config.docs.sharedCss.output}`}
        />
        <link rel="stylesheet" href={`${config.docs.root}/${css}`} />
      </head>
      <body>{children}</body>
    </html>
  );
}
