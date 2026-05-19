import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = { title: "Create profile" };

export default function RegisterPage() {
  return <AuthPanel mode="register" />;
}
