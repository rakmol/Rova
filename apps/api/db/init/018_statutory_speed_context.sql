-- No road is assigned a category or published by this migration.
ALTER TABLE road_segments ADD COLUMN speed_context text NOT NULL DEFAULT 'unknown' CHECK(speed_context IN ('unknown','human_activity','built_up','outside_built_up','motorway')),
 ADD COLUMN speed_context_reference text, ADD COLUMN default_conditions_confirmed boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT road_default_context CHECK(NOT default_conditions_confirmed OR (speed_context<>'unknown' AND speed_context_reference IS NOT NULL AND length(trim(speed_context_reference))>0));
ALTER TABLE speed_limit_rules DROP CONSTRAINT speed_limit_rule_vehicle_check;
ALTER TABLE speed_limit_rules ADD CONSTRAINT speed_limit_rule_vehicle_check CHECK(vehicle_class IN ('all','private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle','loaded_heavy_vehicle','unloaded_heavy_vehicle','agricultural_vehicle','passenger_for_reward','light_vehicle'));
CREATE OR REPLACE FUNCTION rova_speed_limit_candidates(longitude double precision,latitude double precision,radius_m double precision,vehicle text)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF longitude IS NULL OR latitude IS NULL OR radius_m IS NULL OR vehicle IS NULL OR NOT longitude BETWEEN -180 AND 180 OR NOT latitude BETWEEN -90 AND 90
  OR NOT radius_m BETWEEN 1 AND 100 OR vehicle NOT IN ('private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle','loaded_heavy_vehicle','unloaded_heavy_vehicle','agricultural_vehicle','passenger_for_reward','light_vehicle')
 THEN RAISE EXCEPTION 'Invalid bounded safety lookup' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH point AS (SELECT ST_SetSRID(ST_MakePoint(longitude,latitude),4326) AS geom),
 nearby AS (
  SELECT r.*,ST_Distance(r.geometry::geography,p.geom::geography) AS distance_m,
   ST_LineLocatePoint(r.geometry,p.geom) AS fraction,ST_Length(r.geometry::geography) AS length_m
  FROM road_segments r CROSS JOIN point p LEFT JOIN data_sources rs ON rs.id=r.source_id
  WHERE NOT r.is_synthetic AND NOT coalesce(rs.is_synthetic,false)
   AND ST_DWithin(r.geometry::geography,p.geom::geography,radius_m)
  ORDER BY ST_Distance(r.geometry::geography,p.geom::geography),r.id LIMIT 17
 ) SELECT jsonb_build_object(
  'id',r.id,'distanceMeters',r.distance_m,'roadKind',r.road_kind,'gradeLevel',r.grade_level,'roadWidthMeters',r.road_width_meters,'direction',r.direction,
  'bearing',degrees(ST_Azimuth(ST_LineInterpolatePoint(r.geometry,greatest(0,r.fraction-5/greatest(1,r.length_m)))::geography,ST_LineInterpolatePoint(r.geometry,least(1,r.fraction+5/greatest(1,r.length_m)))::geography)),
  'endpointMeters',least(ST_Distance(ST_StartPoint(r.geometry)::geography,p.geom::geography),ST_Distance(ST_EndPoint(r.geometry)::geography,p.geom::geography)),
  'confidence',r.confidence,'accuracyMeters',r.accuracy_meters,'status',r.approval_status,'synthetic',r.is_synthetic,
  'validFrom',r.valid_from,'expiresAt',r.expires_at,'lastReviewedAt',r.last_reviewed_at,
  'speedContext',jsonb_build_object('category',r.speed_context,'reference',r.speed_context_reference,'defaultConfirmed',r.default_conditions_confirmed,
   'revisionId',(SELECT a.id FROM admin_revisions a WHERE a.entity='road' AND a.entity_id=r.id AND a.sequence=r.admin_revision_seq AND a.after_json=admin_content(to_jsonb(r)-ARRAY['distance_m','fraction','length_m'])),
   'independentApprovals',(SELECT count(DISTINCT v.reviewer) FROM admin_reviews v JOIN admin_revisions a ON a.id=v.revision_id WHERE a.entity='road' AND a.entity_id=r.id AND a.sequence=r.admin_revision_seq AND v.decision='approve' AND v.reviewer<>a.author AND v.reviewer<>r.created_by AND v.created_at>now()-interval '180 days' AND NOT EXISTS(SELECT 1 FROM admin_reviews rejected WHERE rejected.revision_id=a.id AND rejected.decision='reject')),
   'oldestApprovalAt',(SELECT min(v.created_at) FROM admin_reviews v JOIN admin_revisions a ON a.id=v.revision_id WHERE a.entity='road' AND a.entity_id=r.id AND a.sequence=r.admin_revision_seq AND v.decision='approve' AND v.reviewer<>a.author AND v.reviewer<>r.created_by),
   'auditLogId',(SELECT max(a.id)::text FROM admin_action_logs a WHERE a.entity='road' AND a.entity_id=r.id::text AND a.action='publish' AND (a.after_json->>'admin_revision_seq')::integer=r.admin_revision_seq)),
  'source',(SELECT jsonb_build_object('id',s.id,'kind',s.kind,'status',s.approval_status,'synthetic',s.is_synthetic,'reviewedAt',s.approved_at,'validFrom',s.valid_from,'expiresAt',s.expires_at,'document',s.reference,'url',s.source_url) FROM data_sources s WHERE s.id=r.source_id),
  'rules',coalesce((SELECT jsonb_agg(item) FROM (
   SELECT jsonb_build_object('id',v.id,'speedLimitKmh',v.speed_limit_kmh,'units',v.units,'vehicleClass',v.vehicle_class,'direction',v.direction,'role',v.rule_role,'evidenceType',v.evidence_type,'legalApplicability',v.legal_applicability,
    'status',v.status,'synthetic',v.is_synthetic,'confidence',v.confidence,'effectiveFrom',v.effective_from,'expiresAt',v.expires_at,'lastReviewedAt',v.last_reviewed_at,'revision',v.revision,'supersedesId',v.supersedes_rule_id,'reference',v.source_reference,
    'source',(SELECT jsonb_build_object('id',s.id,'kind',s.kind,'status',s.approval_status,'synthetic',s.is_synthetic,'reviewedAt',s.approved_at,'validFrom',s.valid_from,'expiresAt',s.expires_at,'document',s.reference,'url',coalesce(v.source_url,s.source_url)) FROM data_sources s WHERE s.id=v.source_id),
    'approvals',(SELECT count(DISTINCT a.reviewer_id) FROM speed_rule_approvals a WHERE a.speed_rule_id=v.id AND a.rule_revision=v.revision AND a.decision='approve' AND a.reviewer_id<>v.created_by),
    'oldestApprovalAt',(SELECT min(a.reviewed_at) FROM speed_rule_approvals a WHERE a.speed_rule_id=v.id AND a.rule_revision=v.revision AND a.decision='approve' AND a.reviewer_id<>v.created_by),
    'auditLogId',(SELECT max(a.id)::text FROM audit_logs a WHERE a.entity_id=v.id AND a.entity_type IN ('speed_limit_rules','speed_limit_rule','speed_rule'))
   ) AS item FROM speed_limit_rules v WHERE v.road_segment_id=r.id AND (v.vehicle_class IN (vehicle,'all') OR (v.vehicle_class='heavy_vehicle' AND vehicle IN ('loaded_heavy_vehicle','unloaded_heavy_vehicle'))) ORDER BY v.effective_from DESC NULLS LAST,v.id LIMIT 17
  ) records),'[]'::jsonb)
 ) FROM nearby r CROSS JOIN point p;
END $$;
REVOKE ALL ON FUNCTION rova_speed_limit_candidates(double precision,double precision,double precision,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_reader') THEN GRANT EXECUTE ON FUNCTION rova_speed_limit_candidates(double precision,double precision,double precision,text) TO rova_reader; END IF; END $$;
