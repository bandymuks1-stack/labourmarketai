// Visual system is law — these are the ONLY allowed colors (brief §8.1).
// Base ink is near-black with a cool tint, NEVER pure #000.
export const colors = {
  ink: {
    900: "#06070D",
    800: "#0B0D17",
    700: "#10131F",
    600: "#1A1E2E",
    500: "#252A3D",
  },
  brand: {
    blue: "#3E8BFF",
    cyan: "#00C2FF",
    violet: "#7B5CFF",
    purple: "#B57BFF",
    // Safety orange — active-state accent for the mobile bottom tab bar.
    orange: "#FF6B1A",
  },
  state: {
    live: "#00E676",
    success: "#34D399",
    warning: "#FFB845",
    amber: "#FFA552",
    danger: "#FF5C5C",
  },
  text: {
    primary: "#F4F6FB",
    secondary: "#9BA3B8",
    muted: "#5C6480",
  },
  // Player-card rating tiers (5b.3). Brief-mandated values, tokenised so
  // components use classes (fill-tier-gold …) — never raw hex.
  tier: {
    diamond: "#5BE0FF",
    gold: "#FFC857",
    silver: "#C6CDD8",
    bronze: "#C7895A",
  },
} as const;
