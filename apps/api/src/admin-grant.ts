import {createClient}from'@supabase/supabase-js';
import {Pool}from'pg';
import {readConfig}from'./config.js';
import {actionLog,inTransaction}from'./admin-records.js';
const config=readConfig();const [email,role]=process.argv.slice(2);
if(!email||!['viewer','reviewer','editor','administrator'].includes(role)||!config.SUPABASE_URL||!config.SUPABASE_SECRET_KEY)throw new Error('Usage: admin:grant -- email role; requires private Supabase config.');
const client=createClient(config.SUPABASE_URL,config.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let subject:string|undefined;
for(let page=1;page<=100;page++){const{data,error}=await client.auth.admin.listUsers({page,perPage:100});if(error)throw new Error('Could not inspect the configured project.');const found=data.users.find(u=>u.email?.toLowerCase()===email.toLowerCase());if(found){subject=found.id;break;}if(data.users.length<100)break;}
if(!subject)throw new Error('Create this user in ROVA Supabase Auth before assigning an operations role.');
const issuer=new URL(config.SUPABASE_URL).origin+'/auth/v1';
const db=new Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{await inTransaction(db,async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('rova.admin-members'))");const previous=(await c.query('SELECT role,active FROM admin_members WHERE issuer=$1 AND subject=$2',[issuer,subject])).rows[0];
if(previous?.role==='administrator'&&previous.active&&role!=='administrator'&&(await c.query("SELECT count(*)::int AS n FROM admin_members WHERE issuer=$1 AND role='administrator' AND active",[issuer])).rows[0].n<=1)throw new Error('The final administrator cannot be demoted.');
await c.query(`INSERT INTO admin_members(issuer,subject,role,granted_by) VALUES($1,$2,$3,'operator-cli') ON CONFLICT(issuer,subject) DO UPDATE SET role=$3,active=true,granted_by='operator-cli',granted_at=now()`,[issuer,subject,role]);await actionLog(c,'operator-cli','bootstrap_role','member',subject!,previous??null,{subject,role,active:true},'Explicit operator assignment to the requested Supabase Auth user.');});console.log(JSON.stringify({roleGranted:role,userMatched:true}));}finally{await db.end();}
