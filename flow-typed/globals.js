// @flow

declare type Browser = "chrome" | "firefox";

declare var BROWSER: Browser;

declare var BUILD_TIME: string;

declare var PROD: boolean;

declare type ConnectInfo = {|
  name?: string,
  includeTlsChannelId?: boolean,
|};

declare type ExecuteScriptDetails = {|
  allFrames?: boolean,
  code?: string,
  file?: string,
  frameId?: number,
  matchAboutBlank?: boolean,
  runAt?: string,
|};

declare type HTMLFrameElement = HTMLIFrameElement;

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

declare type Port = {|
  disconnect(): void,
  error: ?Object,
  name: string,
  onDisconnect: OnEvent<(Port) => void>,
  onMessage: OnEvent<(any) => void>,
  postMessage(any): void,
  sender: ?MessageSender,
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

declare type TabRemoveInfo = {|
  windowId: number,
  isWindowClosing: boolean,
|};

declare type TabStatus = "loading" | "complete";

declare var browser: {|
  browserAction: {|
    setBadgeText({|
      text: string,
      tabId?: number,
    |}): void,
    setIcon({|
      path: { [string]: string },
      tabId?: number,
    |}): void,
  |},
  runtime: {|
    connect: (() => Port) &
      (ConnectInfo => Port) &
      ((extensionId: string, ConnectInfo) => Port),
    getManifest(): any,
    sendMessage(message: any): Promise<any>,
    onConnect: OnEvent<(Port) => void>,
    onMessage: OnEvent<(any, MessageSender) => Promise<any> | void>,
  |},
  tabs: {|
    create(createProperties: {|
      active?: boolean,
      cookieStoreId?: string,
      index?: number,
      openerTabId?: number,
      openInReaderMode?: boolean,
      url?: string,
      windowId?: number,
    |}): Promise<Tab>,
    executeScript: (ExecuteScriptDetails => Promise<Array<any>>) &
      ((tabId: number, ExecuteScriptDetails) => Promise<Array<any>>),
    onCreated: OnEvent<(Tab) => void>,
    onRemoved: OnEvent<(number, TabRemoveInfo) => void>,
    sendMessage(
      tabId: number,
      message: any,
      options?: {| frameId?: number |}
    ): Promise<any>,
    query(queryInfo: {|
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
    |}): Promise<Array<Tab>>,
  |},
|};
