-- Explicit opt-in only. These are arbitrary test coordinates, not Ghana road data.
DO $$ BEGIN
 IF current_setting('rova.allow_synthetic_seed',true) IS DISTINCT FROM 'on'
 OR coalesce(current_setting('rova.environment',true),'production') NOT IN ('development','test')
 THEN RAISE EXCEPTION 'Synthetic seed requires an explicit local development/test opt-in'; END IF;
END $$;
INSERT INTO data_sources(id,kind,authority,title,reference,license_note,created_by)
 VALUES('00000000-0000-4000-8000-000000000001','synthetic','SYNTHETIC DEMO','NOT REAL ROAD DATA','synthetic-demo-v1','Generated fixture; never verified','demo-seed') ON CONFLICT(id) DO NOTHING;
INSERT INTO road_segments(id,geometry,direction,road_name,source_id,source_reference,is_synthetic,created_by)
 VALUES('00000000-0000-4000-8000-000000000002',ST_GeomFromText('LINESTRING(0 0,0.001 0.001)',4326),'both','SYNTHETIC DEMO - NOT A REAL ROAD','00000000-0000-4000-8000-000000000001','synthetic-demo-v1',true,'demo-seed') ON CONFLICT(id) DO NOTHING;
INSERT INTO speed_limit_rules(id,road_segment_id,vehicle_class,speed_limit_kmh,status,created_by,source_id,source_reference,is_synthetic)
 VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','private_car',30,'draft','demo-seed','00000000-0000-4000-8000-000000000001','synthetic-demo-v1',true) ON CONFLICT(id) DO NOTHING;
