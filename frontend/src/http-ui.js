export function emptyRow() {
  return { key: '', value: '', enabled: true };
}

export function cloneRows(rows) {
  return (rows || []).map((r) => ({
    key: r.key || '',
    value: r.value || '',
    enabled: r.enabled !== false,
  }));
}

export function rowsFromMap(map) {
  const rows = Object.entries(map || {}).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
    enabled: true,
  }));
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function enabledMap(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    out[r.key] = r.value ?? '';
  }
  return out;
}

function ensureURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t.replace(/^\/\//, '')}`);
  } catch {
    return null;
  }
}

export function parseQuery(url) {
  const u = ensureURL(url);
  if (!u) return [emptyRow()];
  const rows = [];
  for (const [key, value] of u.searchParams) {
    rows.push({ key, value, enabled: true });
  }
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function applyQuery(url, rows) {
  const u = ensureURL(url);
  if (!u) return url;
  u.search = '';
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    u.searchParams.append(r.key, r.value ?? '');
  }
  return u.toString();
}

export function formEncode(rows) {
  const p = new URLSearchParams();
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    p.append(r.key, r.value ?? '');
  }
  return p.toString();
}

export function parseForm(body) {
  const rows = [];
  const raw = String(body || '').trim();
  if (raw) {
    const p = new URLSearchParams(raw);
    for (const [key, value] of p) rows.push({ key, value, enabled: true });
  }
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function basicToken(user, pass) {
  const s = `${user || ''}:${pass || ''}`;
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return btoa(s);
  }
}

export function mergeRequestHeaders(headerRows, auth, bodyType, hasBody) {
  const headers = enabledMap(headerRows);
  if (auth?.type === 'bearer' && auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  } else if (auth?.type === 'basic' && (auth.user || auth.pass)) {
    headers.Authorization = `Basic ${basicToken(auth.user, auth.pass)}`;
  }
  const hasCT = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasCT && hasBody) {
    if (bodyType === 'json') headers['Content-Type'] = 'application/json';
    else if (bodyType === 'form') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    else if (bodyType === 'text') headers['Content-Type'] = 'text/plain; charset=utf-8';
  }
  return headers;
}

const AUTO_UA = 'ApiTester';
const AUTO_ACCEPT = 'application/json, text/plain, */*';

export function headerValue(headers, name) {
  if (!headers) return '';
  const want = String(name || '').toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return String(v ?? '');
  }
  return '';
}

export function methodOmitsBody(method) {
  switch (String(method || '').toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'DELETE':
    case 'OPTIONS':
      return true;
    default:
      return false;
  }
}

export function parseAuthorization(headers) {
  const raw = headerValue(headers, 'Authorization');
  if (!raw) return { type: 'none', token: '', user: '', pass: '' };
  const bearer = raw.match(/^Bearer\s+(\S[\s\S]*)$/i);
  if (bearer) {
    return { type: 'bearer', token: bearer[1].trim(), user: '', pass: '' };
  }
  const basic = raw.match(/^Basic\s+(\S+)$/i);
  if (basic) {
    try {
      const decoded = decodeURIComponent(escape(atob(basic[1].trim())));
      const i = decoded.indexOf(':');
      return {
        type: 'basic',
        token: '',
        user: i >= 0 ? decoded.slice(0, i) : decoded,
        pass: i >= 0 ? decoded.slice(i + 1) : '',
      };
    } catch {
      return { type: 'basic', token: '', user: '', pass: '' };
    }
  }
  return { type: 'none', token: '', user: '', pass: '' };
}

export function guessBodyType(headers, body, method) {
  const ct = headerValue(headers, 'Content-Type').toLowerCase();
  const raw = String(body || '').trim();
  if (ct.includes('application/x-www-form-urlencoded')) return 'form';
  if (ct.includes('application/json')) return raw || !methodOmitsBody(method) ? 'json' : 'none';
  if (ct.includes('text/plain')) return raw ? 'text' : 'none';
  if (!raw) return methodOmitsBody(method) ? 'none' : 'json';
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    return 'json';
  }
  if (raw.includes('=') && !raw.includes('{') && !raw.includes('[')) return 'form';
  return 'text';
}

export function editorHeadersFromRequest(headers, opts = {}) {
  const stripAuth = opts.stripAuth !== false;
  const stripContentType = Boolean(opts.stripContentType);
  const rows = [];
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase();
    if (stripAuth && lk === 'authorization') continue;
    if (stripContentType && lk === 'content-type') continue;
    if (lk === 'user-agent' && String(v).trim() === AUTO_UA) continue;
    if (lk === 'accept' && String(v).trim() === AUTO_ACCEPT) continue;
    rows.push({ key: k, value: String(v ?? ''), enabled: true });
  }
  if (!rows.length) rows.push(emptyRow());
  else if (rows[rows.length - 1].key) rows.push(emptyRow());
  return rows;
}

export function parseHTTPOutPreview(text) {
  const m = String(text || '').trim().match(
    /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)$/i,
  );
  if (!m) return null;
  return { method: m[1].toUpperCase(), url: m[2] };
}

export function renderKV(root, rows, onChange) {
  if (!root) return;
  root.innerHTML = '';
  rows.forEach((row, i) => {
    const line = document.createElement('div');
    line.className = 'kv-row';
    line.innerHTML = `
      <input type="checkbox" class="kv-on" ${row.enabled ? 'checked' : ''} title="启用"/>
      <input class="input kv-key" spellcheck="false" placeholder="Key"/>
      <input class="input kv-val" spellcheck="false" placeholder="Value"/>
      <button type="button" class="btn ghost kv-del" title="删除">×</button>
    `;
    line.querySelector('.kv-key').value = row.key;
    line.querySelector('.kv-val').value = row.value;
    line.querySelector('.kv-on').addEventListener('change', (e) => {
      rows[i].enabled = e.target.checked;
      onChange?.();
    });
    line.querySelector('.kv-key').addEventListener('input', (e) => {
      rows[i].key = e.target.value;
      if (i === rows.length - 1 && e.target.value) {
        rows.push(emptyRow());
        renderKV(root, rows, onChange);
      }
      onChange?.();
    });
    line.querySelector('.kv-val').addEventListener('input', (e) => {
      rows[i].value = e.target.value;
      onChange?.();
    });
    line.querySelector('.kv-del').addEventListener('click', () => {
      if (rows.length === 1) {
        rows[0] = emptyRow();
      } else {
        rows.splice(i, 1);
      }
      renderKV(root, rows, onChange);
      onChange?.();
    });
    root.appendChild(line);
  });
}
