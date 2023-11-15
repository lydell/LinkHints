/* eslint-disable @typescript-eslint/consistent-type-definitions */

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

declare function exportFunction<T, F extends (...args: Array<never>) => T>(
  fn: F,
  obj: unknown,
  options?: { defineAs: string }
): F;

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

interface Navigator {
  keyboard?: {
    getLayoutMap: () => Promise<{
      [Symbol.iterator]: () => IterableIterator<[string, string]>;
      keys: () => Array<string>;
      get: (key: string) => string | undefined;
      size: number;
    }>;
    // Brave Browser sets `navigator.keyboard` to null: https://github.com/brave/brave-core/pull/10935
  } | null;
}

// This is used to identify the Vivaldi browser.
declare namespace browser.tabs {
  export interface Tab {
    vivExtData?: unknown;
  }
}

interface ShadowRoot {
  elementFromPoint: Document["elementFromPoint"];
  elementsFromPoint: Document["elementsFromPoint"];
}
