// @flow strict-local

import * as React from "preact";

import config from "../project.config";
import KeyboardShortcut, { shortcuts } from "./KeyboardShortcuts";
import Page from "./Page";
import render from "./render";
import Scripts from "./Scripts";
import ShortcutsSummary from "./ShortcutsSummary";

const STEPS = [
  {
    title: "The basics",
    next: "Next step",
    content: (
      <>
        <p>
          {shortcuts.EnterHintsMode_Click} is the main keyboard shortcut. Use it
          to click things.
        </p>
        <p className="large">
          Try it! Press the shortcut, and then type the letter <dfn>(hint)</dfn>{" "}
          that appears on the “Next step” button.
        </p>
        <p>Press {shortcuts.ExitHintsMode} to cancel.</p>
        <Info title="Having trouble?">
          <p>
            If your keyboard layout does not have the{" "}
            <KeyboardShortcut press="J" /> character, you need to flip an
            option.
          </p>
          <p>
            Click the Link Hints toolbar button{" "}
            <span className="ToolbarButton" /> and then “Options.” Check “I use
            multiple keyboard layouts.”
          </p>
          <p>
            Alternatively, you can change the keyboard shortcuts to ones that
            fit your keyboard better.
          </p>
        </Info>
      </>
    ),
  },
  {
    title: "Good to know",
    next: "Got it",
    content: (
      <>
        <p>
          The Link Hints toolbar button looks like this:{" "}
          <span className="ToolbarButton" />
        </p>
        <p>
          The toolbar button provides some handy info and a way to open the
          Options page.
        </p>
        <br />
        <p>
          On some pages, the toolbar button is faded:{" "}
          <span className="ToolbarButtonDisabled" />
        </p>
        <p>This means that Link Hints cannot be used on the page.</p>
        <p>
          Browser extensions are not allowed to run on some pages, such as
          Chrome’s and Firefox’s extension stores, the New Tab page and internal
          settings pages.
        </p>
      </>
    ),
  },
  {
    title: "Opening links in tabs",
    next: "Continue",
    content: (
      <>
        <p>
          {shortcuts.EnterHintsMode_BackgroundTab} lets you open a link in a new
          tab.
        </p>
        <p>
          {shortcuts.EnterHintsMode_ForegroundTab} also switches to the new tab.
        </p>
        <p>Try the shortcuts on these links to get a feel for it:</p>
        <ul>
          <li>
            <a href="https://example.com/">example.com</a>
          </li>
          <li>
            <a href="https://www.mozilla.org/">mozilla.org</a>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Filter by text",
    next: "Alright",
    content: (
      <>
        <p>
          The default hint characters are: <code>fjdkslaurieowhgmvcn</code>.
          Type other characters to <dfn>filter by text.</dfn>
        </p>
        <p>
          Try it! Open the below sections by typing part of their text instead
          of the letters in the yellow boxes <dfn>(hints)</dfn>.
        </p>
        <details>
          <summary>1984</summary>
          <p>
            <cite>1984</cite> is a novel by George Orwell.
          </p>
        </details>
        <details>
          <summary>2001</summary>
          <p>
            <cite>2001: A Space Odessey</cite> is a film by Stanley Kubrick.
          </p>
        </details>
        <p>This is especially useful for tiny pagination links:</p>
        <Pagination />
        <p>
          If there’s no unique match, press {shortcuts.ActivateHint} to activate
          the green hint, or type some hint characters at the end.
        </p>
      </>
    ),
  },
  {
    title: "Filter by text – letters",
    next: "Onwards",
    content: (
      <>
        <p>
          Hints are <em>displayed</em> uppercase because it looks nicer, but
          they are all lowercase: <code>fjdkslaurieowhgmvcn</code>
        </p>
        <p>
          <em>Filtering by text</em> is case <strong>in</strong>sensitive. This
          means that you can hold <KeyboardShortcut shift /> while typing to
          filter by letters.
        </p>
        <p className="Choices">
          <a tabIndex="-1">iPhone</a>
          <a tabIndex="-1">iPad</a>
          <a tabIndex="-1">iMac</a>
        </p>
        <Info title="Tip!">
          <p>
            Change the hint characters to uppercase if you prefer to primarily{" "}
            <em>filter by text.</em>
          </p>
          <p>
            You can also disable auto-activation of unique matches, requiring{" "}
            {shortcuts.ActivateHint} to be pressed.
          </p>
        </Info>
      </>
    ),
  },
  {
    title: "Click many things",
    next: "Keep going",
    content: (
      <>
        <p>
          {shortcuts.EnterHintsMode_ManyClick} lets you click many things in one
          go.
        </p>
        <p>Check these boxes. Press {shortcuts.ExitHintsMode} when done.</p>
        <p className="Salad">
          <input type="checkbox" id="lettuce" />
          <label htmlFor="lettuce">🥬&nbsp;Lettuce</label>
          <input type="checkbox" id="cucumber" />
          <label htmlFor="cucumber">🥒&nbsp;Cucumber</label>
          <input type="checkbox" id="tomato" />
          <label htmlFor="tomato">🍅&nbsp;Tomato</label>
          <output>
            🥗&nbsp;<strong>Enjoy your salad!</strong>{" "}
          </output>
        </p>
        <br />
        <p>{shortcuts.EnterHintsMode_ManyTab} lets you open multiple links.</p>
        <ul>
          <li>
            <a href="https://example.com/">example.com</a>
          </li>
          <li>
            <a href="https://www.mozilla.org/">mozilla.org</a>
          </li>
          <li>
            <a href="https://www.wikipedia.org/">wikipedia.org</a>
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Selecting text",
    next: "Almost there",
    content: (
      <>
        <p>
          {shortcuts.EnterHintsMode_Select} lets you select elements. This is
          useful for copying text and using the context menu.
        </p>
        <p>
          When text is selected, you can use the standard keyboard shortcuts for
          adjusting the selection, such as{" "}
          <KeyboardShortcut shift press="ArrowRight" />. And of course{" "}
          <KeyboardShortcut ctrl={{ mac: "cmd" }} press="C" /> to copy.
        </p>
        <p>Link Hints adds two extra shortcuts:</p>
        <ul>
          <li>
            {shortcuts.ReverseSelection} swaps which end of a text selection to
            work on. This lets you extend the selection not only to the right,
            but also to the left. Try selecting{" "}
            <KeyboardShortcut press="ArrowUp" /> on this line, and then going in
            both directions!
          </li>
          <li>
            {shortcuts.Escape} unselects. This lets you get rid of text
            selection, unfocus text fields and cancel hinting.
          </li>
        </ul>
        <p>
          Finally, you can hold {shortcuts.Alt} while activating a hint (typing
          the last character) to copy its text or link address!
        </p>
      </>
    ),
  },
  {
    title: "Tips & Tricks",
    next: "Finish",
    content: (
      <>
        <p>
          <KeyboardShortcut press="F6" /> can be pressed once or twice to bring
          back focus to the web page area of the browser. Due to browser
          extension limitations, Link Hint’s shortcuts only work when the page
          has focus.
        </p>
        <p>
          Hold {shortcuts.Alt} while activating a hint (typing the last
          character) to force links to open in a new tab.
        </p>
        <p>
          Too many hints near each other? Press {shortcuts.RotateHintsForward}{" "}
          and {shortcuts.RotateHintsBackward} to rotate which hint is on top.
        </p>
        <p>
          Do the hints cover too much of a group of small links? Press{" "}
          {shortcuts.TogglePeek} to peek through them.
        </p>
        <p>
          Finally, {shortcuts.RefreshHints} refreshes the hints. Useful if the
          page changes while you use hints.
        </p>
        <p>
          Here are the tiny pagination links again, for trying out rotation and
          peeking:
        </p>
        <Pagination />
      </>
    ),
  },
  {
    title: "The End",
    next: {
      href: config.docs.root,
      text: "Home",
    },
    content: (
      <>
        <p>Well done! 🎉</p>
        <p>Recap:</p>
        <ShortcutsSummary />
        <p>
          Check out the Options page to see <em>all</em> shortcuts, or if you
          feel like tweaking something.
        </p>
      </>
    ),
  },
];

export default () =>
  render(
    <Page
      title="Link Hints Tutorial"
      description="A tutorial for the Link Hints browser extension."
      css={config.docs.tutorialCss.output}
    >
      <nav>
        <a href={config.docs.root}>⬅️ Home</a>
      </nav>

      <main className={`${config.meta.slug}Tutorial`}>
        <Intro />

        {STEPS.map((step, index) => {
          const num = index + 1;
          return (
            <section key={num} id={`step-${num}`} className="Step">
              <a href={`#step-${num}`} title={`Step ${num}`} />
              <div className="Step-inner">
                <h2>{step.title}</h2>
                {step.content}
                {typeof step.next === "string" ? (
                  <a href={`#step-${num + 1}`} className="Button">
                    {step.next}
                  </a>
                ) : (
                  <a href={step.next.href} className="Button">
                    {step.next.text}
                  </a>
                )}
              </div>
            </section>
          );
        })}

        <div className="Cover" />
      </main>

      <Scripts macifyKbd autoCloseDetails />
    </Page>
  );

function Intro() {
  return (
    <section className="Intro">
      <h1>Link Hints Tutorial</h1>

      <section className="not-installed">
        <p>
          <strong>You don’t seem to have installed Link Hints yet.</strong>
        </p>
        <p>
          You can still go through the tutorial, but you’ll get more out of it
          by installing Link Hints first.
        </p>
      </section>

      <section className="installed">
        <p>
          <strong>Thank you for using Link Hints!</strong>
        </p>
        <p>Go through this short tutorial to learn how to use Link Hints.</p>
      </section>

      <section className="small">
        <p>
          <strong>
            It’s recommended to use a bigger screen for the tutorial.
          </strong>
        </p>
      </section>

      <a href="#step-1" className="Button">
        Get started
      </a>
    </section>
  );
}

function Info({ title, children }: { title: string, children: React.Node }) {
  return (
    <div className="Info">
      <h3>ℹ️ {title}</h3>
      {children}
    </div>
  );
}

function Pagination() {
  return (
    <p className="Pagination">
      {Array.from({ length: 12 }, (_, index) => (
        <a tabIndex="-1">{index + 1}</a>
      ))}
    </p>
  );
}
