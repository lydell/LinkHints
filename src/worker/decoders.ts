import {
  array,
  Codec,
  fields,
  fieldsUnion,
  Infer,
  map,
  number,
  tag,
} from "../shared/codec";
import { ElementTypes } from "../shared/hints";
import { Box, UnsignedFloat } from "../shared/main";

const Viewports: Codec<Array<Box>> = array(
  fields({
    // A viewport of a frame can be partially off-screen.
    x: number,
    y: number,
    width: UnsignedFloat,
    height: UnsignedFloat,
  })
);

export type FrameMessage = Infer<typeof FrameMessage>;
export const FrameMessage = map(
  fieldsUnion("type", [
    {
      type: tag("FindElements"),
      types: ElementTypes,
      viewports: Viewports,
    },
    {
      type: tag("UpdateElements"),
      viewports: Viewports,
    },
  ]),
  {
    decoder: (value) => ({ ...value, token: "" }),
    encoder: ({ token: _, ...value }) => value,
  }
);
