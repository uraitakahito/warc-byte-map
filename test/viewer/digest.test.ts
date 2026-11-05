import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digestOf } from "../../src/viewer/digest.ts";

const bytes = new TextEncoder().encode("0123456789");

describe("digestOf", () => {
  it("範囲を前からつないだ bytes の hash を、WebCrypto で計算する", async () => {
    const hash = await digestOf("sha1", bytes, [{ start: 1, end: 3 }, { start: 7, end: 9 }]);
    expect(hash).toEqual(new Uint8Array(createHash("sha1").update("1278").digest()));
    expect(await digestOf("sha-256", bytes, [{ start: 0, end: 10 }])).toEqual(new Uint8Array(createHash("sha256").update("0123456789").digest()));
  });

  it("WebCrypto に無い算法は undefined", async () => {
    expect(await digestOf("md5", bytes, [{ start: 0, end: 1 }])).toBeUndefined();
  });
});
