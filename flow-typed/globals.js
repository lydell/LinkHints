// @flow

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare type OnEvent<Listener> = {|
  addListener: Listener => void,
  removeListener: Listener => void,
  hasListener: Listener => boolean,
|};

declare var browser: {|
  runtime: {|
    sendMessage: any => Promise<any>,
    onMessage: OnEvent<(any) => Promise<any> | void>,
  |},
|};
