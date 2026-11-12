const { getDefaultConfig } = require("expo/metro-config");
const http = require("node:http");

const config = getDefaultConfig(__dirname);
const previous = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = previous ? previous(middleware, server) : middleware;
  return (request, response, fallback) => {
    const url = new URL(request.url, "http://localhost");
    const incidentPath = url.pathname.slice('/rova-api/incidents'.length);
    const isIncident = url.pathname.startsWith('/rova-api/incidents') && (/^(?:|\/session|\/nearby|\/approved|\/stream|\/[a-f0-9-]{36}\/votes)$/.test(incidentPath));
    const isStream = isIncident && incidentPath === '/stream';
    const accountPath = url.pathname.startsWith('/rova-api/') ? url.pathname.slice('/rova-api'.length) : '';
    const isAccount = /^\/v1\/(?:auth\/(?:status|code|verify|refresh|sign-out)|me(?:\/(?:sync|erase-data|delete-account))?)$/.test(accountPath);
    const isNotification = /^\/v1\/notifications\/(?:status|session|preferences|erase|inbox)$/.test(accountPath);
    const isEraseDevice = url.pathname === '/rova-api/incidents/erase-device';
    const target = isNotification ? accountPath : isAccount ? accountPath : isEraseDevice ? '/v1/incidents/erase-device' : isIncident ? `/v1/incidents${incidentPath}` : url.pathname === "/rova-api/places/search" ? "/v1/places/search" : url.pathname === "/rova-api/routes" ? "/routes" : url.pathname === "/rova-api/safety/offline-pack" ? "/safety/offline-pack" : url.pathname === "/rova-api/safety/alert-context" ? "/safety/alert-context" : null;
    if (!target) return next(request, response, fallback);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    const method = isNotification ? ['/v1/notifications/status','/v1/notifications/inbox'].includes(accountPath) ? 'GET' : accountPath.endsWith('/preferences') ? request.method : 'POST' : isAccount ? ['/v1/auth/status','/v1/me'].includes(accountPath) ? 'GET' : 'POST' : isEraseDevice ? 'POST' : isIncident ? ['/nearby','/approved','/stream'].includes(incidentPath) ? 'GET' : 'POST' : target === "/safety/alert-context" ? "POST" : "GET";
    if (!['GET','POST'].includes(method) || request.method !== method) { response.statusCode = 405; response.end('{"error":"Method not allowed."}'); return; }
    // Development only: expose search, routing, bounded compliance and public community incident routes.
    // Keys and all other backend/admin routes remain on the separate API process.
    const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : {};
    if ((isIncident || isAccount || isEraseDevice || isNotification) && request.headers.authorization) headers.Authorization = request.headers.authorization;
    const upstream = http.request({ hostname: "127.0.0.1", port: 4000, method, headers, path: `${target}${url.search}` }, (result) => {
      response.statusCode = result.statusCode || 502;
      if (isStream) { response.setHeader('Content-Type', result.headers['content-type'] || 'application/json'); response.setHeader('Cache-Control','no-store, no-transform'); response.flushHeaders(); }
      if (result.headers["x-rova-places-storage"]) response.setHeader("x-rova-places-storage", result.headers["x-rova-places-storage"]);
      result.pipe(response);
    });
    upstream.setTimeout(isStream ? 20000 : target === "/routes" ? 28000 : 10000, () => upstream.destroy());
    upstream.on("error", () => {
      if (response.writableEnded) return;
      if (!response.headersSent) response.statusCode = 503;
      response.end('{"error":"ROVA backend is not running. Try again later."}');
    });
    request.on("aborted", () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    if (method === "POST") {
      let size = 0; let oversized = false; const chunks = [];
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > (isAccount ? 65536 : 32768)) { if (!oversized) { oversized = true; response.statusCode = 413; response.end('{"error":"Request too large."}'); upstream.destroy(); } return; }
        chunks.push(chunk);
      });
      request.on("end", () => { if (!oversized) upstream.end(Buffer.concat(chunks)); });
    } else upstream.end();
  };
};
module.exports = config;
