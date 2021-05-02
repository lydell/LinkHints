// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare type AnyFunction = (...args: Array<any>) => any;

declare type Browser = "chrome" | "firefox";

declare const BROWSER: Browser;

declare const BUILD_ID: string;

declare const COLOR_BADGE: string;
declare const COLOR_GREEN: string;
declare const COLOR_PURPLE: string;
declare const COLOR_YELLOW: string;

declare const DEFAULT_LOG_LEVEL_CONFIG: unknown;

declare const DEFAULT_STORAGE_SYNC: unknown;

declare const META_HOMEPAGE: string;
declare const META_ICON: string;
declare const META_NAME: string;
declare const META_SLUG: string;
declare const META_TUTORIAL: string;
declare const META_VERSION: string;

declare const PROD: boolean;

declare function exportFunction(
  fn: AnyFunction,
  obj: unknown,
  options?: { defineAs: string }
): AnyFunction;

declare function XPCNativeWrapper<T>(x: T): T;

declare type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};
declare const ___idleCallbackID: unique symbol;
declare type IdleCallbackID = number & { [___idleCallbackID]: true };
declare function requestIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  opts?: {
    timeout?: number;
  }
): IdleCallbackID;
declare function cancelIdleCallback(idleCallbackID: IdleCallbackID): void;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface Window {
  Element: typeof Element;
  Event: typeof Event;
  EventTarget: typeof EventTarget;
  Function: typeof Function;
  HTMLElement: typeof HTMLElement;
  Object: typeof Object;
  String: typeof String;
  wrappedJSObject?: Window;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface Navigator {
  keyboard?: {
    getLayoutMap: () => Promise<Iterable<readonly [string, string]>>;
  };
}
