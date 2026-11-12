"use client";

import Papa from "papaparse";
import { useRef, useState } from "react";
import type {
  OfficialSpeedRuleCsvRow,
  OfficialSpeedRuleImportResult,
} from "@rova/shared";

const requiredColumns: (keyof OfficialSpeedRuleCsvRow)[] = [
  "source_reference",
  "source_url",
  "source_published_at",
  "road_name",
  "direction",
  "vehicle_class",
  "speed_limit_kmh",
  "coordinates",
  "effective_from",
  "expires_at",
];
const apiUrl = process.env.NEXT_PUBLIC_ROVA_API_URL ?? "http://localhost:4000";

export function OfficialSpeedRuleImportForm() {
  const [authority, setAuthority] = useState("");
  const [document, setDocument] = useState("");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileSha256, setFileSha256] = useState("");
  const [records, setRecords] = useState<OfficialSpeedRuleCsvRow[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const parseSequence = useRef(0);

  async function selectFile(selected: File | null) {
    const sequence = ++parseSequence.current;
    setFile(selected);
    setFileSha256("");
    setRecords([]);
    setIssues([]);
    setMessage("");
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setIssues(["Choose a .csv file exported from the official source document."]);
      return;
    }

    try {
      const fileBytes = await selected.arrayBuffer();
      const fileContents = new TextDecoder().decode(fileBytes);
      const digest = await crypto.subtle.digest("SHA-256", fileBytes);
      if (sequence !== parseSequence.current) return;

      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const parsed = Papa.parse<OfficialSpeedRuleCsvRow>(fileContents, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim(),
      });
      const validationIssues = parsed.errors.map(
        (error) =>
          `${error.row === undefined ? "CSV" : `CSV row ${error.row + 1}`}: ${error.message}`,
      );
      const columns = parsed.meta.fields ?? [];
      for (const column of requiredColumns) {
        if (!columns.includes(column)) validationIssues.push(`Missing required column: ${column}`);
      }
      if (parsed.data.length === 0) validationIssues.push("The CSV must include at least one data row.");
      if (parsed.data.length > 1000) validationIssues.push("Import at most 1000 rows per batch.");

      setIssues(validationIssues);
      if (validationIssues.length === 0) {
        setRecords(parsed.data);
        setFileSha256(hash);
      }
    } catch (error) {
      if (sequence === parseSequence.current) {
        setIssues([
          error instanceof Error
            ? `Could not read the selected CSV: ${error.message}`
            : "Could not read the selected CSV.",
        ]);
      }
    }
  }

  async function submitImport() {
    if (!file || records.length === 0 || !authority.trim() || !document.trim() || !token) return;
    setWorking(true);
    setMessage("");
    setIssues([]);

    try {
      const response = await fetch(`${apiUrl}/v1/admin/speed-rules/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceAuthority: authority.trim(),
          sourceDocument: document.trim(),
          sourceFileName: file.name,
          sourceFileSha256: fileSha256,
          records,
        }),
      });
      const result = (await response.json()) as
        | OfficialSpeedRuleImportResult
        | { error: string; issues?: string[] };

      if (!response.ok || !("importBatchId" in result)) {
        setIssues(
          "error" in result
            ? result.issues ?? [result.error]
            : [`Import failed (${response.status}).`],
        );
        return;
      }

      const imported = result;
      setMessage(
        `Created ${imported.importedDrafts} unpublished draft records. Import batch: ${imported.importBatchId}`,
      );
      setRecords([]);
      setFile(null);
      setFileSha256("");
      setToken("");
    } catch (error) {
      setIssues([
        error instanceof Error
          ? `Could not reach the ROVA API: ${error.message}`
          : "Could not reach the ROVA API.",
      ]);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section>
      <p>
        <a href="/speed-rules-import-template.csv" download>
          Download the empty CSV template
        </a>
        {" · "}Coordinates must be a WGS84 JSON linestring, for example{" "}
        <code>[[longitude,latitude],[longitude,latitude]]</code>. Use only coordinates from
        the source or a separately verified official dataset.
      </p>

      <label style={styles.field}>
        <span>Government authority / issuing agency</span>
        <input
          required
          maxLength={200}
          value={authority}
          onChange={(event) => setAuthority(event.target.value)}
        />
      </label>

      <label style={styles.field}>
        <span>Official document title or identifier</span>
        <input
          required
          maxLength={500}
          value={document}
          onChange={(event) => setDocument(event.target.value)}
        />
      </label>

      <label style={styles.field}>
        <span>Local development import token</span>
        <input
          required
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>

      <label style={styles.field}>
        <span>Official-data CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {file && records.length > 0 ? (
        <p>
          {file.name}: {records.length} rows parsed. Values, sources, directions, vehicle
          classes, dates, and coordinates are validated again by the API before import.
        </p>
      ) : null}

      {records.length > 0 ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Source ref.</th>
                <th>Road / segment</th>
                <th>Direction</th>
                <th>Vehicle</th>
                <th>Limit (km/h)</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 5).map((record, index) => (
                <tr key={`${record.source_reference}-${index}`}>
                  <td>{record.source_reference}</td>
                  <td>{record.road_name}</td>
                  <td>{record.direction}</td>
                  <td>{record.vehicle_class}</td>
                  <td>{record.speed_limit_kmh}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length > 5 ? <p>Showing first 5 of {records.length} rows.</p> : null}
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div role="alert" style={styles.error}>
          <strong>Import needs attention</strong>
          <ul>{issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}

      <button
        type="button"
        disabled={
          working || !file || !fileSha256 || records.length === 0 || !authority.trim() || !document.trim() || !token
        }
        onClick={() => void submitImport()}
      >
        {working ? "Importing drafts…" : "Import as unpublished drafts"}
      </button>
      <p style={styles.caution}>
        Imported values are unverified proposals. They require two independent reviewers,
        source evidence, and an audit record before publication. This token gate is for local
        development only; production needs authenticated role-based access and MFA.
      </p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: {
    display: "grid",
    gap: 6,
    margin: "16px 0",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
  },
  error: {
    color: "#8a241b",
    backgroundColor: "#fff2f0",
    padding: 12,
    margin: "16px 0",
  },
  caution: {
    color: "#5c6964",
    fontSize: 14,
    lineHeight: 1.5,
  },
};
