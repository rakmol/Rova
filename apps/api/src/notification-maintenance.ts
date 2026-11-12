import {Pool} from 'pg';
import {readConfig} from './config.js';
import {runNotificationWorker} from './notification-worker.js';
const config=readConfig(),db=new Pool({connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{console.log(JSON.stringify(await runNotificationWorker(db,config)));}finally{await db.end();}
