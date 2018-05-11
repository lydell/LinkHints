// @flow

import { sayHello } from "./utils";

sayHello("background");

if (BROWSER === ("chrome": Browser)) {
  console.log("chrome!", browser);
} else if (BROWSER === ("firefox": Browser)) {
  console.log("firefox!", browser);
}
