// @flow

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare var BUILD_TIME: string;

declare var CLICKABLE_EVENT_NAMES: Array<string>;
declare var INJECTED_CLICKABLE_EVENT: string;
declare var INJECTED_UNCLICKABLE_EVENT: string;
declare var INJECTED_QUEUE_EVENT: string;
declare var INJECTED_VAR: string;

declare var PROD: boolean;
