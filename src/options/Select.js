// @flow strict-local

import React from "preact";

type Props = {
  children: React.Node,
  onChange: (string, number) => void,
  // ...restProps
};

export default function Select({ children, onChange, ...restProps }: Props) {
  return (
    <select
      {...restProps}
      onChange={event => {
        onChange(event.currentTarget.value, event.currentTarget.selectedIndex);
      }}
    >
      {children}
    </select>
  );
}
