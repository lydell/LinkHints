// @flow strict-local

// This file contains a light-weight good-enough (but in no way spec-compliant)
// CSS parser, used as a workaround for Firefox's over-eager CSP implementation.
// See <bugzil.la/1267027>.

import { partition } from "../shared/main";

export type Rule = {
  selector: string,
  declarations: Array<Declaration>,
};

export type Declaration = {
  property: string,
  value: string,
  important: boolean,
};

// Mostly copied from <https://github.com/lydell/css-tokens>.
const stringsAndCommentsAndUrlsRegex = /((['"])(?:(?!\2)[^\\]|\\[\s\S])*\2?)|(\/\*(?:[^*]|\*(?!\/))*(?:\*\/)?)|(url\(\s*[^"'()\s]+\s*\))/g;

const annoyingCharsRegex = /[{};]/g;

const ruleRegex = /([^{}]+)\{([^{}]*)\}/y;

const declRegex = /^\s*([^\s:]+)\s*:([^;]+?)(!\s*important\s*)?$/i;

export function parseCSS(css: string): Array<Rule> {
  const normalized = css.replace(
    stringsAndCommentsAndUrlsRegex,
    (match, string, quote, comment, url) => {
      // Escape characters inside strings and unquoted urls that make other
      // parsing harder. Hacky, but simple. And good enough.
      if (string != null || url != null) {
        return match.replace(
          annoyingCharsRegex,
          (char) => `\\${char.charCodeAt(0).toString(16)} `
        );
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
    const [, rawSelector, declarationsString] = match;
    const selector = rawSelector.trim();

    try {
      document.querySelector(selector);
    } catch {
      // Just like in CSS, ignore the entire rule if the selector is invalid.
      continue;
    }

    rules.push({
      selector,
      declarations: parseDeclarations(declarationsString),
    });
  }

  return rules;
}

function parseDeclarations(declarationsString: string): Array<Declaration> {
  return declarationsString
    .split(";")
    .map((declString) => {
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
  const [matching, notMatching] = partition(styles, (rule) =>
    element.matches(rule.selector)
  );

  // First reset non-matching rules, in case they were applied before.
  for (const rule of notMatching) {
    for (const decl of rule.declarations) {
      const important =
        element.style.getPropertyPriority(decl.property) === "important";
      // All inline styling set in renderer/Program.js uses `!important`. Only
      // reset here if the `important`s match so we don’t lose the inline
      // styling (such as `left` and `right` for hints).
      if (important === decl.important) {
        element.style.setProperty(decl.property, "");
      }
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
