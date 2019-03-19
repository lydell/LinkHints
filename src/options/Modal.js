// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  isOpen: boolean,
  onClose: () => void,
|};

export default function Modal({ isOpen, onClose }: Props) {
  return (
    <div className={classlist("Modal", { "is-open": isOpen })}>
      <div
        className="Modal-backdrop"
        onClick={() => {
          onClose();
        }}
      />
      <div className="Modal-content">
        <div className="Modal-contentInner">Modal</div>
      </div>
    </div>
  );
}
