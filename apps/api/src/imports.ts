import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { OfficialSpeedRuleImportResult } from "@rova/shared";
import { OfficialImportValidationError, prepareOfficialSpeedRuleImport } from "./speed-rule-import.js";
import { importBodySchema } from "./validation.js";

export function registerImportRoutes(app: FastifyInstance, database: Pool, expectedToken: string | undefined) {
app.post<{ Reply: OfficialSpeedRuleImportResult | { error: string; issues?: string[] } }>(
  "/v1/admin/speed-rules/import",
  async (request, reply) => {
    if (!expectedToken || expectedToken.length < 32) {
      return reply.code(503).send({ error: "Official data imports are not configured." });
    }

    const authorization = request.headers.authorization ?? "";
    const suppliedToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    const supplied = Buffer.from(suppliedToken);
    const expected = Buffer.from(expectedToken);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return reply.code(401).send({ error: "Import authorization is required." });
    }

    let prepared;
    try {
      prepared = prepareOfficialSpeedRuleImport(importBodySchema.parse(request.body));
    } catch (error) {
      if (error instanceof OfficialImportValidationError) {
        return reply.code(400).send({ error: error.message, issues: error.issues });
      }
      throw error;
    }

    const client = await database.connect();
    const importedBy = "local-admin-import-token";
    let transactionStarted = false;
    let discardClient = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT set_config('rova.actor_id',$1,true)", [importedBy]);
      await client.query("INSERT INTO data_sources(kind,authority,title,reference,created_by,approval_status) VALUES('official',$1,$2,$2,$3,'pending_review') ON CONFLICT(kind,authority,reference) DO NOTHING", [prepared.sourceAuthority, prepared.sourceDocument, importedBy]);
      const source = await client.query<{ id: string }>("SELECT id FROM data_sources WHERE kind='official' AND authority=$1 AND reference=$2", [prepared.sourceAuthority, prepared.sourceDocument]);
      const sourceId = source.rows[0].id;
      const batch = await client.query<{ id: string }>(
        `INSERT INTO official_speed_rule_imports
           (source_authority, source_document, source_file_name, source_file_sha256, imported_by, row_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          prepared.sourceAuthority,
          prepared.sourceDocument,
          prepared.sourceFileName,
          prepared.sourceFileSha256,
          importedBy,
          prepared.rows.length,
        ],
      );
      const importBatchId = batch.rows[0].id;

      for (const row of prepared.rows) {
        const coordinates = row.coordinates
          .map(([longitude, latitude]) => `${longitude.toFixed(7)} ${latitude.toFixed(7)}`)
          .join(", ");
        const geometry = `LINESTRING(${coordinates})`;
        const fingerprint = createHash("sha256")
          .update(
            JSON.stringify([
              prepared.sourceAuthority,
              prepared.sourceDocument,
              row.sourceReference,
              row.sourceUrl,
              row.sourcePublishedAt?.toISOString() ?? null,
              row.roadName,
              row.direction,
              row.vehicleClass,
              row.speedLimitKmh,
              row.coordinates,
              row.effectiveFrom?.toISOString() ?? null,
              row.expiresAt?.toISOString() ?? null,
            ]),
          )
          .digest("hex");

        const segment = await client.query<{ id: string }>(
          `INSERT INTO road_segments (geometry, direction, road_name, source_id, source_reference, created_by)
           VALUES (ST_GeomFromText($1, 4326), 'both', $2, $3, $4, $5)
           RETURNING id`,
          [geometry, row.roadName, sourceId, row.sourceReference, importedBy],
        );
        const rule = await client.query<{ id: string }>(
          `INSERT INTO speed_limit_rules
             (road_segment_id, vehicle_class, speed_limit_kmh, status, evidence_reference,
              created_by, direction, source_authority, source_document, source_reference,
              source_url, source_published_at, effective_from, expires_at, source_fingerprint,
              import_batch_id, source_id)
           VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (source_fingerprint) WHERE source_fingerprint IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            segment.rows[0].id,
            row.vehicleClass,
            row.speedLimitKmh,
            row.sourceReference,
            importedBy,
            row.direction,
            prepared.sourceAuthority,
            prepared.sourceDocument,
            row.sourceReference,
            row.sourceUrl,
            row.sourcePublishedAt,
            row.effectiveFrom,
            row.expiresAt,
            fingerprint,
            importBatchId,
            sourceId,
          ],
        );

        if (rule.rowCount !== 1) {
          const error = new Error(
            `Import contains a road rule already loaded from this source: ${row.sourceReference}`,
          );
          error.name = "DuplicateOfficialSpeedRuleError";
          throw error;
        }

        await client.query(
          `INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, reason)
           VALUES ($1, 'speed_rule', $2, 'imported_as_draft', $3)`,
          [importedBy, rule.rows[0].id, `Official source import ${importBatchId}`],
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return reply.code(201).send({
        importBatchId,
        importedDrafts: prepared.rows.length,
        status: "draft",
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
          transactionStarted = false;
        } catch (rollbackError) {
          discardClient = true;
          app.log.error({ errorType: rollbackError instanceof Error ? rollbackError.name : "UnknownError" }, "Official speed-rule import rollback failed");
        }
      }
      if (
        !transactionStarted &&
        error instanceof Error &&
        error.name === "DuplicateOfficialSpeedRuleError"
      ) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Official speed-rule import failed");
      throw error;
    } finally {
      client.release(discardClient);
    }
  },
);

}
