export * from "./compliance";
export interface ServiceHealth {
  service: string;
  status: "ok";
}

export type RoutingCoordinate = [number, number];
export interface RoutingOption {
  id: string;
  label: string;
  geometry: { type: "LineString"; coordinates: RoutingCoordinate[] };
  distanceMeters: number;
  durationSeconds: number;
  maneuvers: { instruction: string; distanceMeters: number | null; durationSeconds: number | null; geometryIndex?: number }[];
  tolls: "present" | "none_reported" | "unknown";
  trafficAware: false;
  etaKind: "static_estimate";
  isSample: boolean;
  attribution: string;
}
export interface RoutingResponse {
  provider: "geoapify";
  routes: RoutingOption[];
  warnings: string[];
  fetchedAt: string;
}
export interface RoutingProvider {
  routes(origin: RoutingCoordinate, destination: RoutingCoordinate, signal?: AbortSignal): Promise<RoutingResponse>;
}

export type SpeedLimitStatus = "verified" | "unknown";

export interface SpeedLimitLookup {
  road_segment_id: string;
  speed_limit_kmh: number | null;
  status: SpeedLimitStatus;
  verified_at?: string;
  source_type?: "authority" | "field_audit" | "mapping_provider";
}

export type RoadDirection = "forward" | "reverse" | "both";

export type VehicleClass =
  | "private_car"
  | "taxi"
  | "motorcycle"
  | "commercial_vehicle"
  | "bus"
  | "heavy_vehicle";

export interface OfficialSpeedRuleCsvRow {
  source_reference: string;
  source_url: string;
  source_published_at: string;
  road_name: string;
  direction: string;
  vehicle_class: string;
  speed_limit_kmh: string;
  coordinates: string;
  effective_from: string;
  expires_at: string;
}

export interface OfficialSpeedRuleImportRequest {
  sourceAuthority: string;
  sourceDocument: string;
  sourceFileName: string;
  sourceFileSha256: string;
  records: OfficialSpeedRuleCsvRow[];
}

export interface OfficialSpeedRuleImportResult {
  importBatchId: string;
  importedDrafts: number;
  status: "draft";
}
export type { CommunityIncident, IncidentCategory, IncidentStatus, HazardSnapshot } from './incidents';

export {ruleProblem,evaluateSpeedLimit,gpsProblem,unknownSpeedLimit,type SafetyFix,type SafetySource,type SafetyRule,type RoadCandidate,type SpeedUnknownReason} from './speed-limit';
export {validateSafetyPack,offlinePackState,offlineSpeedLimit,OFFLINE_SAFETY_TTL,type OfflineSafetyPack} from './offline';

export {NOTIFICATION_TIME_ZONE,defaultNotificationPreferences,validRenewalDate,accraDay,accraAt,pushWindow,planRenewals,type RenewalKind,type RenewalReminder,type SavedNotificationRegion,type NotificationPreferences} from './notifications';
export {PROVIDER_COST_REVIEW_DATE,estimateProviderCosts,planningAlert,type CostScenario} from './provider-costs';
export {PILOT_CONSENT_VERSION,pilotMetrics,pilotCounts,pilotRatio,pilotSummary,type PilotMetric,type PilotCounts} from './pilot';
