import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { digestChecks, digestMatches, fieldText, gunzipMembers, lastField, mapWarc } from "../src/map/index.ts";
import type { Span } from "../src/map/span.ts";

/** viewer が開く例（scripts/make-examples.ts が作り、repo に置いた物）。 */
const warc = new Uint8Array(readFileSync(new URL("../site/public/examples/types.warc", import.meta.url)));
const gz = new Uint8Array(readFileSync(new URL("../site/public/examples/types.warc.gz", import.meta.url)));
const map = mapWarc(warc);
const sha = (algorithm: string, spans: readonly Span[]) =>
  new Uint8Array(createHash(algorithm).update(Buffer.concat(spans.map((s) => warc.subarray(s.start, s.end)))).digest());

describe("例の WARC（site/public/examples/）", () => {
  it("作り直すと、repo に置いた types.warc と同じ bytes になる（script を直したら作り直す）", () => {
    const dir = mkdtempSync(join(tmpdir(), "wbm-examples-"));
    try {
      execFileSync(process.execPath, [new URL("../scripts/make-examples.ts", import.meta.url).pathname, dir]);
      expect(new Uint8Array(readFileSync(join(dir, "types.warc")))).toEqual(warc);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("8 つの type の record を、問題無しに読める", () => {
    expect(map.rest).toBeUndefined();
    expect(map.records.flatMap((r) => r.problems)).toEqual([]);
    const types = new Set(map.records.map((r) => fieldText(warc, lastField(warc, r.fields, "WARC-Type")!)));
    expect([...types].sort()).toEqual(["continuation", "conversion", "metadata", "request", "resource", "response", "revisit", "warcinfo"]);
  });

  it("digest は、仕様の読みか、chunk のままの読みのどちらかで欄の値と一致する（record 11 は後者だけ）", () => {
    const verdicts = map.records.flatMap((r) =>
      digestChecks(warc, r)
        .filter((c) => c.spans.length > 0)
        .map((c) => {
          const algorithm = c.declared!.algorithm;
          const spec = digestMatches(sha(algorithm, c.spans), c.declared!.value);
          const sent = c.alternative !== undefined && digestMatches(sha(algorithm, c.alternative), c.declared!.value);
          return [r.index, c.name, spec ? "spec" : sent ? "as-sent" : "mismatch"];
        }),
    );
    expect(verdicts.filter(([, , v]) => v === "mismatch")).toEqual([]);
    expect(verdicts.filter(([, , v]) => v === "as-sent")).toEqual([[10, "WARC-Payload-Digest", "as-sent"]]);
  });

  it(".warc.gz は 1 record 1 member で、解くと types.warc と同じ", () => {
    const inflated = gunzipMembers(gz);
    expect(inflated.error).toBeUndefined();
    expect(inflated.bytes).toEqual(warc);
    expect(inflated.members.map((m) => m.inflated)).toEqual(map.records.map((r) => r.record));
  });
});
