import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { evaluateSpeedLimit, gpsProblem, unknownSpeedLimit, type RoadCandidate } from "./speed-limit.js";
import { validateInput } from "./validation.js";
const number = z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number).pipe(z.number().finite());
export const speedLimitQuerySchema = z.object({ lat: number.pipe(z.number().min(-90).max(90)), lon: number.pipe(z.number().min(-180).max(180)), heading: number.pipe(z.number().min(0).lt(360)).optional(), accuracy: number.pipe(z.number().min(0).max(10000)), timestamp: z.string().regex(/^\d{1,16}$/).transform(Number).pipe(z.number().int().safe()).optional(), vehicleType: z.enum(["private_car", "taxi", "motorcycle", "commercial_vehicle", "bus", "heavy_vehicle"]) }).strict();
export function registerSpeedLimitRoute(app: FastifyInstance, database: Pool, clock: () => number = Date.now,coverageEnabled=false) {
  app.get("/safety/speed-limit", { logLevel: "silent", config: { rateLimit: { max: 60, timeWindow: 60000 } } }, async (request, reply) => {
    validateInput(speedLimitQuerySchema, request.query);
    const fix = speedLimitQuerySchema.parse(request.query); const now = clock();
    const issue = gpsProblem(fix, now); if (issue) return unknownSpeedLimit(issue);
    try {
      const result = await database.query<{ candidate: RoadCandidate }>("SELECT candidate FROM public.rova_speed_limit_candidates($1,$2,$3,$4) AS candidates(candidate)", [fix.lon, fix.lat, 100, fix.vehicleType]);
      const answer=evaluateSpeedLimit(fix, result.rows.map((row) => row.candidate), clock());
      if(coverageEnabled&&answer.status==='unknown'&&fix.lon>=-4&&fix.lon<=2&&fix.lat>=4&&fix.lat<=12){void database.query(`INSERT INTO coverage_daily(cell_lon,cell_lat,reason) VALUES($1,$2,$3) ON CONFLICT(day,cell_lon,cell_lat,reason) DO UPDATE SET samples=least(1000000,coverage_daily.samples+1)`,[Math.round(fix.lon*20)/20,Math.round(fix.lat*20)/20,answer.reason]).catch(()=>{});}
      return answer;
    } catch { app.log.warn({ dependency: "speed-limit-data", requestId: request.id }, "Speed-limit lookup unavailable"); return reply.code(503).send(unknownSpeedLimit("service_unavailable")); }
  });
}
