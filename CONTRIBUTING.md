# Issues

The easiest way to open issue is to [follow one of the templates](https://github.com/lydell/LinkHints/issues/new/choose).

It’s always helpful if you include debug info (Link Hints version, browser version, configuration, etc.). Click the Link Hints toolbar button, press “Copy debug info” and paste in the issue.

# Pull requests

If you’d like to make a pull request, here’s what you need to know.

## Requirements

- [Node.js] 18 with npm 8.
- Latest [Chrome] or [Chromium].
- Latest [Firefox Developer Edition] or [Firefox Nightly].

## Get started

1. Clone this repository.
2. Run `npm ci` to install dependencies.
3. Run `npm test` to verify the installation.

## Technology used

- [web-ext] for development, building and linting.
- [Rollup] for `import`/`export` and npm package support.
- [TypeScript] for type checking.
- [ESLint] for linting.
- [Prettier] for automatic code formatting.
- [Sucrase] for compiling TypeScript type annotation and JSX.
- [Preact] for easily making the options UI and the website.
- [WebExtension Polyfill] for using the `browser` API both in Chrome and Firefox.

## File overview

- The repo root contains mostly configuration files.
- `src/` contains the source code for the extension.
- `scripts/` contains a couple of build scripts.
- `html/` contains lots of test pages for the extension.
- `docs/` contains the source code for the website (<https://lydell.github.io/LinkHints/>).
- `@types/` contains TypeScript declarations, for npm packages that lack them and for global variables.

These directories are generated and gitignored:

- `compiled/` is the compiled version of `src/`.
- `compiled-docs/` is the compiled version of `docs/` and is served on <https://lydell.github.io/LinkHints/>.
- `dist-chrome/` and `dist-firefox/` contains production builds of the extension.

The most important files:

- `project.config.ts` contains information about the whole project, all in one place. Other config files and build scripts read from it. For example, it maps entrypoint files in `src/` to output files in `compiled/`.
- `rollup.config.js` defines how `compiled/` is made. Rollup compiles and bundles JavaScript; generates `manifest.json`, HTML files and SVG icons; copies the [WebExtension Polyfill], CSS files, and PNG icons; and defines a couple of global variables (see also `@types/globals.d.ts`).
- `web-ext-config.cjs` configures [web-ext], both for building and for running.
- `custom.config.example.cjs` can be copied into `custom.config.cjs` to customize `web-ext run` as well as default options for development.
- `src/manifest.ts` is called via Rollup and generates `manifest.json`. In fact, all `.ts` files directly inside `src/` are called via Rollup and generate other files.
- `src/icons.tsx` generates all SVG icons (even outside `compiled/`). `src/icons/` contains PNG versions of those. They can be updated by running `npm run png-icons` (which requires [Inkscape] and [OptiPNG]). You can preview all icons by opening `compiled/icons/test.html` in a browser.
- `src/html.tsx` generates HTML files. All HTML files are very minimal. JavaScript is used to render content.
- `src/css.ts` injects the colors defined in `project.config.ts` into CSS files.

Compilation pipeline:

```
       project.config.ts                                     .--> dist-chrome/
       rollup.config.js                 web-ext-config.cjs  /
src/ ---------------------> compiled/ ----------------------
                                                            \
                                                             '--> dist-firefox/
```

Code structure:

- `src/background/` contains the main code of the extension.
- `src/worker/` is loaded into every frame of every tab and is responsible for listening to key presses and keeping track of clickable elements.
- `src/renderer/` is loaded into the top frame of every tab and draws the link hints and text underlines.
- `src/popup/` renders the toolbar button popup.
- `src/options/` renders the options UI.
- `src/shared/` contains functions and types shared by all of the above.

All of the above directories, except `src/shared/`, have a `Program.ts` file with a `Program` class inside. The different “programs” talk to each by exchanging messages with `src/background/`. The messages are defined in `src/shared/messages.ts`. The `Program.ts` files are bootstrapped from the `main.ts` files next to them, which are the main entrypoints.

## Development

When developing, you need to start a watcher (Rollup) that compiles the code as you change it:

```
npm run watch
```

It is recommended to set up [TypeScript], [ESLint] and [Prettier] integrations in your editor. You can also run these tools from the command line:

- `npx tsc`
- `npx eslint . --fix`
- `npx prettier . --write`

See `package.json` for details and additional scripts.

### Chrome and Firefox

Open Chrome/Firefox, with a new profile where Link Hints is pre-installed:

```
npm run chrome
# or:
npm run firefox
```

The extension is automatically reloaded when files inside `compiled/` change.

The above commands are wrappers around `web-ext run`. To customize how Chrome/Firefox is run, copy `custom.config.example.cjs` to `custom.config.cjs`. The latter file is gitignored, so you can change it however you wish.

#### Manual workflow in Chrome

It’s also possible to develop in Chrome without using `npm run chrome`.

1. Open `chrome://extensions`.
2. Enable “Developer mode” there.
3. Click “Load unpacked”.
4. Choose the `compiled/` directory in this repo.

Link Hints should now be installed. You need to press the refresh button after you make changes to the code.

### Shortcut

`npm start` starts `npm run watch`, `npm run firefox` and `npm run chrome` all at once using [run-pty].

### Website

Open `compiled-docs/index.html` in a browser.

## Installation

If you want to install a locally built version of Link Hints, follow these instructions.

### Chrome

You can install Link Hints as an “unpacked” extension, as mentioned in the [Manual workflow in Chrome](#manual-workflow-in-chrome) section.

However, for daily use you might not want to depend on the `compiled/` directory to always exist and contain correct files. For example, if you run `npm run build:firefox`, the `compiled/` directory will contain Firefox-specific code and won’t work in Chrome.

The alternative is to pack the extension and install that.

1. Run `npm run build:chrome`.
2. Open `chrome://extensions`.
3. Enable “Developer mode” there.
4. Drag and drop `dist-chrome/link_hints-X.X.X.crx` into the page. (Note: `.crx`, not `.zip`.)

Note: The first time you run `npm run build:chrome`, the file `dist-chrome/key.pem` is generated. Keep that file. Otherwise Chrome will install a duplicate Link Hints rather than update the previous version the next time you build and install.

### Firefox

Note: Regular Firefox does not allow installing _unsigned_ extensions. You can [sign the extension][sign] yourself, but it’s easier to use [Firefox Developer Edition] instead. (You can also use [Firefox Nightly] or [unbranded builds]).

1. Run `npm run build:firefox`.
2. Go to `about:config`.
3. Set `xpinstall.signatures.required` to `false`. (Note: This does not work in regular Firefox – see above.)
4. Go to `File > Open File…` or press `ctrl+O`.
5. Choose `dist-firefox/link_hints-X.X.X.xpi`. (Note: `.xpi`, not `.zip`.)

Note: If you regularly develop for Chrome, you might want to run `npm run build:firefox && npm run compile` instead of just `npm run build:firefox`. Otherwise your `compiled/` directory will contain Firefox-specific code that won’t work in Chrome. `npm run compile` is like `npm run watch` but it only runs once and does not start watching for changes.

[chrome]: https://www.google.com/chrome/
[chromium]: https://www.chromium.org
[eslint]: https://eslint.org/
[firefox developer edition]: https://www.mozilla.org/firefox/developer/
[firefox nightly]: https://nightly.mozilla.org/
[inkscape]: https://inkscape.org/
[node.js]: https://nodejs.org/
[optipng]: http://optipng.sourceforge.net/
[preact]: https://preactjs.com/
[prettier]: https://prettier.io/
[rollup]: https://rollupjs.org/
[run-pty]: https://github.com/lydell/run-pty
[sign]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Getting_started_with_web-ext#Signing_your_extension_for_self-distribution
[sucrase]: https://github.com/alangpierce/sucrase
[typescript]: typescriptlang.org/
[unbranded builds]: https://wiki.mozilla.org/Add-ons/Extension_Signing#Unbranded_Builds
[web-ext]: https://github.com/mozilla/web-ext
[webextension polyfill]: https://github.com/mozilla/webextension-polyfill
