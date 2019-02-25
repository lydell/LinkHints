// @flow strict-local

import React from "preact";

type Props = {
  children: React.Node,
  onChange: SyntheticEvent<HTMLSelectElement> => void,
  // ...restProps
};

export default function Select({ children, onChange, ...restProps }: Props) {
  return <select {...restProps} onChange={onChange} >{children}</select>;
}
