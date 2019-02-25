// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {
  id: string,
  label: React.Node,
  topDescription: React.Node,
  bottomDescription: React.Node,
  changed: boolean,
  render: ({| id: string |}) => React.Node,
};

export default function Field({
  id,
  label,
  topDescription,
  bottomDescription,
  changed,
  render,
}: Props) {
  return (
    <div className={classlist("Field", { "is-changed": changed })}>
      <label htmlFor={id} className="Field-label">{label}</label>
      {topDescription}
      {render({ id })}
      {bottomDescription}
    </div>
  );
}
