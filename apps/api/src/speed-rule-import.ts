import type {
  OfficialSpeedRuleCsvRow,
  OfficialSpeedRuleImportRequest,
  RoadDirection,
  VehicleClass,
} from "@rova/shared";

const directions = new Set<RoadDirection>(["forward", "reverse", "both"]);
const vehicleClasses = new Set<VehicleClass>([
  "private_car",
  "taxi",
  "motorcycle",
  "commercial_vehicle",
  "bus",
  "heavy_vehicle",
]);

function isRoadDirection(value: string): value is RoadDirection {
  return directions.has(value as RoadDirection);
}

function isVehicleClass(value: string): value is VehicleClass {
  return vehicleClasses.has(value as VehicleClass);
}

export interface PreparedSpeedRuleRow {
  sourceReference: string;
  sourceUrl: string | null;
  sourcePublishedAt: Date | null;
  roadName: string;
  direction: RoadDirection;
  vehicleClass: VehicleClass;
  speedLimitKmh: number;
  coordinates: [number, number][];
  effectiveFrom: Date | null;
  expiresAt: Date | null;
}

export interface PreparedSpeedRuleImport {
  sourceAuthority: string;
  sourceDocument: string;
  sourceFileName: string;
  sourceFileSha256: string;
  rows: PreparedSpeedRuleRow[];
}

export class OfficialImportValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("The official speed-rule import contains invalid data.");
    this.name = "OfficialImportValidationError";
  }
}

function requireText(
  value: unknown,
  label: string,
  issues: string[],
  rowNumber?: number,
  maximumLength = 1000,
): string {
  const prefix = rowNumber === undefined ? "" : `Row ${rowNumber}: `;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${prefix}${label} is required.`);
    return "";
  }

  const result = value.trim();
  if (result.length > maximumLength) {
    issues.push(`${prefix}${label} must be ${maximumLength} characters or fewer.`);
    return "";
  }
  return result;
}

function optionalDate(
  value: unknown,
  label: string,
  issues: string[],
  rowNumber: number,
): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    issues.push(`Row ${rowNumber}: ${label} must be a date string.`);
    return null;
  }
  const dateText = value.trim();
  if (!dateText) return null;
  const date = new Date(dateText);
  if (!Number.isFinite(date.getTime())) {
    issues.push(`Row ${rowNumber}: ${label} must be a valid date.`);
    return null;
  }
  return date;
}

function parseCoordinates(
  value: unknown,
  issues: string[],
  rowNumber: number,
): [number, number][] {
  if (typeof value !== "string") {
    issues.push(`Row ${rowNumber}: coordinates must be JSON [[longitude,latitude],...].`);
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    issues.push(`Row ${rowNumber}: coordinates must be JSON [[longitude,latitude],...].`);
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 1000) {
    issues.push(`Row ${rowNumber}: coordinates must contain 2 to 1000 points.`);
    return [];
  }

  const coordinates: [number, number][] = [];
  for (const point of parsed) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      point[0] < -180 ||
      point[0] > 180 ||
      point[1] < -90 ||
      point[1] > 90
    ) {
      issues.push(`Row ${rowNumber}: every coordinate must be [longitude,latitude] in WGS84.`);
      return [];
    }
    coordinates.push([point[0], point[1]]);
  }

  if (coordinates.every(([longitude, latitude]) => longitude === coordinates[0][0] && latitude === coordinates[0][1])) {
    issues.push(`Row ${rowNumber}: the road segment must contain at least two distinct points.`);
    return [];
  }
  return coordinates;
}

export function prepareOfficialSpeedRuleImport(
  input: unknown,
): PreparedSpeedRuleImport {
  const issues: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new OfficialImportValidationError(["The import request must be an object."]);
  }

  const request = input as Partial<OfficialSpeedRuleImportRequest>;
  const sourceAuthority = requireText(request.sourceAuthority, "Source authority", issues, undefined, 200);
  const sourceDocument = requireText(request.sourceDocument, "Source document", issues, undefined, 500);
  const sourceFileName = requireText(request.sourceFileName, "CSV file name", issues, undefined, 255)
    .replace(/[\\/]/g, "_");
  const sourceFileSha256 = requireText(
    request.sourceFileSha256,
    "CSV file SHA-256",
    issues,
    undefined,
    64,
  );
  if (!/^[a-f\d]{64}$/i.test(sourceFileSha256)) {
    issues.push("CSV file SHA-256 must contain exactly 64 hexadecimal characters.");
  }

  if (!Array.isArray(request.records) || request.records.length === 0 || request.records.length > 1000) {
    issues.push("The CSV must contain between 1 and 1000 data rows.");
    throw new OfficialImportValidationError(issues);
  }

  const rows: PreparedSpeedRuleRow[] = request.records.map((record, index) => {
    const rowNumber = index + 2;
    const row = (record ?? {}) as Partial<OfficialSpeedRuleCsvRow>;
    const sourceReference = requireText(row.source_reference, "source_reference", issues, rowNumber);
    const roadName = requireText(row.road_name, "road_name", issues, rowNumber, 300);
    const coordinates = parseCoordinates(row.coordinates ?? "", issues, rowNumber);

    const directionText = typeof row.direction === "string" ? row.direction.trim() : "";
    const direction = isRoadDirection(directionText) ? directionText : null;
    if (!direction) {
      issues.push(`Row ${rowNumber}: direction must be forward, reverse, or both.`);
    }

    const vehicleClassText =
      typeof row.vehicle_class === "string" ? row.vehicle_class.trim() : "";
    const vehicleClass = isVehicleClass(vehicleClassText) ? vehicleClassText : null;
    if (!vehicleClass) {
      issues.push(
        `Row ${rowNumber}: vehicle_class must be private_car, taxi, motorcycle, commercial_vehicle, bus, or heavy_vehicle.`,
      );
    }

    const speedLimitText =
      typeof row.speed_limit_kmh === "string" ? row.speed_limit_kmh : "";
    const speedLimitKmh = Number(speedLimitText);
    if (!/^\d+$/.test(speedLimitText) || !Number.isInteger(speedLimitKmh) || speedLimitKmh < 1 || speedLimitKmh > 200) {
      issues.push(`Row ${rowNumber}: speed_limit_kmh must be a whole number between 1 and 200.`);
    }

    const sourceUrlText = typeof row.source_url === "string" ? row.source_url.trim() : "";
    if (
      row.source_url !== undefined &&
      row.source_url !== null &&
      typeof row.source_url !== "string"
    ) {
      issues.push(`Row ${rowNumber}: source_url must be a valid HTTPS URL.`);
    }
    let sourceUrl: string | null = null;
    if (sourceUrlText) {
      try {
        const url = new URL(sourceUrlText);
        if (url.protocol !== "https:") throw new Error("HTTPS required");
        sourceUrl = url.toString();
      } catch {
        issues.push(`Row ${rowNumber}: source_url must be a valid HTTPS URL.`);
      }
    }

    const sourcePublishedAt = optionalDate(
      row.source_published_at ?? "",
      "source_published_at",
      issues,
      rowNumber,
    );
    const effectiveFrom = optionalDate(row.effective_from ?? "", "effective_from", issues, rowNumber);
    const expiresAt = optionalDate(row.expires_at ?? "", "expires_at", issues, rowNumber);
    if (effectiveFrom && expiresAt && expiresAt <= effectiveFrom) {
      issues.push(`Row ${rowNumber}: expires_at must be later than effective_from.`);
    }

    return {
      sourceReference,
      sourceUrl,
      sourcePublishedAt,
      roadName,
      direction: direction ?? "both",
      vehicleClass: vehicleClass ?? "private_car",
      speedLimitKmh,
      coordinates,
      effectiveFrom,
      expiresAt,
    };
  });

  if (issues.length > 0) throw new OfficialImportValidationError(issues);

  return { sourceAuthority, sourceDocument, sourceFileName, sourceFileSha256, rows };
}
