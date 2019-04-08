// @flow strict-local

import React from "preact";

type Props = {|
  success: number,
  errors: number,
|};

export default function ImportSummary({ success, errors }: Props) {
  const successString = success === 1 ? `1 value` : `${success} values`;
  const errorsString = errors === 1 ? `1 error` : `${errors} errors`;
  switch (true) {
    case success === 0 && errors === 0:
      return <p>The file contains nothing to import.</p>;
    case success === 0:
      return <p>❌&ensp;Failed to import the file. ({errorsString})</p>;
    case errors === 0:
      return <p>✅&ensp;{successString} successfully imported.</p>;
    default:
      return (
        <div>
          <p>✅&ensp;{successString} successfully imported.</p>
          <p>❌&ensp;{errorsString} found.</p>
        </div>
      );
  }
}
