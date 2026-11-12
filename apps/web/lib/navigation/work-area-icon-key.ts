/**
 * The icon ids the area switcher can draw — a LEAF module, no imports.
 * `components/app/work-area-icons.ts` maps each id to its lucide icon.
 */
export type WorkAreaIconKey =
  | "compass"
  | "journal"
  | "chart"
  | "user"
  | "idCard"
  | "images"
  | "userSearch"
  | "package"
  | "store"
  | "users"
  | "folder"
  | "messages"
  | "handshake"
  | "briefcase"
  | "calendar"
  | "gauge"
  | "activity"
  | "barChart"
  | "history"
  // Public browse carousels (owner P0 2026-11-12): one icon per work sector
  // and per public function. Same switcher, same icon map.
  | "hardHat"
  | "factory"
  | "warehouse"
  | "truck"
  | "sprout"
  | "sparkles"
  | "utensils"
  | "heartHandshake"
  | "tractor"
  | "building"
  | "shoppingBag"
  | "code"
  | "graduationCap"
  | "scissors"
  | "wrench"
  | "fileSignature"
  | "globe"
  | "layers";
