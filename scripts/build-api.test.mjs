import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('hosted artifact loads in native Node without a workspace TypeScript loader',()=>{execFileSync(process.execPath,['scripts/build-api.mjs'],{stdio:'pipe'});const output=readFileSync('apps/api/dist/serverless.mjs','utf8');assert.doesNotMatch(output,/from\s+['"]@rova\/shared['"]/);execFileSync(process.execPath,['--input-type=module','-e',"const m=await import('./apps/api/dist/serverless.mjs');if(typeof m.default!=='function'||typeof m.createServerlessHandler!=='function')throw Error('Invalid server artifact');"],{env:{...process.env,NODE_OPTIONS:''},stdio:'pipe'});});
