export type IncidentCategory = 'pothole' | 'flood' | 'collision' | 'closure' | 'congestion' | 'obstacle';
export type IncidentStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export interface CommunityIncident {
  id: string; category: IncidentCategory; status: IncidentStatus;
  coordinate: [number, number]; approximateRadiusMeters: number;
  reportedAt: string; expiresAt: string; revision: number;
  confirmations: number; notThere: number; confidence: number;
  evidence: 'community'; authorityVerified: false;
}
export interface HazardSnapshot {
  type: 'snapshot';
  region: { lon: number; lat: number; radiusMeters: 4000 };
  checkedAt: string;
  reports: CommunityIncident[];
  truncated: boolean;
  traffic: { status: 'unavailable'; measurements: false };
}
