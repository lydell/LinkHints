// @flow

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

declare type InsertCSSDetails = {|
  allFrames?: boolean,
  code?: string,
  cssOrigin?: "user" | "author",
  file?: string,
  frameId?: number,
  matchAboutBlank?: boolean,
  runAt?: string,
|};

declare type MessageSender = {|
  tab?: Tab,
  frameId?: number,
  id?: string,
  url?: string,
  tlsChannelId?: string,
|};

declare type OnEvent<Listener, Options = void> = {|
  addListener: (Listener, options?: Options) => void,
  removeListener: (Listener) => void,
  hasListener: (Listener) => boolean,
|};

declare type BrowserInfo = {|
  name: string,
  vendor: string,
  version: string,
  buildID: string,
|};

declare type PlatformArch = "arm" | "x86-32" | "x86-64";

declare type PlatformInfo = {|
  os: PlatformOs,
  arch: PlatformArch,
  nacl_arch: PlatformNaclArch,
|};

declare type PlatformNaclArch = "arm" | "x86-32" | "x86-64";

declare type PlatformOs =
  | "android"
  | "cros"
  | "linux"
  | "mac"
  | "openbds"
  | "win";

declare type Port = {|
  disconnect(): void,
  error: ?{| message: string |},
  name: string,
  onDisconnect: OnEvent<(Port) => void>,
  onMessage: OnEvent<(any) => void>,
  postMessage(any): void,
  sender: ?MessageSender,
|};

declare type StorageArea = {|
  get: ((
    keys?: null | string | Array<string>
  ) => Promise<{ [string]: mixed, ... }>) &
    (<T: { +[string]: any, ... }>(T) => Promise<{ [$Keys<T>]: mixed, ... }>),
  getBytesInUse(keys?: null | string | Array<string>): Promise<number>,
  set({ +[string]: any, ... }): Promise<void>,
  remove(string | Array<string>): Promise<void>,
  clear(): Promise<void>,
|};

declare type StorageChange = {|
  oldValue?: mixed,
  newValue?: mixed,
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

declare type TabActiveInfo = {|
  previousTabId: number,
  tabId: number,
  windowId: number,
|};

declare type TabChangeInfo = {|
  audible?: boolean,
  discarded?: boolean,
  favIconUrl?: string,
  hidden?: boolean,
  isArticle?: boolean,
  // mutedInfo?: MutedInfo,
  pinned?: boolean,
  status?: TabStatus,
  title?: string,
  url?: string,
|};

declare type TabRemoveInfo = {|
  windowId: number,
  isWindowClosing: boolean,
|};

declare type TabStatus = "loading" | "complete";

declare type TabUpdateProperties = {|
  active?: boolean,
  autoDiscardable?: boolean,
  highlighted?: boolean,
  loadReplace?: boolean,
  muted?: boolean,
  openerTabId?: number,
  pinned?: boolean,
  selected?: boolean,
  successorTabId?: number,
  url?: string,
|};

declare var browser: {|
  browserAction: {|
    setBadgeBackgroundColor({|
      color: string | [number, number, number, number] | null,
      tabId?: number,
      windowId?: number,
    |}): void,
    setBadgeText({|
      text: string | null,
      tabId?: number,
      windowId?: number,
    |}): void,
    setIcon({|
      path: { [string]: string, ... },
      tabId?: number,
    |}): Promise<void>,
  |},
  extension: {|
    getURL(path: string): string,
  |},
  runtime: {|
    connect: (() => Port) &
      ((ConnectInfo) => Port) &
      ((extensionId: string, ConnectInfo) => Port),
    getBrowserInfo(): Promise<BrowserInfo>,
    getManifest(): any,
    getPlatformInfo(): Promise<PlatformInfo>,
    getURL(string): string,
    openOptionsPage(): Promise<void>,
    sendMessage(message: any): Promise<any>,
    onConnect: OnEvent<(Port) => void>,
    onMessage: OnEvent<(any, MessageSender) => Promise<any> | void>,
  |},
  storage: {|
    local: StorageArea,
    managed: StorageArea,
    onChanged: OnEvent<
      ({ [string]: StorageChange, ... }, "local" | "managed" | "sync") => void
    >,
    sync: StorageArea,
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
    executeScript: ((ExecuteScriptDetails) => Promise<Array<any>>) &
      ((tabId: number, ExecuteScriptDetails) => Promise<Array<any>>),
    get: (tabId: number) => Promise<Tab>,
    onActivated: OnEvent<(TabActiveInfo) => void>,
    onCreated: OnEvent<(Tab) => void>,
    onRemoved: OnEvent<(number, TabRemoveInfo) => void>,
    onUpdated: OnEvent<
      (number, TabChangeInfo, Tab) => void,
      {|
        urls?: Array<string>,
        properties?: Array<
          | "audible"
          | "discarded"
          | "favIconUrl"
          | "hidden"
          | "isarticle"
          | "mutedInfo"
          | "pinned"
          | "sharingState"
          | "status"
          | "title"
        >,
        tabId?: number,
        windowId?: number,
      |}
    >,
    insertCSS: ((InsertCSSDetails) => Promise<void>) &
      ((tabId: number, InsertCSSDetails) => Promise<void>),
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
    sendMessage(
      tabId: number,
      message: any,
      options?: {| frameId?: number |}
    ): Promise<any>,
    update: ((TabUpdateProperties) => Promise<Tab>) &
      ((tabId: number, TabUpdateProperties) => Promise<Tab>),
  |},
  windows: {|
    WINDOW_ID_CURRENT: number,
  |},
|};
