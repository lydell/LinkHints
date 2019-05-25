// @flow strict-local

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare var BUILD_TIME: number;

declare var DEFAULT_LOG_LEVEL_CONFIG: mixed;

declare var DEFAULT_STORAGE_SYNC: mixed;

declare var META_CONFIG: {|
  version: string,
  name: string,
  slug: string,
  author: string,
  homepage: string,
  icon: string,
|};

declare var PROD: boolean;
