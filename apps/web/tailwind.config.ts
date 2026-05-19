import type { Config } from "tailwindcss";
import preset from "./tailwind-preset";

export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./content/**/*.{ts,tsx}",
  ],
} satisfies Config;
