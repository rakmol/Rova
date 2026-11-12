import { readFile } from 'node:fs/promises';

// Operator-only Management API action, never exposed by the public ROVA API.
// Project publishable/service keys cannot authorize this project-settings change.
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectUrl = process.env.SUPABASE_URL;
if (!token || !projectUrl) throw new Error('A Supabase Management API access token and the ROVA project URL are required. Keep the token out of chat.');
const origin = new URL(projectUrl);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(projectUrl)) throw new Error('Use the hosted ROVA Supabase project origin.');
const projectRef = origin.hostname.split('.')[0];
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const content = await readFile(new URL('../templates/magic-link.html', import.meta.url), 'utf8');
if (!content.includes('{{ .Token }}')) throw new Error('The email must contain the OTP token placeholder.');
async function call(method: 'GET' | 'PATCH', body?: object) {
  const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Supabase template configuration failed (HTTP ${response.status}); private response omitted.`);
  return response.json() as Promise<Record<string, unknown>>;
}
await call('GET'); // Confirm project-management access before attempting a change.
await call('PATCH', { mailer_templates_magic_link_content: content, mailer_subjects_magic_link: 'Your ROVA sign-in code' });
const saved = await call('GET');
if (saved.mailer_templates_magic_link_content !== content) throw new Error('Template readback did not match; check the project configuration.');
console.log(JSON.stringify({ configured: true, template: 'magic_link', otpPlaceholderPresent: true }));
