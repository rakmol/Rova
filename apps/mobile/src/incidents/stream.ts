import { approvedHazards, clearIncidentSession, incidentEndpoint, incidentSession } from './client';
import { SseParser, type HazardTransport } from './realtime';

export function hazardTransport(lon: number, lat: number): HazardTransport {
  return {
    refresh: signal => approvedHazards(lon, lat, signal),
    stream: async (signal, onSnapshot) => {
      if (!incidentEndpoint) throw new Error('Hazard updates are not connected');
      const url = new URL(`${incidentEndpoint.replace(/\/$/, '')}/stream`);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Hazard updates require HTTPS');
      url.searchParams.set('lon', String(lon)); url.searchParams.set('lat', String(lat));
      const token = await incidentSession();
      if (signal.aborted) return;
      const controller = new AbortController(); const cancel = () => controller.abort();
      signal.addEventListener('abort', cancel, { once: true });
      let activity = Date.now();
      const watchdog = setInterval(() => { if (Date.now() - activity > 20000) controller.abort(); }, 5000);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const { fetch } = await import('expo/fetch');
        const response = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` } });
        if (response.status === 401) clearIncidentSession();
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Realtime unavailable');
        reader = response.body.getReader();
        const decoder = new TextDecoder(); const parser = new SseParser();
        while (!signal.aborted) {
          const part = await reader.read(); if (part.done) break;
          for (const frame of parser.push(decoder.decode(part.value, { stream: true }))) {
            if (frame.event === 'unavailable') throw new Error('Hazard service unavailable');
            if (frame.event === 'snapshot') { activity = Date.now(); onSnapshot(frame.data); }
          }
        }
      } finally { clearInterval(watchdog); signal.removeEventListener('abort', cancel); controller.abort(); await reader?.cancel().catch(() => {}); }
    },
  };
}
