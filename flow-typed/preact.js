// @flow strict-local

declare module "preact" {
  declare class the_main_preact_module___use_preact_slash_hooks_instead {}

  declare module.exports: {|
    ...$Exports<"react">,
    ...$Exports<"react-dom">,
    useCallback: the_main_preact_module___use_preact_slash_hooks_instead,
    useContext: the_main_preact_module___use_preact_slash_hooks_instead,
    useDebugValue: the_main_preact_module___use_preact_slash_hooks_instead,
    useEffect: the_main_preact_module___use_preact_slash_hooks_instead,
    useImperativeHandle: the_main_preact_module___use_preact_slash_hooks_instead,
    useLayoutEffect: the_main_preact_module___use_preact_slash_hooks_instead,
    useMemo: the_main_preact_module___use_preact_slash_hooks_instead,
    useReducer: the_main_preact_module___use_preact_slash_hooks_instead,
    useRef: the_main_preact_module___use_preact_slash_hooks_instead,
    useState: the_main_preact_module___use_preact_slash_hooks_instead,
  |};
}

declare module "preact/hooks" {
  declare type React = $Exports<"react">;
  declare module.exports: {|
    useCallback: $PropertyType<React, "useCallback">,
    useContext: $PropertyType<React, "useContext">,
    useDebugValue: $PropertyType<React, "useDebugValue">,
    useEffect: $PropertyType<React, "useEffect">,
    useImperativeHandle: $PropertyType<React, "useImperativeHandle">,
    useLayoutEffect: $PropertyType<React, "useLayoutEffect">,
    useMemo: $PropertyType<React, "useMemo">,
    useReducer: $PropertyType<React, "useReducer">,
    useRef: $PropertyType<React, "useRef">,
    useState: $PropertyType<React, "useState">,
  |};
}
