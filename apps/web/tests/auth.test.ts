import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifyJwt } from "@quiz/shared";

const SECRET = "test-secret-at-least-32-bytes-long-1234567890";

async function sign(payload: Record<string, unknown>, secret = SECRET) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

describe("verifyJwt", () => {
  it("returns the userId on a valid token", async () => {
    const token = await sign({ userId: "user-1" });
    const result = await verifyJwt(token, SECRET);
    expect(result).toEqual({ userId: "user-1" });
  });

  it("returns null when token is null / undefined / empty", async () => {
    expect(await verifyJwt(undefined, SECRET)).toBeNull();
    expect(await verifyJwt(null, SECRET)).toBeNull();
    expect(await verifyJwt("", SECRET)).toBeNull();
  });

  it("returns null when secret is missing", async () => {
    const token = await sign({ userId: "user-1" });
    expect(await verifyJwt(token, undefined)).toBeNull();
    expect(await verifyJwt(token, "")).toBeNull();
  });

  it("returns null when token was signed with a different secret", async () => {
    const token = await sign({ userId: "user-1" }, "wrong-secret");
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("returns null when the token is malformed", async () => {
    expect(await verifyJwt("not-a-jwt", SECRET)).toBeNull();
    expect(await verifyJwt("xxx.yyy.zzz", SECRET)).toBeNull();
  });

  it("returns null when payload has no userId field", async () => {
    const token = await sign({ something: "else" });
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("returns null when userId is non-string", async () => {
    const token = await sign({ userId: 12345 });
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("returns null on expired token", async () => {
    const expired = await new SignJWT({ userId: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2h ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1h ago
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyJwt(expired, SECRET)).toBeNull();
  });

  it("does not throw on garbage input — always resolves to null or value", async () => {
    // Tampered signature
    const token = await sign({ userId: "user-1" });
    const tampered = token.slice(0, -2) + "XX";
    expect(await verifyJwt(tampered, SECRET)).toBeNull();
  });
});
