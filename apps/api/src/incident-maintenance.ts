import { Pool } from 'pg';
import { readConfig } from './config.js';
// Operator scheduled maintenance. Expiry filtering also applies at read time.
const config=readConfig();const pool=new Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  await client.query("SELECT set_config('rova.actor_id','incident-maintenance',true)");
  await client.query("UPDATE incident_reports SET community_status='expired',revision=revision+1 WHERE community_status IN ('pending','verified') AND expires_at<=now()");
  await client.query("DELETE FROM incident_abuse_buckets WHERE window_start<now()-interval '2 days'");
  await client.query("DELETE FROM incident_sessions WHERE expires_at<now()-interval '1 day'");
  // Bounded retention of reporter associations and private notes; audit contains status only.
  await client.query("DELETE FROM incident_confirmations WHERE incident_report_id IN (SELECT id FROM incident_reports WHERE community_status IS NOT NULL AND expires_at<now()-interval '7 days')");
  await client.query("UPDATE incident_reports SET submitted_by_device=NULL,submitted_by_user=NULL,description='Expired community road report' WHERE community_status IS NOT NULL AND expires_at<now()-interval '7 days' AND (submitted_by_device IS NOT NULL OR description<>'Expired community road report')");
  await client.query('COMMIT');console.log('Incident expiry and privacy retention maintenance completed.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
