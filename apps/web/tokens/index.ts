// Single source of truth for the visual system. Nothing in the app may use a
// color / radius / shadow / gradient that is not defined here.
import { colors } from "./colors";
import { gradients } from "./gradients";
import { motion } from "./motion";
import { radii } from "./radii";
import { shadows } from "./shadows";
import { typography } from "./typography";
import { zIndex } from "./zindex";

export { colors } from "./colors";
export { gradients } from "./gradients";
export { motion } from "./motion";
export { typography } from "./typography";
export { radii } from "./radii";
export { shadows } from "./shadows";
export { zIndex } from "./zindex";

export const tokens = {
  colors,
  gradients,
  motion,
  typography,
  radii,
  shadows,
  zIndex,
} as const;

export type Tokens = typeof tokens;
