import './style.css';
import {
  Connect,
  Disconnect,
  Send,
  RequestHTTP,
  RecordHTTP,
  RecordWS,
  GetProfiles,
  GetStatus,
  GetMessages,
  ClearMessages,
  GetPaths,
  FormatJSON,
  SaveProfile,
  SelectProfile,
  DeleteProfile,
  ListSessions,
  SearchSessions,
  LoadSession,
  PickAndLoadSession,
  OpenLogDir,
} from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { renderDetailHtml, renderHTTPExchange, renderWSRecord, toggleJsonNode } from './highlight.js';
import {
  emptyRow,
  cloneRows,
  rowsFromMap,
  parseQuery,
  applyQuery,
  formEncode,
  parseForm,
  mergeRequestHeaders,
  parseAuthorization,
  guessBodyType,
  editorHeadersFromRequest,
  parseHTTPOutPreview,
  renderKV,
  varsFromRows,
  expandVars,
  expandMap,
  keepTemplate,
  keepTemplatesInRows,
} from './http-ui.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'ws-desk-theme';

const HTTP_SCHEMES = new Set(['http', 'https']);
const ALL_SCHEMES = new Set(['ws', 'wss', 'http', 'https']);

const el = {
  app: $('app'),
  profile: $('profile'),
  btnDelProfile: $('btnDelProfile'),
  url: $('url'),
  protocol: $('protocol'),
  method: $('method'),
  reconnect: $('reconnect'),
  reconnectWrap: $('reconnectWrap'),
  btnToggle: $('btnToggle'),
  btnSendTop: $('btnSendTop'),
  btnRecord: $('btnRecord'),
  state: $('state'),
  reqBuilder: $('reqBuilder'),
  reqTabs: $('reqTabs'),
  tabParams: $('tabParams'),
  tabHeaders: $('tabHeaders'),
  tabAuth: $('tabAuth'),
  tabVars: $('tabVars'),
  tabBody: $('tabBody'),
  paramRows: $('paramRows'),
  headerRows: $('headerRows'),
  varRows: $('varRows'),
  formRows: $('formRows'),
  authType: $('authType'),
  authToken: $('authToken'),
  authUser: $('authUser'),
  authPass: $('authPass'),
  list: $('list'),
  listTitle: $('listTitle'),
  detail: $('detail'),
  btnFill: $('btnFill'),
  payload: $('payload'),
  btnSend: $('btnSend'),
  btnFormat: $('btnFormat'),
  btnFormatHttp: $('btnFormatHttp'),
  reqPane: $('reqPane'),
  detailTitle: $('detailTitle'),
  composer: document.querySelector('.composer'),
  btnResend: $('btnResend'),
  btnClear: $('btnClear'),
  footer: $('footer'),
  btnTheme: $('btnTheme'),
  btnHistory: $('btnHistory'),
  histBanner: $('histBanner'),
  histLabel: $('histLabel'),
  btnLive: $('btnLive'),
  histModal: $('histModal'),
  histList: $('histList'),
  histEmpty: $('histEmpty'),
  histSearch: $('histSearch'),
  msgFilter: $('msgFilter'),
  btnHistClose: $('btnHistClose'),
  btnHistRefresh: $('btnHistRefresh'),
  btnPickSession: $('btnPickSession'),
  btnOpenLogDir: $('btnOpenLogDir'),
  recordModal: $('recordModal'),
  recordTitle: $('recordTitle'),
  recordHint: $('recordHint'),
  recordMeta: $('recordMeta'),
  recordWS: $('recordWS'),
  recordHTTP: $('recordHTTP'),
  recordErr: $('recordErr'),
  recOut: $('recOut'),
  recIn: $('recIn'),
  recReqBody: $('recReqBody'),
  recResBody: $('recResBody'),
  btnRecordClose: $('btnRecordClose'),
  btnRecordCancel: $('btnRecordCancel'),
  btnRecordSave: $('btnRecordSave'),
  btnFmtRecOut: $('btnFmtRecOut'),
  btnFmtRecIn: $('btnFmtRecIn'),
  btnFmtRecReq: $('btnFmtRecReq'),
  btnFmtRecRes: $('btnFmtRecRes'),
};

/** @type {Map<number, any>} */
const store = new Map();
/** @type {any[]} */
let allHistoryMsgs = [];
let selectedId = 0;
let lastSent = '';
let lastBoundName = '';
let lastBoundBody = '';
/** @type {{key:string,value:string,enabled:boolean}[]} */
let lastBoundForm = [emptyRow()];
let historyMode = false;
let activeHistKeyword = '';
let historySessionURL = '';
let historySessionProtocol = '';
let fillFlashTimer = 0;
/** @type {any[]} */
let profiles = [];
let histSearchTimer = 0;
let histSearchSeq = 0;
/** @type {{key:string,value:string,enabled:boolean}[]} */
let paramRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let headerRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let varRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let formRows = [emptyRow()];
const recordDraft = {
  in: '',
  resBody: '',
};
let authState = { type: 'none', token: '', user: '', pass: '' };
let bodyType = 'json';
let reqTab = 'body';
let syncingQuery = false;
let sending = false;
let persistTimer = 0;
let suppressSessionReset = false;
let activeProfileName = '';

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistProfile(), 400);
}

function dirLabel(dir) {
  if (dir === 'out') return '→';
  if (dir === 'in') return '←';
  return '·';
}

function preview(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, 160);
}

function timeOnly(t) {
  if (!t) return '';
  const m = t.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : t;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function msgMatches(m, kw) {
  if (!kw) return true;
  const q = kw.toLowerCase();
  const bag = `${m.text || ''} ${m.pretty || ''} ${m.dir || ''} ${m.time || ''}`.toLowerCase();
  return bag.includes(q);
}

/* —— theme —— */
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  el.btnTheme.textContent = t === 'dark' ? '浅色' : '深色';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/* —— messages —— */
function clearListUI() {
  store.clear();
  el.list.innerHTML = '';
  selectedId = 0;
  setDetailEmpty('选择一条消息');
  setFillButton(false);
}

function setState(status) {
  const s = (status?.state || 'idle').toLowerCase();
  const kind = (status?.kind || '').toLowerCase();
  let label = s;
  if (s === 'open' && kind === 'http') {
    const sch = urlScheme(status?.url);
    label = sch === 'https' ? 'https' : 'http';
  }
  el.state.textContent = label;
  el.state.className = 'state ' + s;
  el.btnToggle.textContent = s === 'open' || s === 'connecting' || s === 'reconnecting' ? '断开' : '连接';
  el.btnToggle.classList.toggle('on', s === 'open' || s === 'connecting' || s === 'reconnecting');
}

function isHTTPStatusNote(m) {
  if (!m || m.dir !== 'sys') return false;
  const t = String(m.text || m.pretty || '').trim();
  if (/^recorded\s+http\b/i.test(t)) return true;
  return /^http\s+\d{3}\b/i.test(t) && /\d+\s*ms/i.test(t);
}

function appendMsg(m, scroll = true) {
  if (!m || store.has(m.id) || isHTTPStatusNote(m)) return;
  store.set(m.id, m);

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = String(m.id);
  row.innerHTML = `
    <span class="t">${timeOnly(m.time)}</span>
    <span class="d ${m.dir}">${dirLabel(m.dir)}</span>
    <span class="p"></span>
    <span class="b">${m.bytes || 0}b</span>
  `;
  row.querySelector('.p').textContent = preview(m.pretty || m.text);
  row.title = '点击填回请求栏';
  row.addEventListener('click', () => selectMsg(m.id));
  el.list.appendChild(row);

  while (el.list.children.length > 2000) {
    const first = el.list.firstElementChild;
    const id = Number(first?.dataset.id);
    if (id) store.delete(id);
    first?.remove();
  }

  if (scroll) {
    const nearBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 80;
    if (nearBottom) el.list.scrollTop = el.list.scrollHeight;
  }
}

function renderMessageList(messages, { scrollTop = 0, selectFirst = false } = {}) {
  clearListUI();
  for (const m of messages || []) appendMsg(m, false);
  el.list.scrollTop = scrollTop;
  if (selectFirst && messages?.length) {
    selectMsg(messages[0].id);
  }
}

function setDetailEmpty(text) {
  el.detail.classList.add('empty');
  el.detail.textContent = text;
}

function setDetailHtml(html) {
  el.detail.classList.remove('empty');
  el.detail.innerHTML = html;
}

function selectMsg(id) {
  selectedId = id;
  for (const node of el.list.children) {
    node.classList.toggle('active', Number(node.dataset.id) === id);
  }
  const m = store.get(id);
  if (!m) {
    setDetailEmpty('选择一条消息');
    setFillButton(false);
    return;
  }
  if (m.exchange) {
    setDetailHtml(renderHTTPExchange(m.exchange));
  } else if (m.ws) {
    setDetailHtml(renderWSRecord(m.ws));
  } else {
    setDetailHtml(renderDetailHtml(m.dir, m.time, m.pretty || m.text));
  }
  const ok = fillFromMessage(m);
  setFillButton(ok);
  if (ok) flashFilled();
}

function setHistoryMode(on, label = '') {
  historyMode = on;
  el.histBanner.classList.toggle('hidden', !on);
  el.msgFilter.classList.toggle('hidden', !on);
  el.listTitle.textContent = on
    ? '历史消息'
    : isHTTPMode()
      ? '记录'
      : '消息';
  if (on) {
    el.histLabel.textContent = label || '历史模式';
  } else {
    el.msgFilter.value = '';
    allHistoryMsgs = [];
    activeHistKeyword = '';
  }
}

async function exitHistoryMode() {
  historySessionURL = '';
  historySessionProtocol = '';
  setHistoryMode(false);
  clearListUI();
  const existing = await GetMessages(0, 500);
  for (const m of existing || []) appendMsg(m, false);
  el.list.scrollTop = el.list.scrollHeight;
}

function applyMsgFilter() {
  if (!historyMode) return;
  const kw = (el.msgFilter.value || '').trim();
  const filtered = kw ? allHistoryMsgs.filter((m) => msgMatches(m, kw)) : allHistoryMsgs;
  const namePart = el.histLabel.textContent || '历史';
  const base = namePart.replace(/\s*·\s*显示\s+\d+.*/, '');
  el.histLabel.textContent = kw
    ? `${base} · 显示 ${filtered.length}/${allHistoryMsgs.length}`
    : base.includes('条')
      ? base
      : `${base} · ${allHistoryMsgs.length} 条`;
  renderMessageList(filtered, { scrollTop: 0, selectFirst: filtered.length > 0 });
}

function showSession(detail, keyword = '') {
  if (!detail) return;
  allHistoryMsgs = detail.messages || [];
  const url = detail.url || detail.info?.url || '';
  const name = historyItemTitle({ ...detail.info, url }) || 'log';
  historySessionURL = url;
  historySessionProtocol = detail.protocol || '';
  const n = allHistoryMsgs.length;
  const kw = (keyword || '').trim();
  activeHistKeyword = kw;
  setHistoryMode(true, `历史 · ${name}${url ? ' · ' + url : ''} · ${n} 条`);
  if (kw) {
    el.msgFilter.value = kw;
  } else {
    el.msgFilter.value = '';
  }
  applyMsgFilter();
  closeHistoryModal();
}

/* —— scheme / http —— */
function urlScheme(url) {
  const m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return m ? m[1].toLowerCase() : '';
}

function currentScheme() {
  const s = urlScheme(el.url?.value);
  return ALL_SCHEMES.has(s) ? s : '';
}

function isHTTPMode() {
  return HTTP_SCHEMES.has(currentScheme());
}

function eventProfileName(v) {
  return String(v || '').trim();
}

function isCurrentProfileEvent(name) {
  const cur = profileNameFromURL(currentURL()) || activeProfileName;
  const got = eventProfileName(name);
  if (!got) return true;
  if (!cur) return false;
  return got === cur;
}

async function activateCurrent() {
  const name = profileNameFromURL(currentURL());
  if (!name) return '';
  const changed = name !== activeProfileName;
  await SelectProfile(name);
  activeProfileName = name;
  if (changed) await reloadLiveSession();
  return name;
}

async function reloadLiveSession() {
  if (historyMode) {
    historySessionURL = '';
    historySessionProtocol = '';
    setHistoryMode(false);
  }
  clearListUI();
  try {
    setState(await GetStatus());
    const msgs = await GetMessages(0, 500);
    for (const m of msgs || []) appendMsg(m, false);
    el.list.scrollTop = el.list.scrollHeight;
  } catch (_) {}
}

function withoutSessionReset(fn) {
  suppressSessionReset = true;
  try {
    return fn();
  } finally {
    suppressSessionReset = false;
  }
}

function applyTransportFromURL() {
  applyTransportUI(currentScheme());
}

function placePayload(http) {
  if (!el.payload) return;
  if (http && el.tabBody && el.payload.parentElement !== el.tabBody) {
    el.tabBody.appendChild(el.payload);
  } else if (!http && el.composer && el.payload.parentElement !== el.composer) {
    const before = el.composer.querySelector('.composer-actions') || el.composer.firstChild;
    el.composer.insertBefore(el.payload, before);
  }
}

function applyTransportUI(scheme) {
  if (!ALL_SCHEMES.has(scheme)) return;
  const http = HTTP_SCHEMES.has(scheme);
  const modeChanged = Boolean(el.app?.classList.contains('http')) !== http;
  el.app?.classList.toggle('http', http);
  el.protocol.classList.toggle('hidden', http);
  el.method.classList.toggle('hidden', !http);
  el.reconnectWrap?.classList.toggle('hidden', http);
  el.btnToggle?.classList.toggle('hidden', http);
  el.btnSendTop?.classList.toggle('hidden', !http);
  el.btnRecord?.classList.remove('hidden');
  if (el.btnRecord) {
    el.btnRecord.title = http
      ? '打开手动记录：用当前请求配一条响应，不发送'
      : '打开手动记录：保存一对发送/返回，不发送';
  }
  el.state?.classList.toggle('hidden', http);
  el.reqPane?.classList.toggle('hidden', !http);
  placePayload(http);
  if (el.detailTitle) el.detailTitle.textContent = http ? '响应' : '详情';
  if (el.listTitle && !historyMode) el.listTitle.textContent = http ? '记录' : '消息';
  if (http && modeChanged) {
    syncParamsFromURL();
    renderRequestEditor();
    applyBodyTypeUI();
    setReqTab(reqTab || 'body');
  }
  if (el.payload) {
    el.payload.placeholder = http
      ? '请求体  ·  Ctrl+Enter 发送'
      : '{"cmd":"ping"}  ·  Ctrl+Enter 发送';
  }
}

function currentURL() {
  return (el.url?.value || '').trim();
}

function isHTTPURL(url) {
  return HTTP_SCHEMES.has(urlScheme(url));
}

function currentBodyType() {
  const picked = document.querySelector('input[name="bodyType"]:checked');
  return picked?.value || bodyType || 'json';
}

function applyBodyTypeUI() {
  bodyType = currentBodyType();
  el.app?.classList.toggle('body-none', bodyType === 'none');
  el.app?.classList.toggle('body-form', bodyType === 'form');
  el.formRows?.classList.toggle('hidden', bodyType !== 'form');
}

function syncAuthFields() {
  const t = el.authType?.value || 'none';
  authState.type = t;
  el.authToken?.classList.toggle('hidden', t !== 'bearer');
  el.authUser?.classList.toggle('hidden', t !== 'basic');
  el.authPass?.classList.toggle('hidden', t !== 'basic');
}

function setReqTab(tab) {
  reqTab = tab === 'response' ? 'body' : (tab || 'body');
  for (const btn of el.reqTabs?.querySelectorAll('.req-tab') || []) {
    btn.classList.toggle('on', btn.dataset.tab === reqTab);
  }
  el.tabParams?.classList.toggle('hidden', reqTab !== 'params');
  el.tabHeaders?.classList.toggle('hidden', reqTab !== 'headers');
  el.tabAuth?.classList.toggle('hidden', reqTab !== 'auth');
  el.tabVars?.classList.toggle('hidden', reqTab !== 'vars');
  el.tabBody?.classList.toggle('hidden', reqTab !== 'body');
}

function syncParamsFromURL() {
  if (syncingQuery) return;
  paramRows = parseQuery(currentURL());
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
}

function onParamsChange() {
  const url = currentURL();
  if (!urlScheme(url)) return;
  syncingQuery = true;
  const next = applyQuery(url, paramRows);
  if (next) el.url.value = next;
  syncingQuery = false;
  schedulePersist();
}

function renderRequestEditor() {
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
  if (el.headerRows) renderKV(el.headerRows, headerRows, schedulePersist);
  if (el.varRows) renderKV(el.varRows, varRows, schedulePersist);
  if (el.formRows) renderKV(el.formRows, formRows, schedulePersist);
}

function currentVarMap() {
  return varsFromRows(varRows);
}

function resolvedOpts() {
  const vars = currentVarMap();
  const opts = currentOpts();
  opts.url = expandVars(opts.url, vars);
  opts.protocol = expandVars(opts.protocol, vars);
  opts.headers = expandMap(opts.headers, vars);
  return opts;
}

function resolvedBody() {
  return expandVars(currentBody(), currentVarMap());
}

function currentRecordedExchange() {
  const vars = currentVarMap();
  const opts = resolvedOpts();
  const reqBodyRaw = el.recReqBody?.value || '';
  const reqBody = expandVars(reqBodyRaw, vars);
  const resBody = expandVars(el.recResBody?.value || '', vars);
  const t = currentBodyType();
  const reqHeaders = mergeRequestHeaders(
    headerRows,
    {
      type: el.authType?.value || authState.type,
      token: el.authToken?.value || authState.token,
      user: el.authUser?.value || authState.user,
      pass: el.authPass?.value || authState.pass,
    },
    t,
    Boolean(reqBodyRaw) && t !== 'none',
  );
  return {
    method: opts.method,
    url: opts.url,
    status: '200 OK',
    statusCode: 200,
    timeMs: 0,
    bytes: resBody.length,
    truncated: false,
    reqHeaders: expandMap(reqHeaders, vars),
    resHeaders: {},
    reqBody,
    resBody,
    manual: true,
  };
}

function currentBody() {
  const t = currentBodyType();
  if (t === 'none') return '';
  if (t === 'form') return formEncode(formRows);
  return el.payload.value;
}

function loadAuthFromProfile(p) {
  authState = {
    type: p?.authType || 'none',
    token: p?.authToken || '',
    user: p?.authUser || '',
    pass: p?.authPass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function loadHeadersFromProfile(p) {
  if (Array.isArray(p?.headerList) && p.headerList.length) {
    headerRows = cloneRows(p.headerList);
  } else {
    headerRows = rowsFromMap(p?.headers);
  }
}

function loadVariablesFromProfile(p) {
  if (Array.isArray(p?.variableList) && p.variableList.length) {
    varRows = cloneRows(p.variableList);
  } else {
    varRows = [emptyRow()];
  }
}

function loadBodyTypeFromProfile(p) {
  bodyType = p?.bodyType || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
}

function bindLastBody() {
  lastBoundName = profileNameFromURL(currentURL());
  lastBoundBody = el.payload?.value || '';
  lastBoundForm = cloneRows(formRows);
}

function resetBoundBody() {
  lastBoundName = '';
  lastBoundBody = '';
  lastBoundForm = [emptyRow()];
}

function loadBodyFromProfile(p) {
  lastBoundName = p?.name || profileNameFromURL(p?.url || '');
  lastBoundBody = p?.body || '';
  if (Array.isArray(p?.formList) && p.formList.length) {
    lastBoundForm = cloneRows(p.formList);
  } else if (p?.bodyType === 'form' && lastBoundBody) {
    lastBoundForm = parseForm(lastBoundBody);
  } else {
    lastBoundForm = [emptyRow()];
  }
  if (bodyType === 'form') {
    formRows = cloneRows(lastBoundForm);
    if (el.payload) el.payload.value = '';
  } else {
    formRows = [emptyRow()];
    if (el.payload) el.payload.value = lastBoundBody;
  }
  lastSent = currentBody();
}

function hostFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    return new URL(withScheme).hostname || '';
  } catch {
    return '';
  }
}

function profileNameFromURL(url) {
  const host = hostFromURL(url);
  if (!host) return '';
  const s = urlScheme(url);
  return `${ALL_SCHEMES.has(s) ? s : 'ws'}://${host}`;
}

function setFillButton(on) {
  if (!el.btnFill) return;
  el.btnFill.classList.toggle('hidden', !on);
  if (!on) {
    el.btnFill.textContent = '填回';
    clearTimeout(fillFlashTimer);
  }
}

function flashFilled() {
  if (!el.btnFill || el.btnFill.classList.contains('hidden')) return;
  el.btnFill.textContent = '已填回';
  clearTimeout(fillFlashTimer);
  fillFlashTimer = setTimeout(() => {
    if (el.btnFill) el.btnFill.textContent = '填回';
  }, 900);
}

function siblingFillSource(m) {
  if (!m) return null;
  const ids = [...el.list.children].map((n) => Number(n.dataset.id));
  const idx = ids.indexOf(m.id);
  if (idx < 0) return null;
  const at = (i) => store.get(ids[i]);
  const tagged = (n) => (n?.exchange || n?.ws ? n : null);
  if (m.dir === 'out') {
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else if (m.dir === 'in') {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
  }
  return null;
}

function applyAuthState(auth) {
  authState = {
    type: auth?.type || 'none',
    token: auth?.token || '',
    user: auth?.user || '',
    pass: auth?.pass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function setBodyType(type) {
  bodyType = type || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
}

function fillRecordResponse(ex) {
  recordDraft.resBody = ex?.resBody || '';
  if (recordModalOpen()) {
    applyRecordDraftToForm();
  }
}

function selectProfileHost(url) {
  const name = profileNameFromURL(url);
  if (name && [...el.profile.options].some((o) => o.value === name)) {
    el.profile.value = name;
  }
}

function applyHTTPExchange(ex) {
  if (!ex?.url) return false;
  const vars = currentVarMap();
  el.url.value = keepTemplate(el.url.value, ex.url, vars);
  const method = (ex.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  const auth = parseAuthorization(ex.reqHeaders);
  const curAuth = {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  };
  if (curAuth.type === auth.type || auth.type === 'none') {
    auth.token = keepTemplate(curAuth.token, auth.token, vars);
    auth.user = keepTemplate(curAuth.user, auth.user, vars);
    auth.pass = keepTemplate(curAuth.pass, auth.pass, vars);
    if (auth.type === 'none' && (looksLikeVarRef(curAuth.token) || looksLikeVarRef(curAuth.user))) {
      auth.type = curAuth.type;
      auth.token = curAuth.token;
      auth.user = curAuth.user;
      auth.pass = curAuth.pass;
    }
  }
  applyAuthState(auth);
  const bodyTypeGuess = guessBodyType(ex.reqHeaders, ex.reqBody, ex.method);
  setBodyType(bodyTypeGuess);
  const incomingHeaders = editorHeadersFromRequest(ex.reqHeaders, {
    stripAuth: auth.type !== 'none',
    stripContentType: bodyTypeGuess !== 'none',
  });
  headerRows = keepTemplatesInRows(incomingHeaders, headerRows, vars);
  if (bodyTypeGuess === 'form') {
    formRows = keepTemplatesInRows(parseForm(ex.reqBody), formRows, vars);
    if (el.payload) el.payload.value = '';
  } else {
    formRows = [emptyRow()];
    if (el.payload) {
      el.payload.value = bodyTypeGuess === 'none'
        ? ''
        : keepTemplate(el.payload.value, ex.reqBody || '', vars);
    }
  }
  fillRecordResponse(ex);
  lastSent = currentBody();
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  selectProfileHost(el.url.value);
  setReqTab(String(ex.reqBody || '').trim() ? 'body' : 'params');
  persistProfile();
  return true;
}

function looksLikeVarRef(s) {
  return String(s || '').includes('{{');
}

function applyWSRecord(rec) {
  if (!rec) return false;
  const vars = currentVarMap();
  if (rec.url) el.url.value = keepTemplate(el.url.value, rec.url, vars);
  if (el.protocol) el.protocol.value = keepTemplate(el.protocol.value, rec.protocol || '', vars);
  if (el.payload) el.payload.value = keepTemplate(el.payload.value, rec.out || '', vars);
  recordDraft.in = keepTemplate(recordDraft.in, rec.in || '', vars);
  lastSent = rec.out || lastSent;
  if (recordModalOpen()) applyRecordDraftToForm();
  withoutSessionReset(() => applyTransportFromURL());
  selectProfileHost(rec.url);
  persistProfile();
  return Boolean(rec.url || rec.out || rec.in);
}

function fillPlainMessage(m) {
  if (!m || (m.dir !== 'out' && m.dir !== 'in')) return false;
  const hint = parseHTTPOutPreview(m.text);
  const url = historySessionURL || el.url.value;
  const sch = urlScheme(hint?.url || url || currentURL());
  if (hint) {
    return applyHTTPExchange({
      method: hint.method,
      url: hint.url,
      reqHeaders: {},
      reqBody: '',
      resHeaders: {},
      resBody: '',
    });
  }
  if (HTTP_SCHEMES.has(sch) || isHTTPMode()) {
    if (historySessionURL) {
      el.url.value = historySessionURL;
      withoutSessionReset(() => applyTransportFromURL());
    }
    if (m.dir === 'out') {
      if (el.payload) el.payload.value = m.text || '';
      setBodyType(guessBodyType({}, m.text, el.method?.value));
      lastSent = currentBody();
      setReqTab('body');
    } else {
      recordDraft.resBody = m.text || '';
      if (recordModalOpen() && el.recResBody) el.recResBody.value = recordDraft.resBody;
    }
    persistProfile();
    return true;
  }
  if (historySessionURL) {
    el.url.value = historySessionURL;
    const proto = historySessionProtocol;
    if (el.protocol && proto && proto !== 'ws' && proto !== 'wss' && !HTTP_SCHEMES.has(proto.toLowerCase())) {
      el.protocol.value = proto;
    }
    withoutSessionReset(() => applyTransportFromURL());
  }
  if (m.dir === 'out' && el.payload) {
    el.payload.value = m.text || '';
    lastSent = el.payload.value;
  }
  if (m.dir === 'in') {
    recordDraft.in = m.text || '';
    if (recordModalOpen() && el.recIn) el.recIn.value = recordDraft.in;
  }
  persistProfile();
  return true;
}

function fillFromMessage(m) {
  if (!m) return false;
  if (m.exchange) return applyHTTPExchange(m.exchange);
  if (m.ws) return applyWSRecord(m.ws);
  const near = siblingFillSource(m);
  if (near?.exchange) return applyHTTPExchange(near.exchange);
  if (near?.ws) return applyWSRecord(near.ws);
  return fillPlainMessage(m);
}

/* —— profiles —— */
async function applyProfile(p) {
  if (!p) return;
  el.url.value = p.url || '';
  el.protocol.value = p.protocol || '';
  const method = (p.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  el.reconnect.checked = p.reconnect !== false;
  loadHeadersFromProfile(p);
  loadVariablesFromProfile(p);
  loadAuthFromProfile(p);
  loadBodyTypeFromProfile(p);
  loadBodyFromProfile(p);
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  if (p.name && [...(el.profile?.options || [])].some((o) => o.value === p.name)) {
    el.profile.value = p.name;
  }
  await activateCurrent();
}

function renderProfileSelect(selected) {
  const cur = selected || el.profile.value;
  el.profile.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    el.profile.appendChild(opt);
  }
  if (cur && profiles.some((p) => p.name === cur)) {
    el.profile.value = cur;
  } else if (profiles.length) {
    el.profile.value = profiles[0].name;
  }
  if (el.btnDelProfile) el.btnDelProfile.disabled = profiles.length === 0;
}

function clearEditor() {
  el.url.value = '';
  if (el.protocol) el.protocol.value = '';
  if (el.method) el.method.value = 'GET';
  el.reconnect.checked = true;
  if (el.payload) el.payload.value = '';
  paramRows = [emptyRow()];
  headerRows = [emptyRow()];
  varRows = [emptyRow()];
  formRows = [emptyRow()];
  resetBoundBody();
  resetRecordDraft();
  activeProfileName = '';
  loadAuthFromProfile(null);
  loadBodyTypeFromProfile(null);
  applyTransportFromURL();
  renderRequestEditor();
}

async function deleteCurrentProfile() {
  const name = el.profile?.value || profileNameFromURL(currentURL());
  if (!name) return;
  if (!window.confirm(`删除地址 ${name} ？`)) return;
  clearTimeout(persistTimer);
  try {
    await DeleteProfile(name);
  } catch (e) {
    setDetailEmpty('删除失败: ' + e);
    return;
  }
  if (activeProfileName === name) activeProfileName = '';
  profiles = profiles.filter((p) => p.name !== name);
  if (profiles.length) {
    const next = profiles[0];
    renderProfileSelect(next.name);
    await applyProfile(next);
  } else {
    renderProfileSelect('');
    clearEditor();
  }
}

async function loadProfiles() {
  profiles = (await GetProfiles()) || [];
  renderProfileSelect();
  if (profiles.length) {
    const cur = profiles.find((p) => p.name === el.profile.value) || profiles[0];
    await applyProfile(cur);
  }
}

function currentHeaders() {
  const body = currentBody();
  const t = currentBodyType();
  return mergeRequestHeaders(headerRows, {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  }, t, Boolean(body) && t !== 'none');
}

function currentOpts() {
  return {
    url: currentURL(),
    protocol: el.protocol.value.trim(),
    method: el.method?.value || 'GET',
    headers: currentHeaders(),
    reconnect: el.reconnect.checked,
    pingSec: 20,
  };
}

async function persistProfile(selectName) {
  const url = currentURL();
  const name = profileNameFromURL(url);
  if (!name) return;
  authState = {
    type: el.authType?.value || 'none',
    token: el.authToken?.value || '',
    user: el.authUser?.value || '',
    pass: el.authPass?.value || '',
  };
  const p = {
    name,
    url,
    protocol: el.protocol.value.trim(),
    method: el.method?.value || 'GET',
    headers: currentHeaders(),
    headerList: cloneRows(headerRows),
    variableList: cloneRows(varRows),
    authType: authState.type,
    authToken: authState.token,
    authUser: authState.user,
    authPass: authState.pass,
    bodyType: currentBodyType(),
    body: lastBoundName === name ? lastBoundBody : '',
    formList: lastBoundName === name ? cloneRows(lastBoundForm) : [],
    reconnect: el.reconnect.checked,
    pingSec: 20,
  };
  try {
    await SaveProfile(p);
    const idx = profiles.findIndex((x) => x.name === name);
    if (idx >= 0) profiles[idx] = p;
    else {
      profiles.push(p);
      profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    renderProfileSelect(selectName || name);
  } catch (_) {}
}

async function toggleConn() {
  if (isHTTPMode()) return;
  await activateCurrent();
  const st = await GetStatus();
  if (st.state === 'open' || st.state === 'connecting' || st.state === 'reconnecting') {
    await Disconnect();
    return;
  }
  try {
    if (historyMode) await exitHistoryMode();
    await persistProfile();
    await Connect(resolvedOpts());
  } catch (e) {
    setDetailEmpty(String(e));
  }
}

async function ensureWSConnected() {
  if (!currentURL()) {
    throw new Error('请先填写 URL');
  }
  const st = await GetStatus();
  const s = (st?.state || '').toLowerCase();
  if (s === 'open') return;
  if (s !== 'connecting' && s !== 'reconnecting') {
    await Connect(resolvedOpts());
  }
}

async function sendMsg() {
  if (sending) return;
  await activateCurrent();
  const rawURL = currentURL();
  const http = isHTTPURL(rawURL);
  const opts = resolvedOpts();
  const text = http ? resolvedBody() : expandVars(el.payload.value.trim(), currentVarMap());
  if (!http && !text) return;
  setBusy(true);
  try {
    if (historyMode) await exitHistoryMode();
    await persistProfile();
    if (http) {
      const ex = await RequestHTTP(opts, text);
      if (ex) {
        setDetailHtml(renderHTTPExchange(ex));
      }
    } else {
      await ensureWSConnected();
      await Send(text);
    }
    lastSent = text;
    bindLastBody();
    await persistProfile();
  } catch (e) {
    setDetailEmpty(String(e));
  } finally {
    setBusy(false);
  }
}

async function formatPayload() {
  const text = el.payload?.value || '';
  if (!text.trim()) return;
  el.payload.value = await FormatJSON(text);
}

async function formatRecordField(target) {
  const text = target?.value || '';
  if (!text.trim()) return;
  target.value = await FormatJSON(text);
}

function setBusy(on) {
  sending = on;
  const method = on ? 'setAttribute' : 'removeAttribute';
  el.btnSend?.[method]('disabled', 'true');
  el.btnSendTop?.[method]('disabled', 'true');
  el.btnRecordSave?.[method]('disabled', 'true');
}

function recordModalOpen() {
  return Boolean(el.recordModal && !el.recordModal.classList.contains('hidden'));
}

function resetRecordDraft() {
  recordDraft.in = '';
  recordDraft.resBody = '';
}

function setRecordError(text) {
  if (el.recordErr) el.recordErr.textContent = text || '';
}

function readRecordForm() {
  recordDraft.in = el.recIn?.value || '';
  recordDraft.resBody = el.recResBody?.value || '';
}

function applyRecordDraftToForm() {
  if (el.recIn) el.recIn.value = recordDraft.in;
  if (el.recResBody) el.recResBody.value = recordDraft.resBody || '';
}

function openRecordModal() {
  const http = isHTTPMode();
  if (el.recordTitle) el.recordTitle.textContent = http ? '手动记录 HTTP' : '手动记录 WebSocket';
  if (el.recordHint) {
    el.recordHint.textContent = http
      ? '不会发送。方法、地址、请求头用当前编辑器；这里补请求体和响应体。'
      : '不会发送，只保存一对发送 / 返回。';
  }
  if (el.recordMeta) {
    const method = (el.method?.value || 'GET').toUpperCase();
    const url = currentURL();
    el.recordMeta.textContent = http
      ? `${method} ${url || '(未填写 URL)'}`
      : (url || '(未填写 URL)');
  }
  el.recordHTTP?.classList.toggle('hidden', !http);
  el.recordWS?.classList.toggle('hidden', http);
  setRecordError('');
  if (http) {
    if (el.recReqBody) el.recReqBody.value = currentBody();
    applyRecordDraftToForm();
  } else if (el.recOut) {
    el.recOut.value = el.payload?.value || '';
    applyRecordDraftToForm();
  }
  el.recordModal?.classList.remove('hidden');
  el.recordModal?.setAttribute('aria-hidden', 'false');
  const focusEl = http
    ? (el.recResBody || el.recReqBody)
    : (recordDraft.in ? el.recIn : el.recOut);
  setTimeout(() => focusEl?.focus(), 30);
}

function closeRecordModal() {
  if (!recordModalOpen()) return;
  readRecordForm();
  el.recordModal.classList.add('hidden');
  el.recordModal.setAttribute('aria-hidden', 'true');
  setRecordError('');
}

async function saveRecord() {
  if (sending) return;
  if (isHTTPMode()) {
    return recordHTTP();
  }
  return recordWS();
}

async function recordHTTP() {
  if (sending) return;
  if (!isHTTPMode()) return;
  const url = currentURL();
  if (!url) {
    setRecordError('请先填写 URL');
    return;
  }
  setBusy(true);
  setRecordError('');
  try {
    if (historyMode) await exitHistoryMode();
    await activateCurrent();
    await persistProfile();
    const ex = await RecordHTTP(currentRecordedExchange());
    readRecordForm();
    closeRecordModal();
    if (ex) {
      setDetailHtml(renderHTTPExchange(ex));
    }
  } catch (e) {
    setRecordError(String(e));
  } finally {
    setBusy(false);
  }
}

async function recordWS() {
  if (sending) return;
  const url = currentURL();
  if (!url) {
    setRecordError('请先填写 URL');
    return;
  }
  const outText = el.recOut?.value || '';
  const inText = el.recIn?.value || '';
  if (!outText.trim() && !inText.trim()) {
    setRecordError('请填写发送或返回数据');
    return;
  }
  setBusy(true);
  setRecordError('');
  try {
    if (historyMode) await exitHistoryMode();
    await activateCurrent();
    await persistProfile();
    const vars = currentVarMap();
    const rec = await RecordWS(
      resolvedOpts(),
      expandVars(outText, vars),
      expandVars(inText, vars),
    );
    readRecordForm();
    closeRecordModal();
    if (rec) {
      setDetailHtml(renderWSRecord(rec));
    }
  } catch (e) {
    setRecordError(String(e));
  } finally {
    setBusy(false);
  }
}

/* —— history modal —— */
function openHistoryModal() {
  el.histModal.classList.remove('hidden');
  el.histModal.setAttribute('aria-hidden', 'false');
  refreshHistoryList();
  setTimeout(() => el.histSearch?.focus(), 30);
}

function closeHistoryModal() {
  el.histModal.classList.add('hidden');
  el.histModal.setAttribute('aria-hidden', 'true');
}

function historyItemTitle(s) {
  const scheme = urlScheme(s?.url);
  const host = s?.host || hostFromURL(s?.url);
  const hostPart = host ? (scheme ? `${scheme}://${host}` : host) : '';
  return [s?.day, hostPart].filter(Boolean).join('  ·  ') || s?.name || '';
}

function renderHistoryItems(list, keyword) {
  el.histList.innerHTML = '';
  const kw = (keyword || '').trim();
  el.histEmpty.classList.toggle('hidden', list.length > 0);
  el.histEmpty.textContent = kw
    ? `没有匹配 “${kw}” 的日志`
    : '暂无日志，发送、记录或连接后会按日期和 IP/域名分开保存';

  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'hist-item';
    item.innerHTML = `
      <div class="name"></div>
      <div class="size"></div>
      <div class="meta"></div>
      <div class="hint hidden"></div>
    `;
    item.querySelector('.name').textContent = historyItemTitle(s);
    const right = item.querySelector('.size');
    if (kw && (s.matchCount > 0 || s.matchHint)) {
      right.className = 'hits';
      right.textContent = s.matchCount > 0 ? `${s.matchCount} 命中` : '匹配';
    } else {
      right.textContent = formatSize(s.size || 0);
    }
    const metaBits = [];
    if (s.host) metaBits.push(s.host);
    if (s.name) metaBits.push(s.name);
    if (s.modTime) metaBits.push(s.modTime);
    if (s.url) metaBits.push(s.url);
    item.querySelector('.meta').textContent = metaBits.join('  ·  ');
    if (s.matchHint) {
      const hint = item.querySelector('.hint');
      hint.classList.remove('hidden');
      hint.textContent = s.matchHint;
    }
    item.addEventListener('click', async () => {
      try {
        const detail = await LoadSession(s.name);
        showSession(detail, kw);
      } catch (e) {
        setDetailEmpty('加载失败: ' + e);
      }
    });
    el.histList.appendChild(item);
  }
}

async function refreshHistoryList() {
  const kw = (el.histSearch?.value || '').trim();
  const seq = ++histSearchSeq;
  el.histList.innerHTML = '';
  let list = [];
  try {
    list = kw ? ((await SearchSessions(kw)) || []) : ((await ListSessions()) || []);
  } catch (e) {
    if (seq !== histSearchSeq) return;
    el.histEmpty.classList.remove('hidden');
    el.histEmpty.textContent = '读取失败: ' + e;
    return;
  }
  if (seq !== histSearchSeq) return;
  renderHistoryItems(list, kw);
}

function scheduleHistorySearch() {
  clearTimeout(histSearchTimer);
  histSearchTimer = setTimeout(() => refreshHistoryList(), 220);
}

async function pickSession() {
  try {
    const detail = await PickAndLoadSession();
    if (detail) showSession(detail, (el.histSearch?.value || '').trim());
  } catch (e) {
    setDetailEmpty('打开失败: ' + e);
  }
}

async function init() {
  initTheme();
  suppressSessionReset = true;
  try {
    applyTransportFromURL();
    await loadProfiles();
  } finally {
    suppressSessionReset = false;
  }

  el.profile.addEventListener('change', async () => {
    const nextName = el.profile.value;
    clearTimeout(persistTimer);
    await persistProfile(nextName);
    const p = profiles.find((x) => x.name === nextName);
    await applyProfile(p);
  });
  el.btnDelProfile?.addEventListener('click', deleteCurrentProfile);

  el.btnToggle.addEventListener('click', toggleConn);
  el.btnSend.addEventListener('click', sendMsg);
  el.btnSendTop?.addEventListener('click', sendMsg);
  el.btnRecord?.addEventListener('click', openRecordModal);
  el.btnFill?.addEventListener('click', () => {
    const m = store.get(selectedId);
    if (fillFromMessage(m)) {
      setFillButton(true);
      flashFilled();
    }
  });
  el.reqTabs?.addEventListener('click', (e) => {
    const tab = e.target?.closest?.('.req-tab')?.dataset?.tab;
    if (tab) setReqTab(tab);
  });
  el.authType?.addEventListener('change', () => {
    syncAuthFields();
    persistProfile();
  });
  el.authToken?.addEventListener('change', persistProfile);
  el.authUser?.addEventListener('change', persistProfile);
  el.authPass?.addEventListener('change', persistProfile);
  for (const radio of document.querySelectorAll('input[name="bodyType"]')) {
    radio.addEventListener('change', () => {
      applyBodyTypeUI();
      persistProfile();
    });
  }
  setReqTab('body');
  renderRequestEditor();
  el.btnFormat.addEventListener('click', formatPayload);
  el.btnFormatHttp?.addEventListener('click', formatPayload);
  el.btnResend.addEventListener('click', () => {
    if (lastSent) {
      el.payload.value = lastSent;
      sendMsg();
    }
  });
  el.btnClear.addEventListener('click', async () => {
    if (historyMode) {
      clearListUI();
      return;
    }
    await ClearMessages();
    clearListUI();
  });
  el.btnTheme.addEventListener('click', toggleTheme);
  // JSON tree node expand/collapse
  el.detail?.addEventListener('click', (e) => {
    if (toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.detail?.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.btnHistory.addEventListener('click', openHistoryModal);
  el.btnLive.addEventListener('click', exitHistoryMode);
  el.btnHistClose.addEventListener('click', closeHistoryModal);
  el.btnHistRefresh.addEventListener('click', refreshHistoryList);
  el.btnPickSession.addEventListener('click', pickSession);
  el.btnOpenLogDir.addEventListener('click', async () => {
    try {
      await OpenLogDir();
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.histSearch.addEventListener('input', scheduleHistorySearch);
  el.histSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(histSearchTimer);
      refreshHistoryList();
    }
  });
  el.msgFilter.addEventListener('input', () => {
    if (historyMode) applyMsgFilter();
  });
  el.histModal.addEventListener('click', (e) => {
    if (e.target === el.histModal) closeHistoryModal();
  });
  el.recordModal?.addEventListener('click', (e) => {
    if (e.target === el.recordModal) closeRecordModal();
  });
  el.btnRecordClose?.addEventListener('click', closeRecordModal);
  el.btnRecordCancel?.addEventListener('click', closeRecordModal);
  el.btnRecordSave?.addEventListener('click', saveRecord);
  el.btnFmtRecOut?.addEventListener('click', () => formatRecordField(el.recOut));
  el.btnFmtRecIn?.addEventListener('click', () => formatRecordField(el.recIn));
  el.btnFmtRecReq?.addEventListener('click', () => formatRecordField(el.recReqBody));
  el.btnFmtRecRes?.addEventListener('click', () => formatRecordField(el.recResBody));

  el.payload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMsg();
    }
  });
  for (const node of [el.recOut, el.recIn, el.recReqBody, el.recResBody]) {
    node?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveRecord();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (recordModalOpen()) {
      closeRecordModal();
      return;
    }
    if (el.histModal && !el.histModal.classList.contains('hidden')) {
      closeHistoryModal();
    }
  });

  el.url.addEventListener('change', async () => {
    applyTransportFromURL();
    const url = currentURL();
    const name = profileNameFromURL(url);
    const existing = name ? profiles.find((x) => x.name === name) : null;
    if (existing && el.profile.value !== name) {
      await applyProfile({ ...existing, url });
    } else {
      syncParamsFromURL();
      await activateCurrent();
    }
    await persistProfile();
  });
  el.url.addEventListener('input', () => {
    if (syncingQuery) return;
    applyTransportFromURL();
    if (isHTTPMode()) syncParamsFromURL();
  });
  el.protocol.addEventListener('change', persistProfile);
  el.method.addEventListener('change', persistProfile);
  el.reconnect.addEventListener('change', persistProfile);

  EventsOn('message', (m) => {
    if (historyMode) return;
    if (!isCurrentProfileEvent(m?.profile)) return;
    appendMsg(m, true);
  });
  EventsOn('status', (s) => {
    if (!isCurrentProfileEvent(s?.profile)) return;
    setState(s);
  });

  if (!profiles.length) {
    try {
      setState(await GetStatus());
    } catch (_) {}
  }

  const paths = await GetPaths();
  el.footer.textContent = `requests: ${paths.requests}   ·   servers: ${paths.servers}`;
}

init().catch((e) => {
  setDetailEmpty('init failed: ' + e);
});
