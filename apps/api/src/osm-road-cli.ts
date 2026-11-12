import { readFile,writeFile,stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { readConfig } from "./config.js";
import { hash,osmReviewPack,prepareOsmRoads,stageOsmRoads } from "./osm-road-import.js";
import { renderOsmReviewMap } from "./osm-review-map.js";
const [command,inputFile,snapshotAt,outputFile] = process.argv.slice(2);
async function main(){
  if(!["inspect","stage","review-pack","review-map"].includes(command)||!inputFile||!snapshotAt)throw new Error("Use inspect|stage|review-pack|review-map INPUT.geojson SOURCE_SNAPSHOT_ISO [OUTPUT]. This never approves or publishes data.");
  const file=resolve(inputFile);if((await stat(file)).size>64*1024*1024)throw new Error("Maximum GeoJSON size is 64 MiB; split the source extract.");
  const raw=await readFile(file,"utf8");const prepared=prepareOsmRoads(JSON.parse(raw),snapshotAt,Date.now(),{includeNamedRoadsWithoutSpeed:process.argv.includes('--named-context')});
  const counts=()=>({inputFeatures:prepared.inputFeatures,candidates:prepared.candidates.length,skipped:prepared.skipped,supportedMappedRules:prepared.candidates.reduce((n,c)=>n+c.rules.length,0),sourceSnapshotAt:prepared.snapshotAt,reviewState:"pending_review",publishedRules:0});
  if(command==="inspect")return console.log(JSON.stringify(counts(),null,2));
  if(command==="review-pack"||command==="review-map"){
    if(!outputFile)throw new Error("An output path is required.");
    const output=resolve(outputFile);if(output===file)throw new Error("Review output must not replace the source file.");
    await writeFile(output,command==="review-map"?renderOsmReviewMap(prepared):JSON.stringify(osmReviewPack(prepared),null,2),{flag:"wx"});return console.log(JSON.stringify({...counts(),output}));
  }
  const config=readConfig();const url=new URL(config.DATABASE_URL);
  // Operator tooling is local-only until production reviewer authentication exists.
  if(config.NODE_ENV==="production"||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||!/^\/rova(?:_test_[a-z0-9_]+)?$/.test(url.pathname)||url.port!=="54329")throw new Error("Staging CLI is restricted to the local ROVA database on port 54329.");
  const actor=process.env.ROVA_DATA_OPERATOR;if(!actor)throw new Error("Set ROVA_DATA_OPERATOR to the actual operator identity; no reviewer identity is invented.");
  const client=new Client({connectionString:config.DATABASE_URL,connectionTimeoutMillis:5000});await client.connect();
  try{const result=await stageOsmRoads(client,prepared,hash(raw),actor);console.log(JSON.stringify({...counts(),...result}));}finally{await client.end();}
}
main().catch((error)=>{console.error(error instanceof Error&&!(error as {code?:string}).code?error.message:"Map-data operation failed; inspect source shape and database setup.");process.exitCode=1;});
