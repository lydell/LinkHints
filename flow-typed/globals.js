// @flow strict-local

declare type AnyFunction = (...args: Array<any>) => any;

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare var BUILD_ID: string;

declare var COLOR_BADGE: string;
declare var COLOR_GREEN: string;
declare var COLOR_PURPLE: string;
declare var COLOR_YELLOW: string;

declare var DEFAULT_LOG_LEVEL_CONFIG: mixed;

declare var DEFAULT_STORAGE_SYNC: mixed;

declare var META_HOMEPAGE: string;
declare var META_ICON: string;
declare var META_NAME: string;
declare var META_SLUG: string;
declare var META_TUTORIAL: string;
declare var META_VERSION: string;

declare var PROD: boolean;

declare function exportFunction(
  AnyFunction,
  mixed,
  options?: {| defineAs: string |}
): AnyFunction;

declare function XPCNativeWrapper<T>(x: T): T;

declare type HTMLFrameElement = HTMLIFrameElement;

declare type SVGElement = Element;
