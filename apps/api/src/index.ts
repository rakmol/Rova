import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
try {
 const config = readConfig();
 const app = await buildApp({ config });
 const shutdown = () => { void app.close().catch(() => { process.exitCode = 1; }); };
 process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
 try { await app.listen({ host: config.HOST, port: config.PORT }); }
 catch { app.log.error("API could not start"); await app.close(); process.exitCode = 1; }
} catch (error) { console.error(error instanceof Error ? error.message : "API initialization failed"); process.exitCode = 1; }
