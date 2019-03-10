// @flow strict-local

import React from "preact";
import Shadow from "preact-shadow-root";

import {
  CSS,
  HIDDEN_CLASS,
  HIGHLIGHTED_HINT_CLASS,
  HINT_CLASS,
  MATCHED_CHARS_CLASS,
  MAX_Z_INDEX,
  MIN_Z_INDEX,
  MIXED_CASE_CLASS,
  PEEK_CLASS,
  ROOT_CLASS,
  SHRUGGIE,
  STATUS_CLASS,
  TEXT_RECT_CLASS,
} from "../shared/css";
import {
  type Box,
  classlist,
  getTextRects,
  isMixedCase,
  splitEnteredText,
} from "../shared/main";

const HINT_X = 38; // px
const HINT_Y = 50; // px
const HINT_X_OFFSET = 10; // px
const HINT_Y_OFFSET = 10; // px

const HINT_VARIATIONS = [
  [[0, 1], [1, 0]],
  [[0, 2], [1, 1], [2, 0]],
  [[0, 3], [2, 1], [3, 0]],
];

const FILTER_BY_TEXT = (
  <p>
    Nearby example <span style={{ fontVariant: "all-small-caps" }}>TEXT</span>{" "}
    to filter.
  </p>
);
const ENTERED_TEXT = "filter by text ex";

type Props = {|
  chars: string,
  css: string,
  peek: boolean,
|};

type State = {|
  textRects: Array<Box>,
|};

export default class CSSPreview extends React.Component<Props, State> {
  containerRef: { current: HTMLDivElement | null };
  filterByText: { current: HTMLDivElement | null };

  constructor(props: Props) {
    super(props);

    this.containerRef = React.createRef();
    this.filterByText = React.createRef();

    this.state = {
      textRects: [],
    };
  }

  componentDidMount() {
    this.updateTextRects();
  }

  updateTextRects() {
    const containerElement = this.containerRef.current;
    const filterByTextElement = this.filterByText.current;
    if (containerElement == null || filterByTextElement == null) {
      return;
    }

    const rect = containerElement.getBoundingClientRect();

    const textRects = getTextRects({
      element: filterByTextElement,
      viewports: [],
      words: new Set(splitEnteredText(ENTERED_TEXT)),
      checkElementAtPoint: false,
    }).map(box => ({
      ...box,
      x: box.x - rect.left,
      y: box.y - rect.top,
    }));

    this.setState({ textRects });
  }

  render() {
    const { chars, css, peek } = this.props;
    const { textRects } = this.state;

    let hintZIndex = MAX_Z_INDEX;
    const hint = ({
      left,
      top,
      matchedChars = "",
      chars: unmatchedChars,
      highlighted = false,
      hidden = false,
    }: {|
      /* eslint-disable react/require-default-props */
      left: number,
      top: number,
      matchedChars?: string,
      chars: string,
      highlighted?: boolean,
      hidden?: boolean,
      /* eslint-enable react/require-default-props */
    |}) => {
      hintZIndex--;
      return (
        <div
          key={hintZIndex}
          className={classlist(HINT_CLASS, {
            [MIXED_CASE_CLASS]: isMixedCase(chars),
            [HIGHLIGHTED_HINT_CLASS]: highlighted,
            [HIDDEN_CLASS]: hidden,
          })}
          style={{
            position: "absolute",
            left: HINT_X_OFFSET + left,
            top: HINT_Y_OFFSET + top,
            zIndex: hintZIndex,
          }}
        >
          {matchedChars.length > 0 && (
            <span className={MATCHED_CHARS_CLASS}>{matchedChars}</span>
          )}
          {unmatchedChars}
        </div>
      );
    };

    return (
      <div
        className="Preview"
        style={{
          height: HINT_Y_OFFSET * 2 + HINT_Y * (HINT_VARIATIONS.length + 2),
          zIndex: MAX_Z_INDEX,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: HINT_Y_OFFSET + HINT_Y * (HINT_VARIATIONS.length + 1),
            right: HINT_X_OFFSET,
          }}
          ref={this.filterByText}
        >
          {FILTER_BY_TEXT}
        </div>

        <div style={{ height: "100%" }} ref={this.containerRef}>
          <Shadow>
            <div className={classlist(ROOT_CLASS, { [PEEK_CLASS]: peek })}>
              {hint({
                left: 0,
                top: HINT_Y * (HINT_VARIATIONS.length + 1),
                chars: SHRUGGIE,
              })}

              {hint({
                left: HINT_X * 2,
                top: HINT_Y * (HINT_VARIATIONS.length + 1),
                chars: "hidden",
                hidden: true,
              })}

              <div
                className={STATUS_CLASS}
                style={{
                  position: "absolute",
                  zIndex: String(MAX_Z_INDEX),
                }}
              >
                {ENTERED_TEXT}
              </div>

              {chars.split("").map((char, index) =>
                hint({
                  left: HINT_X * index,
                  top: 0,
                  chars: char,
                })
              )}

              {HINT_VARIATIONS.map((variations, y) =>
                []
                  .concat(
                    ...variations.map(([numMatched, numChars]) =>
                      [false, true].map(highlighted => ({
                        matchedChars: chars.slice(0, numMatched),
                        chars: chars.slice(numMatched, numMatched + numChars),
                        highlighted,
                      }))
                    )
                  )
                  .map((props, x) =>
                    hint({
                      left: HINT_X * 2 * x,
                      top: HINT_Y * (y + 1),
                      ...props,
                    })
                  )
              )}

              {textRects.map((box, index) => (
                <div
                  key={index}
                  className={TEXT_RECT_CLASS}
                  data-frame-id={0}
                  style={{
                    position: "absolute",
                    left: box.x,
                    top: box.y,
                    width: box.width,
                    height: box.height,
                    zIndex: String(MIN_Z_INDEX),
                  }}
                />
              ))}

              <style>{`${CSS}\n\n${css}`}</style>
            </div>
          </Shadow>
        </div>
      </div>
    );
  }
}
