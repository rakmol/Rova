import {build} from 'esbuild';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Inline workspace TypeScript; published Node dependencies retain their own native loaders.
// No environment values are substituted into the artifact.
await build({entryPoints:[resolve(root,'apps/api/src/serverless.ts')],outfile:resolve(root,'apps/api/dist/serverless.mjs'),platform:'node',target:'node24',format:'esm',bundle:true,packages:'external',plugins:[{name:'rova-shared',setup(api){api.onResolve({filter:/^@rova\/shared$/},()=>({path:resolve(root,'packages/shared/src/index.ts'),external:false}));}}],logLevel:'warning'});
