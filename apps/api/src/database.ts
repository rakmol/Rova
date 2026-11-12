import type {ApiConfig} from './config.js';
export function databaseConnection(config:ApiConfig){return{connectionString:config.DATABASE_URL,ssl:config.DATABASE_SSL==='true'?{rejectUnauthorized:true,...(config.DATABASE_CA_BASE64?{ca:Buffer.from(config.DATABASE_CA_BASE64,'base64').toString('utf8')}:{})}:undefined,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6500};}
export function databasePool(config:ApiConfig){return{...databaseConnection(config),max:config.DATABASE_POOL_MAX,idleTimeoutMillis:10000,allowExitOnIdle:true};}
