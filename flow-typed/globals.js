// @flow

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare type MessageSender = {|
  tab?: Tab,
  frameId?: number,
  id?: string,
  url?: string,
  tlsChannelId?: string,
|};

declare type OnEvent<Listener> = {|
  addListener: Listener => void,
  removeListener: Listener => void,
  hasListener: Listener => boolean,
|};

declare type Tab = {|
  active: boolean,
  audible?: boolean,
  autoDiscardable?: boolean,
  cookieStoreId?: string,
  discarded?: boolean,
  faviconUrl?: string,
  height?: number,
  hidden: boolean,
  highlighted: boolean,
  id: number,
  incognito: boolean,
  index: number,
  isArticle: boolean,
  isInReaderMode: boolean,
  lastAccessed: number,
  // mutedInfo: MutedInfo,
  openerTabId?: number,
  pinned: boolean,
  sessionId?: string,
  status?: TabStatus,
  title?: string,
  url?: string,
  width?: number,
  windowId: number,
|};

declare type TabStatus = "loading" | "complete";

declare var browser: {|
  runtime: {|
    sendMessage: (message: any) => Promise<any>,
    onMessage: OnEvent<(any, MessageSender) => Promise<any> | void>,
  |},
  tabs: {|
    sendMessage: (
      tabId: number,
      message: any,
      options?: {| frameId?: number |}
    ) => Promise<any>,
    query: (queryInfo: {|
      active?: boolean,
      audible?: boolean,
      autoDiscardable?: boolean,
      cookieStoreId?: string,
      currentWindow?: boolean,
      discarded?: boolean,
      highlighted?: boolean,
      index?: number,
      muted?: boolean,
      lastFocusedWindow?: boolean,
      openerTabId?: number,
      pinned?: boolean,
      status?: TabStatus,
      title?: string,
      url?: string,
      windowId?: number,
      windowType?: number,
    |}) => Promise<Tab>,
  |},
|};
