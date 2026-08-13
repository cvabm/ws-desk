/** Escape text for safe HTML embedding. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lightweight JSON (and JSON-like) syntax highlighter for non-tree plain text.
 */
export function highlightJson(text) {
  const s = String(text ?? '');
  if (!s) return '';

  if (!/[{[\]":\d]|true|false|null/.test(s)) {
    return escapeHtml(s);
  }

  let i = 0;
  let out = '';
  const len = s.length;

  const push = (cls, raw) => {
    const esc = escapeHtml(raw);
    out += cls ? `<span class="tok-${cls}">${esc}</span>` : esc;
  };

  while (i < len) {
    const c = s[i];

    if (c === '"') {
      let j = i + 1;
      while (j < len) {
        if (s[j] === '\\') {
          j += j + 1 < len ? 2 : 1;
          continue;
        }
        if (s[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      const str = s.slice(i, j);
      let k = j;
      while (k < len && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n' || s[k] === '\r')) k++;
      push(s[k] === ':' ? 'key' : 'str', str);
      i = j;
      continue;
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i;
      if (s[j] === '-') j++;
      while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      if (j < len && s[j] === '.') {
        j++;
        while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      }
      if (j < len && (s[j] === 'e' || s[j] === 'E')) {
        j++;
        if (j < len && (s[j] === '+' || s[j] === '-')) j++;
        while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      }
      if (j > i && !(j === i + 1 && s[i] === '-')) {
        push('num', s.slice(i, j));
        i = j;
        continue;
      }
    }

    if (s.startsWith('true', i) && isWordEnd(s, i + 4)) {
      push('bool', 'true');
      i += 4;
      continue;
    }
    if (s.startsWith('false', i) && isWordEnd(s, i + 5)) {
      push('bool', 'false');
      i += 5;
      continue;
    }
    if (s.startsWith('null', i) && isWordEnd(s, i + 4)) {
      push('null', 'null');
      i += 4;
      continue;
    }

    if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':') {
      push('punc', c);
      i++;
      continue;
    }

    push('', c);
    i++;
  }

  return out;
}

function isWordEnd(s, idx) {
  if (idx >= s.length) return true;
  const c = s[idx];
  return !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$');
}

function tryParseJson(text) {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false };
  const c = s[0];
  if (c !== '{' && c !== '[') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function keyHtml(key) {
  if (key === null || key === undefined) return '';
  if (typeof key === 'number') {
    return `<span class="tok-num">${key}</span><span class="tok-punc">: </span>`;
  }
  return `<span class="tok-key">"${escapeHtml(String(key))}"</span><span class="tok-punc">: </span>`;
}

function primitiveHtml(value) {
  if (value === null) return `<span class="tok-null">null</span>`;
  if (typeof value === 'boolean') return `<span class="tok-bool">${value}</span>`;
  if (typeof value === 'number') return `<span class="tok-num">${escapeHtml(String(value))}</span>`;
  if (typeof value === 'string') return `<span class="tok-str">"${escapeHtml(value)}"</span>`;
  return `<span class="tok-str">${escapeHtml(String(value))}</span>`;
}

function previewLabel(value) {
  if (Array.isArray(value)) {
    const n = value.length;
    return n === 0 ? '[]' : `Array(${n})`;
  }
  if (value && typeof value === 'object') {
    const n = Object.keys(value).length;
    return n === 0 ? '{}' : `Object{${n}}`;
  }
  return '';
}

/**
 * Render a JSON value as a collapsible tree.
 * depth>=2 nodes start collapsed (root and first level open).
 */
function renderTree(value, key, depth, trailingComma) {
  const comma = trailingComma ? `<span class="tok-punc">,</span>` : '';
  const isObj = value !== null && typeof value === 'object';

  if (!isObj) {
    return `<div class="jt-line">${keyHtml(key)}${primitiveHtml(value)}${comma}</div>`;
  }

  const isArr = Array.isArray(value);
  const entries = isArr
    ? value.map((v, i) => [i, v])
    : Object.entries(value);
  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';

  if (entries.length === 0) {
    return `<div class="jt-line">${keyHtml(key)}<span class="tok-punc">${open}${close}</span>${comma}</div>`;
  }

  const collapsed = depth >= 2;
  const kids = entries
    .map(([k, v], i) => renderTree(v, isArr ? k : k, depth + 1, i < entries.length - 1))
    .join('');

  return (
    `<div class="jt-node${collapsed ? ' collapsed' : ''}">` +
      `<div class="jt-line jt-toggle-line" role="button" tabindex="0" title="点击展开/收起">` +
        `<span class="jt-toggle" aria-hidden="true">${collapsed ? '▶' : '▼'}</span>` +
        `${keyHtml(key)}` +
        `<span class="tok-punc">${open}</span>` +
        `<span class="jt-preview">${escapeHtml(previewLabel(value))}</span>` +
        `<span class="jt-ellipsis">…</span>` +
        `<span class="tok-punc jt-close-inline">${close}</span>${comma}` +
      `</div>` +
      `<div class="jt-children">` +
        kids +
        `<div class="jt-line"><span class="tok-punc">${close}</span>${comma}</div>` +
      `</div>` +
    `</div>`
  );
}

function statusClass(code) {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 400) return 'err';
  if (code >= 300) return 'warn';
  return '';
}

function headerTable(headers) {
  const entries = Object.entries(headers || {});
  if (!entries.length) return `<div class="resp-empty">无</div>`;
  return `<div class="hdr-table">${entries
    .map(
      ([k, v]) =>
        `<div class="hdr-row"><span class="hdr-k">${escapeHtml(k)}</span><span class="hdr-v">${escapeHtml(v)}</span></div>`,
    )
    .join('')}</div>`;
}

function bodyBlock(raw) {
  const parsed = tryParseJson(raw);
  if (!parsed.ok) {
    return `<div class="jt-plain">${raw ? highlightJson(raw) : '<span class="resp-empty">(empty)</span>'}</div>`;
  }
  return `<div class="jt-root">${renderTree(parsed.value, null, 0, false)}</div>`;
}

/** Render a Postman-like HTTP request/response snapshot. */
export function renderHTTPExchange(ex) {
  if (!ex) return '';
  if (ex.error && !ex.statusCode) {
    return `<div class="resp-error">${escapeHtml(ex.error)}</div>`;
  }
  const code = ex.statusCode || 0;
  const size = ex.bytes || 0;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  return (
    `<div class="resp-head">` +
      `<span class="resp-code ${statusClass(code)}">${escapeHtml(ex.status || String(code))}</span>` +
      (ex.manual ? `<span class="resp-badge">手动</span>` : `<span class="resp-stat">${ex.timeMs ?? 0} ms</span>`) +
      `<span class="resp-stat">${escapeHtml(sizeLabel)}</span>` +
      `<span class="resp-stat">${escapeHtml(ex.method || '')} ${escapeHtml(ex.url || '')}</span>` +
    `</div>` +
    (ex.error ? `<div class="resp-error">${escapeHtml(ex.error)}</div>` : '') +
    `<div class="resp-sec">请求头</div>${headerTable(ex.reqHeaders)}` +
    `<div class="resp-sec">请求体</div>${bodyBlock(ex.reqBody)}` +
    `<div class="resp-sec">响应头</div>${headerTable(ex.resHeaders)}` +
    `<div class="resp-sec">响应体</div>${bodyBlock(ex.resBody)}`
  );
}

/** Render a manually saved WebSocket send/receive pair. */
export function renderWSRecord(rec) {
  if (!rec) return '';
  const size = (rec.out || '').length + (rec.in || '').length;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  return (
    `<div class="resp-head">` +
      `<span class="resp-code">WS</span>` +
      (rec.manual ? `<span class="resp-badge">手动</span>` : '') +
      `<span class="resp-stat">${escapeHtml(sizeLabel)}</span>` +
      `<span class="resp-stat">${escapeHtml(rec.url || '')}</span>` +
      (rec.protocol ? `<span class="resp-stat">${escapeHtml(rec.protocol)}</span>` : '') +
    `</div>` +
    `<div class="resp-sec">发送</div>${bodyBlock(rec.out)}` +
    `<div class="resp-sec">返回</div>${bodyBlock(rec.in)}`
  );
}

/** Render detail header + collapsible JSON tree (or flat highlighted text). */
export function renderDetailHtml(dir, time, body) {
  const meta = `<div class="detail-meta">[${escapeHtml(dir)}] ${escapeHtml(time)}</div>`;
  const raw = body ?? '';
  const parsed = tryParseJson(raw);
  if (!parsed.ok) {
    return `${meta}<div class="jt-plain">${highlightJson(raw)}</div>`;
  }
  return `${meta}<div class="jt-root">${renderTree(parsed.value, null, 0, false)}</div>`;
}

/** Toggle a .jt-node open/collapsed. Returns true if handled. */
export function toggleJsonNode(target) {
  const line = target?.closest?.('.jt-toggle-line');
  if (!line) return false;
  const node = line.closest('.jt-node');
  if (!node) return false;
  node.classList.toggle('collapsed');
  const mark = line.querySelector('.jt-toggle');
  if (mark) {
    mark.textContent = node.classList.contains('collapsed') ? '▶' : '▼';
  }
  return true;
}
