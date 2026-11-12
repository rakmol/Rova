import { z } from "zod";
export function validateInput(schema: z.ZodType, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw Object.assign(parsed.error, { statusCode: 400 });
}
export const coordinateText = z.string().max(80).regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).refine((text) => {
  const [longitude, latitude] = text.split(",").map(Number);
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90;
}, "Use WGS84 longitude,latitude within valid bounds.");
export const routesQuerySchema = z.object({ origin: coordinateText, destination: coordinateText }).strict();
export const placesQuerySchema = z.object({ q: z.string().trim().min(2).max(256), proximity: coordinateText }).strict();
const text = z.string().trim().min(1).max(1000);
export const importBodySchema = z.object({
  sourceAuthority: text, sourceDocument: text, sourceFileName: text, sourceFileSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  records: z.array(z.object({ source_reference: text, source_url: z.string().max(2000).optional(), source_published_at: z.string().max(80).optional(), road_name: text, direction: text, vehicle_class: text, speed_limit_kmh: text, coordinates: z.string().max(20000), effective_from: z.string().max(80).optional(), expires_at: z.string().max(80).optional() }).strict()).min(1).max(500),
}).strict();
