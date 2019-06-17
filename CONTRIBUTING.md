# Issues

The easiest way to open issue is to [follow one of the templates](https://github.com/lydell/LinkHints/issues/new/choose).

It’s always helpful it you include debug info (Link Hints version, browser version, configuration, etc.). Click the Link Hints toolbar button, press “Copy debug info” and paste in the issue.

# Pull requests

If you’d like to make a pull request, here’s what you need to know.

## Requirements

- [Node.js] 12 with npm 6.
- Latest Chrome or Chromium.
- Latest Firefox Developer Edition or Firefox Nightly.

## Get started

1. Clone this repository.
2. Run `npm ci` to install dependencies.
3. Run `npm test` to verify the installation.

## Technology used

- [web-ext] for building and linting, and for developing in Firefox.
- [Rollup] for `import`/`export` and npm packages.
- [Flow] for type checking.
- [ESLint] for linting.
- [Prettier] for automatic code formatting.
- [Sucrase] for compiling Flow type annotation and JSX.
- [Preact] for easily making the options UI.

## File overview

- The repo root contains mostly configuration files.
- `src/` contains the source code for the extension.
- `scripts/` contains a couple of build scripts.
- `html/` contains lots of test pages for the extension.
- `docs/` is served on <https://lydell.github.io/LinkHints/>.

These directories are generated and gitignored:

- `compiled/` is the compiled version of `src/`.
- `dist-chrome/` and `dist-firefox/` contains production builds of the extension.

Compilation pipeline:

```
       project.config.js                                     .--> dist-chrome/
       rollup.config.js                 web-ext-config.js   /
src/ ---------------------> compiled/ ----------------------
                                                            \
                                                             '--> dist-firefox/
```

## Development

When developing, you need to start a watcher (Rollup) that compiles the code
as you change it:

```
npm run watch
```

### Firefox

```
npm run firefox
```

That should open a new Firefox profile with Link Hints pre-installed and with
auto-reloading.

### Chrome

1. Open `chrome://extensions`.
2. Enable “Developer mode” there.
3. Click “Load unpacked”
4. Choose the `compiled/` directory in this repo.

Link Hints should now be installed. You need to press the refresh button after
you make changes to the code.

[eslint]: https://eslint.org/
[flow]: https://flow.org/
[node.js]: https://nodejs.org/
[preact]: https://preactjs.com/
[prettier]: https://prettier.io/
[rollup]: https://rollupjs.org/
[sucrase]: https://github.com/alangpierce/sucrase
[web-ext]: https://github.com/mozilla/web-ext
