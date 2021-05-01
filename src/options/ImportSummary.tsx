// @flow strict-local

import * as React from "preact";

export default function ImportSummary({
  success,
  tweakable,
  errors,
}: {
  success: number,
  tweakable: number,
  errors: number,
}) {
  const successString = success === 1 ? `1 value` : `${success} values`;
  const tweakableString =
    tweakable === 1 ? `1 debug value` : `${tweakable} debug values`;
  const errorsString = errors === 1 ? `1 error` : `${errors} errors`;

  switch (true) {
    case success === 0 && tweakable === 0 && errors === 0:
      return <p>The file contains nothing to import.</p>;

    case success === 0 && tweakable === 0:
      return <p>❌&ensp;Failed to import the file. ({errorsString})</p>;

    default:
      return (
        <div>
          {success > 0 && <p>✅&ensp;{successString} successfully imported.</p>}
          {tweakable > 0 && <p>ℹ️&ensp;{tweakableString} written.</p>}
          {errors > 0 && <p>❌&ensp;{errorsString} found.</p>}
        </div>
      );
  }
}
