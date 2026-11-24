import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation. Always import Link/redirect/router from here,
// never directly from next/navigation, so locale prefixing stays correct.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
