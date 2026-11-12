import type {IncomingMessage,ServerResponse} from 'node:http';
import {buildApp} from './app.js';
export function createServerlessHandler(factory=buildApp){let application:ReturnType<typeof buildApp>|undefined;
 return async function handler(request:IncomingMessage,response:ServerResponse){try{application??=factory().then(async app=>{await app.ready();return app;}).catch(error=>{application=undefined;throw error;});const app=await application;app.server.emit('request',request,response);}catch{response.statusCode=503;response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');response.end(JSON.stringify({error:'ROVA backend is not ready.'}));}};
}
export default createServerlessHandler();
