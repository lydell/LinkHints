module.exports = config => ({
  ...config,
  run: {
    ...config.run,
    // Automatically open the Browser Console on startup.
    browserConsole: true,
    // This is a useful start page.
    startUrl: ["about:debugging"],
    pref: [
      // Disable very noisy and mostly irrelevant warnings. Flow and ESLint
      // catch this type of errors anyway.
      "javascript.options.strict=false",
      // Allow accessing about:config without the warning screen.
      "general.warnOnAboutConfig=false",
    ],
  },
});
