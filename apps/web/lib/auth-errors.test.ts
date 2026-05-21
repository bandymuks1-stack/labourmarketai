import { describe, expect, it } from "vitest";
import { mapAuthError } from "./auth-errors";

describe("mapAuthError", () => {
  it("maps an already-registered user (by code and by message)", () => {
    expect(mapAuthError({ code: "user_already_exists" }).key).toBe(
      "userAlreadyRegistered",
    );
    expect(
      mapAuthError({ message: "User already registered" }).key,
    ).toBe("userAlreadyRegistered");
  });

  it("maps weak/short password and extracts the minimum length", () => {
    const info = mapAuthError({
      message: "Password should be at least 8 characters",
    });
    expect(info.key).toBe("passwordTooShort");
    expect(info.params).toEqual({ min: 8 });
    // code path without a number falls back to the default minimum
    expect(mapAuthError({ code: "weak_password" }).params).toEqual({ min: 8 });
  });

  it("maps invalid credentials and invalid email", () => {
    expect(mapAuthError({ code: "invalid_credentials" }).key).toBe(
      "invalidCredentials",
    );
    expect(
      mapAuthError({ message: "Unable to validate email address: invalid format" }).key,
    ).toBe("invalidEmail");
  });

  it("falls back to generic for unknown / empty errors", () => {
    expect(mapAuthError({ message: "kaboom" }).key).toBe("generic");
    expect(mapAuthError(null).key).toBe("generic");
    expect(mapAuthError(undefined).key).toBe("generic");
  });

  it("detects rate limiting by status 429", () => {
    expect(mapAuthError({ status: 429, message: "too many" }).key).toBe(
      "rateLimited",
    );
  });
});
