# Issues

The easiest way to open issue is to [follow one of the templates](https://github.com/lydell/LinkHints/issues/new/choose).

It’s always helpful it you include debug info (Link Hints version, browser version, configuration, etc.). Click the Link Hints toolbar button, press “Copy debug info” and paste in the issue.

# Pull requests

If you’d like to make a pull request, here’s what you need to know.

Requirements:

- [Node.js] 12 with npm 6.
- Chrome or Chromium.
- Firefox Developer Edition or Firefox Nightly.

To get started:

1. Clone this repository.
2. Run `npm ci` to install dependencies.
3. Run `npm test` to verify the installation.

When developing, you need to start a watcher that compiles the code as you
change it:

```
npm run watch
```

For Firefox:

```
npm run firefox
```

That should open a new Firefox profile with Link Hints pre-installed and with
auto-reloading.

For Chrome:

1. Open `chrome://extensions`.
2. Enable “Developer mode” there.
3. Click “Load unpacked”
4. Choose the `src/` directory in this repo.

Link Hints should now be installed. You need to press the refresh button after
you make changes to the code.
