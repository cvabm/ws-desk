export const HOST_VAR_KEY = 'BASE_URL';

const LEGACY_HOST_VAR_KEYS = new Set(['base_url', 'baseurl', 'host', 'url']);

export function emptyRow() {
  return { key: '', value: '', enabled: true };
}

export function isHostVarKey(key) {
  return LEGACY_HOST_VAR_KEYS.has(String(key || '').trim().toLowerCase());
}

export function ensureHostVarRows(rows, fallbackURL = '') {
  const list = cloneRows(rows);
  const found = list.find((r) => isHostVarKey(r.key));
  const others = list.filter((r) => !isHostVarKey(r.key));
  const host = {
    key: HOST_VAR_KEY,
    value: found ? found.value : String(fallbackURL || '').trim(),
    enabled: true,
  };
  const out = [host, ...others];
  if (!out.length || String(out[out.length - 1].key || '').trim()) out.push(emptyRow());
  return out;
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

export function httpExchangeFailed(ex) {
  if (!ex) return true;
  if (String(ex.error || '').trim()) return true;
  const code = Number(ex.statusCode) || 0;
  return code >= 400;
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

export function normalizeVarName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const wrapped = raw.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  return (wrapped ? wrapped[1] : raw).trim();
}

export function varsFromRows(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.enabled === false) continue;
    const k = normalizeVarName(r.key);
    if (!k) continue;
    out[k] = r.value ?? '';
  }
  return out;
}

function lookupVar(vars, name) {
  if (!vars || !name) return undefined;
  if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(vars)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function expandVars(text, vars, rounds = 5) {
  let s = String(text ?? '');
  if (!s || !vars || !Object.keys(vars).length) return s;
  for (let i = 0; i < rounds; i++) {
    let changed = false;
    const re = /\{\{\s*([^{}\s]+)\s*\}\}|%7B%7B\s*([^{}\s]+)\s*%7D%7D/g;
    s = s.replace(re, (m, a, b) => {
      const val = lookupVar(vars, a || b);
      if (val === undefined || val === '') return m;
      changed = true;
      return String(val);
    });
    if (!changed) break;
  }
  return s;
}

export function expandMap(map, vars) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    out[expandVars(k, vars)] = expandVars(String(v ?? ''), vars);
  }
  return out;
}

export function keepTemplate(current, incoming, vars) {
  const cur = String(current ?? '');
  const inc = String(incoming ?? '');
  if (cur === inc) return cur;
  if (cur.includes('{{') && expandVars(cur, vars) === inc) return cur;
  return inc;
}

export function wrapIfVarValue(text, vars) {
  const s = String(text ?? '');
  if (!s || s.includes('{{')) return s;
  let bestName = '';
  let bestLen = 0;
  for (const [name, val] of Object.entries(vars || {})) {
    const v = String(val ?? '');
    if (v && s === v && v.length >= bestLen) {
      bestLen = v.length;
      bestName = name;
    }
  }
  return bestName ? `{{${bestName}}}` : s;
}

export function keepTemplatesInRows(currentRows, previousRows, vars) {
  const prev = previousRows || [];
  return (currentRows || []).map((row) => {
    const match = prev.find((p) => {
      if (!p?.key) return false;
      return p.key === row.key
        || expandVars(p.key, vars) === row.key
        || expandVars(p.key, vars) === expandVars(row.key, vars);
    });
    const key = match ? keepTemplate(match.key, row.key, vars) : row.key;
    const value = wrapIfVarValue(
      match ? keepTemplate(match.value, row.value, vars) : row.value,
      vars,
    );
    return { key, value, enabled: row.enabled !== false };
  });
}

function curlQuote(s) {
  return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function toCurl({ method, url, headers, body, followRedirects }) {
  const parts = ['curl.exe'];
  if (/^https:/i.test(url || '')) parts.push('-k');
  if (followRedirects) parts.push('-L');
  else parts.push('--max-redirs', '0');
  const m = String(method || 'GET').toUpperCase();
  if (m && m !== 'GET') parts.push('-X', m);
  parts.push(curlQuote(url || ''));
  for (const [k, v] of Object.entries(headers || {})) {
    if (!String(k || '').trim()) continue;
    parts.push('-H', curlQuote(`${k}: ${v}`));
  }
  if (body && !methodOmitsBody(m)) {
    parts.push('--data-raw', curlQuote(body));
  }
  return parts.join(' ');
}

export function parseHTTPOutPreview(text) {
  const m = String(text || '').trim().match(
    /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)$/i,
  );
  if (!m) return null;
  return { method: m[1].toUpperCase(), url: m[2] };
}

function bindKVRow(root, rows, i, onChange, opts) {
  const row = rows[i] || emptyRow();
  const locked = Boolean(opts?.lockHost && isHostVarKey(row.key));
  const line = document.createElement('div');
  line.className = 'kv-row' + (locked ? ' kv-locked' : '');
  line.innerHTML = `
    <input type="checkbox" class="kv-on" ${row.enabled || locked ? 'checked' : ''} title="${locked ? 'host 始终启用' : '启用'}" ${locked ? 'disabled' : ''}/>
    <input class="input kv-key" spellcheck="false" placeholder="Key" ${locked ? 'readonly tabindex="-1"' : ''}/>
    <input class="input kv-val" spellcheck="false" placeholder="${locked ? 'ws://host:port/path' : 'Value'}"/>
    ${locked ? '<span class="kv-del-slot" aria-hidden="true"></span>' : '<button type="button" class="btn ghost kv-del" title="删除">×</button>'}
  `;
  const keyInput = line.querySelector('.kv-key');
  const valInput = line.querySelector('.kv-val');
  keyInput.value = locked ? HOST_VAR_KEY : row.key;
  valInput.value = row.value;
  if (locked) {
    rows[i].key = HOST_VAR_KEY;
    rows[i].enabled = true;
    keyInput.title = 'BASE_URL 固定，不能改名或删除';
  }
  const onBox = line.querySelector('.kv-on');
  if (onBox && !locked) {
    onBox.addEventListener('change', (e) => {
      rows[i].enabled = e.target.checked;
      onChange?.();
    });
  }
  const onKeyEdit = (e) => {
    if (locked) {
      keyInput.value = HOST_VAR_KEY;
      return;
    }
    if (opts?.lockHost && isHostVarKey(keyInput.value)) {
      keyInput.value = '';
      rows[i].key = '';
      onChange?.();
      return;
    }
    rows[i].key = keyInput.value;
    if (!e.isComposing && i === rows.length - 1 && keyInput.value) {
      rows.push(emptyRow());
      bindKVRow(root, rows, rows.length - 1, onChange, opts);
    }
    onChange?.();
  };
  keyInput.addEventListener('input', onKeyEdit);
  keyInput.addEventListener('compositionend', () => {
    if (locked) {
      keyInput.value = HOST_VAR_KEY;
      return;
    }
    if (opts?.lockHost && isHostVarKey(keyInput.value)) {
      keyInput.value = '';
      rows[i].key = '';
      onChange?.();
      return;
    }
    rows[i].key = keyInput.value;
    if (i === rows.length - 1 && keyInput.value) {
      rows.push(emptyRow());
      bindKVRow(root, rows, rows.length - 1, onChange, opts);
    }
    onChange?.();
  });
  valInput.addEventListener('input', () => {
    rows[i].value = valInput.value;
    onChange?.();
  });
  line.querySelector('.kv-del')?.addEventListener('click', () => {
    if (locked || isHostVarKey(rows[i]?.key)) return;
    if (rows.length === 1) {
      rows[0] = emptyRow();
    } else {
      rows.splice(i, 1);
    }
    if (opts?.lockHost) {
      const next = ensureHostVarRows(rows);
      rows.splice(0, rows.length, ...next);
    }
    renderKV(root, rows, onChange, opts);
    onChange?.();
  });
  root.appendChild(line);
}

export function renderKV(root, rows, onChange, opts) {
  if (!root) return;
  root.innerHTML = '';
  rows.forEach((_, i) => bindKVRow(root, rows, i, onChange, opts));
}
