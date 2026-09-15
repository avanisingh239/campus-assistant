"use client";

import { useState } from "react";
import { LogoMark } from "@/components/icons";
import { CanvasBackground } from "@/components/canvas-background";
import { RoleSelect } from "./role-select";
import { StudentAuthForm } from "./student-auth-form";
import { AdminAuthForm } from "./admin-auth-form";
import styles from "./login.module.css";

type Screen = "role" | "student" | "admin";

/**
 * The whole /login experience as one page with internal state — not
 * separate routes per screen, per the task. Three states: role selection
 * (landing, unauthenticated), the student login/signup form, and the
 * admin login-only form (which has its own internal "Access Restricted"
 * sub-state — see admin-auth-form.tsx).
 */
export function LoginScreen() {
  const [screen, setScreen] = useState<Screen>("role");

  return (
    <CanvasBackground>
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>
            <LogoMark />
          </div>
          <p className={styles.appName}>Rescript</p>
          <p className={styles.tagline}>Your campus, clarified.</p>
        </div>

        {screen === "role" && (
          <RoleSelect onSelectStudent={() => setScreen("student")} onSelectAdmin={() => setScreen("admin")} />
        )}
        {screen === "student" && <StudentAuthForm onBack={() => setScreen("role")} />}
        {screen === "admin" && <AdminAuthForm onBack={() => setScreen("role")} />}
      </div>
    </CanvasBackground>
  );
}
