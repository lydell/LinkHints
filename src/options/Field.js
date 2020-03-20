// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

export default function Field({
  id,
  connected = false,
  fullWidth = false,
  label,
  span = false,
  description,
  changed,
  changedRight = false,
  render,
  onReset,
}: {
  id: string,
  connected?: boolean,
  fullWidth?: boolean,
  label: React.Node,
  span?: boolean,
  description?: React.Node,
  changed: boolean,
  changedRight?: boolean,
  render: ({ id: string }) => React.Node,
  onReset?: () => void,
}) {
  const reset =
    onReset != null && changed ? (
      <button
        type="button"
        className="Field-resetButton TextSmall"
        onClick={onReset}
      >
        Reset
      </button>
    ) : undefined;

  return (
    <div
      className={classlist("Field", "SpacedVertical", {
        "is-connected": connected,
        "is-fullWidth": fullWidth,
        "is-changed": changed,
        "is-changedRight": changedRight,
      })}
    >
      <div>
        {span ? (
          <span className="Field-label">
            {label}
            {reset}
          </span>
        ) : (
          <span className="Field-label">
            <label htmlFor={id}>{label}</label>
            {reset}
          </span>
        )}

        {render({ id })}
      </div>

      {description != null && (
        <div className="Field-description TextSmall">{description}</div>
      )}
    </div>
  );
}
