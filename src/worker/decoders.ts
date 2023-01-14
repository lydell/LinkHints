import {
  array,
  chain,
  Codec,
  fields,
  fieldsUnion,
  Infer,
  number,
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
export const FrameMessage = chain(
  fieldsUnion("type", (type) => [
    {
      type: type("FindElements"),
      types: ElementTypes,
      viewports: Viewports,
    },
    {
      type: type("UpdateElements"),
      viewports: Viewports,
    },
  ]),
  {
    decoder: (value) => ({ ...value, token: "" }),
    encoder: ({ token: _, ...value }) => value,
  }
);
