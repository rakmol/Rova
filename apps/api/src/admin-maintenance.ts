import {databaseConnection} from './database.js';
import {Pool} from 'pg';
import {readConfig} from './config.js';
const config=readConfig();
const db=new Pool(databaseConnection(config));
try{
 const sessions=await db.query('DELETE FROM admin_sessions WHERE expires_at<now() OR revoked_at IS NOT NULL');
 const coverage=await db.query("DELETE FROM coverage_daily WHERE day<=current_date-30");
 const diagnostics=await db.query("DELETE FROM pilot_telemetry_batches WHERE received_day<=(now() AT TIME ZONE 'UTC')::date-29");
 const consent=await db.query("DELETE FROM pilot_telemetry_sessions WHERE expires_at<now()-interval '30 days'");
 console.log(JSON.stringify({diagnosticBatchesRemoved:diagnostics.rowCount,expiredDiagnosticLeasesRemoved:consent.rowCount,expiredSessionsRemoved:sessions.rowCount,oldCoverageCellsRemoved:coverage.rowCount}));
}finally{await db.end();}
