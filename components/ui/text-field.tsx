import type { InputHTMLAttributes } from "react";
import styles from "../ui.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  /** Extra class(es) merged onto the label text — e.g. to override its
   * color when a caller's container isn't the light mint card this
   * component's default `--forest` label color assumes (see
   * app/admin/dashboard's own `.fieldLabel` override). Every other caller
   * omits this and renders identically to before. */
  labelClassName?: string;
};

/** Labeled input with an inline validation/auth error shown under the field. */
export function TextField({ label, error, id, className, labelClassName, ...props }: TextFieldProps) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={`${styles.fieldLabel} ${labelClassName ?? ""}`}>{label}</span>
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
