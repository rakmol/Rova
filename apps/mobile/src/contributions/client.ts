import { incidentSession, reportingRequest } from '../incidents/client';
export type ContributionKind = 'place' | 'fixed_camera';
export type Contribution = { id:string;kind:ContributionKind;name:string;category:string;status:'pending'|'reviewed'|'rejected';created_at:string;expires_at:string };
export type Proposal = {kind:ContributionKind;name:string;category:string;lon:number;lat:number;note:string;direction:string;interaction:'parked'|'passenger'};
export async function submitContribution(proposal:Proposal) {
  const data=await reportingRequest('/contributions','POST',proposal,await incidentSession()) as {id?:unknown;duplicate?:unknown;authorityVerified?:unknown};
  if(typeof data.id!=='string'||typeof data.duplicate!=='boolean'||data.authorityVerified!==false)throw new Error('Could not confirm your submission. Check your contributions before retrying.');
  return data;
}
export async function myContributions():Promise<Contribution[]> {
  const data=await reportingRequest('/contributions/mine','GET',undefined,await incidentSession()) as {rows?:Contribution[];authorityVerified?:unknown};
  if(data.authorityVerified!==false||!Array.isArray(data.rows)||data.rows.length>30||data.rows.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||!['place','fixed_camera'].includes(r.kind)||!['pending','reviewed','rejected'].includes(r.status)))throw new Error('Could not load your contributions.');
  return data.rows;
}
