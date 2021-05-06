// @flow strict-local

import { array, Decoder, fieldsAuto, fieldsUnion, number } from "tiny-decoders";

import { ElementTypes } from "../shared/hints";
import { Box, UnsignedFloat } from "../shared/main";

const Viewports: Decoder<Array<Box>> = array(
  fieldsAuto<Box>({
    // A viewport of a frame can be partially off-screen.
    x: number,
    y: number,
    width: UnsignedFloat,
    height: UnsignedFloat,
  })
);

export type FrameMessage = ReturnType<typeof FrameMessage>;
export const FrameMessage = fieldsUnion("type", {
  FindElements: fieldsAuto({
    type: () => "FindElements" as const,
    token: () => "",
    types: ElementTypes,
    viewports: Viewports,
  }),
  UpdateElements: fieldsAuto({
    type: () => "UpdateElements" as const,
    token: () => "",
    viewports: Viewports,
  }),
});
