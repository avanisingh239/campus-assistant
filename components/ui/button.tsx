import type { ButtonHTMLAttributes } from "react";
import styles from "../ui.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

/** Gold pill button (primary) or transparent outline button (ghost). */
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? styles.buttonPrimary : styles.buttonGhost;
  return <button className={`${styles.button} ${variantClass} ${className ?? ""}`} {...props} />;
}
