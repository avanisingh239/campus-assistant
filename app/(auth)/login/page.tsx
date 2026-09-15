import { LoginScreen } from "./login-screen";

// Role Selection entry point (docs/architecture.md §2, product-spec.md §Area D.1).
// One consolidated route with internal UI state — see login-screen.tsx.
export default function LoginPage() {
  return <LoginScreen />;
}
