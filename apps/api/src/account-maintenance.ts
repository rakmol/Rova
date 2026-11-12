import { Pool } from 'pg';
import { readConfig } from './config.js';
import { processAccountDeletion,supabaseProvider } from './accounts.js';
const config=readConfig();const auth=supabaseProvider({url:config.SUPABASE_URL,publishableKey:config.SUPABASE_PUBLISHABLE_KEY,secretKey:config.SUPABASE_SECRET_KEY});
if(!auth)throw new Error('Configure the private account provider before retrying deletion jobs.');
const db=new Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{const jobs=await db.query('SELECT user_id,provider_subject FROM driver_deletion_jobs WHERE completed_at IS NULL AND next_attempt_at<=now() AND provider_issuer=$1 ORDER BY requested_at LIMIT 100',[auth.issuer]);let completed=0;for(const job of jobs.rows)if(await processAccountDeletion(db,auth,job.user_id,job.provider_subject))completed++;
  const c=await db.connect();try{await c.query('BEGIN');const old=await c.query("DELETE FROM driver_deletion_jobs WHERE completed_at<now()-interval '30 days' RETURNING user_id");for(const row of old.rows)await c.query("DELETE FROM users WHERE id=$1 AND status='deleted'",[row.user_id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  console.log(JSON.stringify({attempted:jobs.rowCount,completed}));}finally{await db.end();}
