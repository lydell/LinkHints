// @flow

import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import { sayHello } from "./utils";

sayHello("background");

if (BROWSER === ("chrome": Browser)) {
  console.log("chrome!", browser);
} else if (BROWSER === ("firefox": Browser)) {
  console.log("firefox!", browser);
}

const keyboardShortcuts: Array<KeyboardMapping> = [
  {
    shortcut: {
      key: "e",
      code: "KeyE",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "Background",
      name: "EnterHintsModeGeneral",
    },
  },
];
