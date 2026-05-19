// Single source of truth for the visual system. Nothing in the app may use a
// color / radius / shadow / gradient that is not defined here.
import { colors } from "./colors";
import { gradients } from "./gradients";
import { radii } from "./radii";
import { shadows } from "./shadows";
import { typography } from "./typography";

export { colors } from "./colors";
export { gradients } from "./gradients";
export { typography } from "./typography";
export { radii } from "./radii";
export { shadows } from "./shadows";

export const tokens = {
  colors,
  gradients,
  typography,
  radii,
  shadows,
} as const;

export type Tokens = typeof tokens;
