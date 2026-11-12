import {releaseConfigErrors}from'./release-policy.mjs';
const profile=process.argv.includes('--production')?'production':process.env.EAS_BUILD_PROFILE;
const errors=releaseConfigErrors(process.env,profile);if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Build environment checked. This does not certify field, provider-rights or legal readiness.');
