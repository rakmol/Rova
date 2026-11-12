import assert from "node:assert/strict";
import test from "node:test";
import { OfficialImportValidationError, prepareOfficialSpeedRuleImport } from "./speed-rule-import.js";

const validRequest = {
  sourceAuthority: "Fixture authority (not real)",
  sourceDocument: "Fixture schedule (not real)",
  sourceFileName: "limits.csv",
  sourceFileSha256: "a".repeat(64),
  records: [
    {
      source_reference: "page 4, item 12",
      source_url: "https://example.com/fixture",
      source_published_at: "2026-01-02",
      road_name: "Fixture road (not real)",
      direction: "forward",
      vehicle_class: "private_car",
      speed_limit_kmh: "50",
      coordinates: "[[0,0],[0.001,0.001]]",
      effective_from: "2026-01-02",
      expires_at: "",
    },
  ],
};

test("prepares a sourced directional road rule without publishing it", () => {
  const result = prepareOfficialSpeedRuleImport(validRequest);
  assert.equal(result.rows[0].speedLimitKmh, 50);
  assert.equal(result.rows[0].direction, "forward");
  assert.equal(result.rows[0].coordinates.length, 2);
  assert.equal(result.rows[0].sourceReference, "page 4, item 12");
});

test("rejects malformed or out-of-range GPS coordinates", () => {
  const request = structuredClone(validRequest);
  request.records[0].coordinates = "[[-0.2,5.6],[181,5.61]]";
  assert.throws(() => prepareOfficialSpeedRuleImport(request), OfficialImportValidationError);
});

test("rejects records without source provenance or independent applicability", () => {
  const request = structuredClone(validRequest);
  request.records[0].source_reference = "";
  request.records[0].direction = "unknown";
  request.records[0].vehicle_class = "all";
  assert.throws(() => prepareOfficialSpeedRuleImport(request), OfficialImportValidationError);
});

test("reports invalid field types instead of throwing an unexpected error", () => {
  const request = structuredClone(validRequest);
  const record = request.records[0] as unknown as Record<string, unknown>;
  record.direction = 12;
  record.source_published_at = 2026;
  record.source_url = { href: "https://example.com/fixture" };
  assert.throws(() => prepareOfficialSpeedRuleImport(request), OfficialImportValidationError);
});
