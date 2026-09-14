import { LoginForm } from "../../login-form";

// See app/(auth)/student/login/page.tsx for why this is force-dynamic.
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return <LoginForm heading="Admin Portal" redirectTo="/admin/dashboard" />;
}
