import type { InputHTMLAttributes } from "react";
import styles from "../ui.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
};

/** Labeled input with an inline validation/auth error shown under the field. */
export function TextField({ label, error, id, className, ...props }: TextFieldProps) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        id={id}
        className={`${styles.fieldInput} ${error ? styles.fieldInputError : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className={styles.fieldError}>{error}</p>}
    </label>
  );
}
