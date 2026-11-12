import {Pool} from 'pg';
import {readConfig} from './config.js';
const config=readConfig();
const db=new Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{
 const sessions=await db.query('DELETE FROM admin_sessions WHERE expires_at<now() OR revoked_at IS NOT NULL');
 const coverage=await db.query("DELETE FROM coverage_daily WHERE day<=current_date-30");
 console.log(JSON.stringify({expiredSessionsRemoved:sessions.rowCount,oldCoverageCellsRemoved:coverage.rowCount}));
}finally{await db.end();}
