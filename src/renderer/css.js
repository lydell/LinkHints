// @flow

// This file contains a light-weight good-enough (but in no way spec-compliant)
// CSS parser, used as a workaround for Firefox's over-eager CSP implementation.
// See <bugzil.la/1267027>.

import { partition } from "../shared/main";

export type Rule = {|
  selector: string,
  declarations: Array<Declaration>,
|};

export type Declaration = {|
  property: string,
  value: string,
  important: boolean,
|};

// Copied from <https://github.com/lydell/css-tokens>.
const stringsAndCommentsRegex = /((['"])(?:(?!\2)[^\\\r\n\f]|\\(?:\r\n|[\s\S]))*(\2)?)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)/g;

const annoyingCharsRegex = /[{};]/g;

const ruleRegex = /([^{}]+)\{([^{}]*)\}/y;

const declRegex = /^\s*([^\s:]+)\s*:([^;]+?)(!\s*important\s*)?$/i;

export function parseCSS(css: string): Array<Rule> {
  const normalized = css.replace(
    stringsAndCommentsRegex,
    (match, string, quote, comment) => {
      // Remove characters inside strings that make other parsing harder.
      // Hacky, but simple. And good enough.
      if (string != null) {
        return string.replace(annoyingCharsRegex, "");
      }

      // Remove comments.
      if (comment != null) {
        return "";
      }

      return match;
    }
  );

  const rules = [];
  let match = undefined;
  ruleRegex.lastIndex = 0;

  while ((match = ruleRegex.exec(normalized))) {
    const [, selector, declarationsString] = match;
    rules.push({
      selector: selector.trim(),
      declarations: parseDeclarations(declarationsString),
    });
  }

  return rules;
}

function parseDeclarations(declarationsString: string): Array<Declaration> {
  return declarationsString
    .split(";")
    .map(declString => {
      const match = declRegex.exec(declString);

      if (match == null) {
        return undefined;
      }

      const [, property, value, important] = match;
      return {
        property,
        value: value.trim(),
        important: important != null,
      };
    })
    .filter(Boolean);
}

export function applyStyles(element: HTMLElement, styles: Array<Rule>) {
  const [matching, notMatching] = partition(styles, rule =>
    element.matches(rule.selector)
  );

  // First reset non-matching rules, in case they were applied before.
  for (const rule of notMatching) {
    for (const decl of rule.declarations) {
      element.style.setProperty(decl.property, "");
    }
  }

  // Then apply matching rules.
  for (const rule of matching) {
    for (const decl of rule.declarations) {
      element.style.setProperty(
        decl.property,
        decl.value,
        decl.important ? "important" : ""
      );
    }
  }
}
