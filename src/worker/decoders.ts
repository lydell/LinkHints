// @flow strict-local

import { array, Decoder, fieldsAuto, fieldsUnion, number } from "tiny-decoders";

import { decodeElementTypes } from "../shared/hints";
import { Box, decodeUnsignedFloat } from "../shared/main";

const decodeViewports: Decoder<Array<Box>> = array(
  fieldsAuto<Box>({
    // A viewport of a frame can be partially off-screen.
    x: number,
    y: number,
    width: decodeUnsignedFloat,
    height: decodeUnsignedFloat,
  })
);

export type FrameMessage = ReturnType<typeof decodeFrameMessage>;
export const decodeFrameMessage = fieldsUnion("type", {
  FindElements: fieldsAuto({
    type: () => "FindElements" as const,
    token: () => "",
    types: decodeElementTypes,
    viewports: decodeViewports,
  }),
  UpdateElements: fieldsAuto({
    type: () => "UpdateElements" as const,
    token: () => "",
    viewports: decodeViewports,
  }),
});
