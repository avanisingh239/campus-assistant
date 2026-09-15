import { describe, expect, it } from "vitest";
import {
  studentLoginSchema,
  studentSignupSchema,
  adminLoginSchema,
  fieldErrorsFromZod,
} from "./validation";

describe("studentLoginSchema", () => {
  it("accepts a well-formed email/password", () => {
    const result = studentLoginSchema.safeParse({ email: "asha@example.com", password: "hunter2" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing email with a field error", () => {
    const result = studentLoginSchema.safeParse({ email: "", password: "hunter2" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).email).toBe("Email is required.");
    }
  });

  it("rejects a malformed email", () => {
    const result = studentLoginSchema.safeParse({ email: "not-an-email", password: "hunter2" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).email).toBe("Enter a valid email address.");
    }
  });

  it("rejects a missing password", () => {
    const result = studentLoginSchema.safeParse({ email: "asha@example.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).password).toBe("Password is required.");
    }
  });
});

describe("studentSignupSchema", () => {
  const valid = {
    email: "asha@example.com",
    password: "hunter22",
    full_name: "Asha Rao",
    class_name: "CSE-2028-A",
  };

  it("accepts a well-formed signup", () => {
    expect(studentSignupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = studentSignupSchema.safeParse({ ...valid, password: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).password).toBe(
        "Password must be at least 6 characters.",
      );
    }
  });

  it("rejects a missing full name", () => {
    const result = studentSignupSchema.safeParse({ ...valid, full_name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).full_name).toBe("Full name is required.");
    }
  });

  it("rejects a missing class name", () => {
    const result = studentSignupSchema.safeParse({ ...valid, class_name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromZod(result.error).class_name).toBe(
        "Class is required, e.g. CSE-2028-A.",
      );
    }
  });
});

describe("adminLoginSchema", () => {
  it("has the same shape as studentLoginSchema (login-only, no signup fields)", () => {
    expect(adminLoginSchema.safeParse({ email: "admin@example.com", password: "x" }).success).toBe(
      true,
    );
  });
});

describe("fieldErrorsFromZod", () => {
  it("keeps only the first error per field", () => {
    const result = studentSignupSchema.safeParse({
      email: "",
      password: "",
      full_name: "",
      class_name: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFromZod(result.error);
      expect(Object.keys(errors).sort()).toEqual(
        ["class_name", "email", "full_name", "password"].sort(),
      );
    }
  });
});
