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
  DeleteRequest,
  ListSessions,
  SearchSessions,
  LoadSession,
  LoadSessionMessage,
  PickAndLoadSession,
  OpenLogDir,
  ClearCookies,
} from '../wailsjs/go/main/App';
import { EventsOn, ClipboardSetText } from '../wailsjs/runtime/runtime';
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
  toCurl,
} from './http-ui.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'ws-desk-theme';

const HTTP_SCHEMES = new Set(['http', 'https']);
const ALL_SCHEMES = new Set(['ws', 'wss', 'http', 'https']);

const el = {
  app: $('app'),
  profile: $('profile'),
  btnAddProfile: $('btnAddProfile'),
  btnDelProfile: $('btnDelProfile'),
  urlBox: $('urlBox'),
  urlWrap: $('urlWrap'),
  urlPrefix: $('urlPrefix'),
  url: $('url'),
  savedMenu: $('savedMenu'),
  urlModal: $('urlModal'),
  urlModalTitle: $('urlModalTitle'),
  urlModalInput: $('urlModalInput'),
  urlModalErr: $('urlModalErr'),
  btnUrlModalClose: $('btnUrlModalClose'),
  btnUrlModalCancel: $('btnUrlModalCancel'),
  btnUrlModalOk: $('btnUrlModalOk'),
  confirmModal: $('confirmModal'),
  confirmTitle: $('confirmTitle'),
  confirmMsg: $('confirmMsg'),
  btnConfirmCancel: $('btnConfirmCancel'),
  btnConfirmOk: $('btnConfirmOk'),
  protocol: $('protocol'),
  method: $('method'),
  reconnect: $('reconnect'),
  reconnectWrap: $('reconnectWrap'),
  followRedirects: $('followRedirects'),
  redirectWrap: $('redirectWrap'),
  btnCurl: $('btnCurl'),
  btnCurlDetail: $('btnCurlDetail'),
  btnClearCookies: $('btnClearCookies'),
  btnToggle: $('btnToggle'),
  btnSendTop: $('btnSendTop'),
  btnRecord: $('btnRecord'),
  state: $('state'),
  reqBuilder: $('reqBuilder'),
  reqMeta: $('reqMeta'),
  reqTitle: $('reqTitle'),
  reqDesc: $('reqDesc'),
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
  payloadWrap: $('payloadWrap'),
  payload: $('payload'),
  sendMenu: $('sendMenu'),
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

const LIVE_LIST_CAP = 2000;

/** @type {Map<number, any>} */
const store = new Map();
/** @type {any[]} */
let allHistoryMsgs = [];
/** @type {any[]} */
let allLiveMsgs = [];
let selectedId = 0;
let lastSent = '';
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
let urlPrefix = '';

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
  const s = String(text);
  const head = s.length > 400 ? s.slice(0, 400) : s;
  return head.replace(/\s+/g, ' ').slice(0, 160);
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
  const http = kind === 'http' || HTTP_SCHEMES.has(urlScheme(status?.url)) || isHTTPMode();
  el.state.classList.toggle('hidden', http);
  el.btnToggle.textContent = s === 'open' || s === 'connecting' || s === 'reconnecting' ? '断开' : '连接';
  el.btnToggle.classList.toggle('on', s === 'open' || s === 'connecting' || s === 'reconnecting');
}

function isHTTPStatusNote(m) {
  if (!m || m.dir !== 'sys') return false;
  const t = String(m.text || m.pretty || '').trim();
  if (/^recorded\s+http\b/i.test(t)) return true;
  return /^http\s+\d{3}\b/i.test(t) && /\d+\s*ms/i.test(t);
}

function currentFilterKw() {
  return (el.msgFilter?.value || '').trim();
}

function currentMsgPool() {
  return historyMode ? allHistoryMsgs : allLiveMsgs;
}

function liveListTitleBase() {
  return isHTTPMode() ? '记录' : '消息';
}

function setLiveListTitle(shown, total, kw) {
  if (historyMode || !el.listTitle) return;
  const base = liveListTitleBase();
  el.listTitle.textContent = kw ? `${base} · ${shown}/${total}` : base;
}

function refreshFilterTitle() {
  if (historyMode) return;
  const pool = allLiveMsgs;
  const kw = currentFilterKw();
  setLiveListTitle(kw ? el.list.children.length : pool.length, pool.length, kw);
}

function removeListRow(id) {
  if (!id) return;
  store.delete(id);
  const row = el.list.querySelector(`[data-id="${id}"]`);
  row?.remove();
  if (selectedId === id) {
    selectedId = 0;
    setDetailEmpty('选择一条消息');
    setFillButton(false);
  }
}

function rememberLiveMsg(m) {
  if (!m || isHTTPStatusNote(m)) return false;
  if (allLiveMsgs.some((x) => x.id === m.id)) return false;
  allLiveMsgs.push(m);
  while (allLiveMsgs.length > LIVE_LIST_CAP) {
    const old = allLiveMsgs.shift();
    if (old) removeListRow(old.id);
  }
  return true;
}

function appendMsg(m, scroll = true) {
  if (!m || store.has(m.id) || isHTTPStatusNote(m)) return;
  store.set(m.id, m);

  const kw = currentFilterKw();
  if (kw && !msgMatches(m, kw)) {
    refreshFilterTitle();
    return;
  }

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
  row.title = '点击查看详情';
  row.addEventListener('click', () => selectMsg(m.id));
  el.list.appendChild(row);

  while (el.list.children.length > LIVE_LIST_CAP) {
    const first = el.list.firstElementChild;
    const id = Number(first?.dataset.id);
    if (id) store.delete(id);
    first?.remove();
  }

  refreshFilterTitle();
  if (scroll && !kw) {
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

function paintMsgDetail(m) {
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
  setFillButton(canFillFromMessage(m));
}

let selectSeq = 0;

async function selectMsg(id) {
  selectedId = id;
  const seq = ++selectSeq;
  for (const node of el.list.children) {
    node.classList.toggle('active', Number(node.dataset.id) === id);
  }
  let m = store.get(id);
  if (!m) {
    setDetailEmpty('选择一条消息');
    setFillButton(false);
    return;
  }
  if (historyMode && m.slim) {
    setDetailEmpty('加载详情…');
    try {
      const full = await LoadSessionMessage(id);
      if (seq !== selectSeq || selectedId !== id) return;
      if (full) {
        store.set(id, full);
        m = full;
        const i = allHistoryMsgs.findIndex((x) => x.id === id);
        if (i >= 0) allHistoryMsgs[i] = full;
      }
    } catch (e) {
      if (seq !== selectSeq) return;
      setDetailEmpty('加载失败: ' + e);
      setFillButton(false);
      return;
    }
  }
  paintMsgDetail(m);
}

function setHistoryMode(on, label = '') {
  if (on) {
    closeSavedMenu();
    closeSendMenu();
  }
  historyMode = on;
  el.app?.classList.toggle('history', on);
  el.histBanner.classList.toggle('hidden', !on);
  el.reqPane?.classList.toggle('hidden', on || !isHTTPMode());
  el.composer?.classList.toggle('hidden', on);
  if (on) {
    el.listTitle.textContent = '历史消息';
    el.histLabel.textContent = label || '历史模式';
  } else {
    el.msgFilter.value = '';
    allHistoryMsgs = [];
    activeHistKeyword = '';
    setLiveListTitle(allLiveMsgs.length, allLiveMsgs.length, '');
  }
}

async function loadLiveMessages() {
  const arrived = [];
  allLiveMsgs = arrived;
  clearListUI();
  try {
    const msgs = await GetMessages(0, 500);
    const seen = new Set();
    const next = [];
    for (const m of msgs || []) {
      if (!m || isHTTPStatusNote(m) || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    for (const m of arrived) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    allLiveMsgs = next;
    applyMsgFilter({ selectFirst: false });
    if (!currentFilterKw()) el.list.scrollTop = el.list.scrollHeight;
  } catch (_) {
    allLiveMsgs = arrived.slice();
    applyMsgFilter({ selectFirst: false });
  }
}

async function exitHistoryMode() {
  historySessionURL = '';
  historySessionProtocol = '';
  setHistoryMode(false);
  await loadLiveMessages();
}

function applyMsgFilter({ selectFirst = false } = {}) {
  const pool = currentMsgPool();
  const kw = currentFilterKw();
  const filtered = kw ? pool.filter((m) => msgMatches(m, kw)) : pool;
  if (historyMode) {
    const namePart = el.histLabel.textContent || '历史';
    const base = namePart.replace(/\s*·\s*显示\s+\d+.*/, '');
    el.histLabel.textContent = kw
      ? `${base} · 显示 ${filtered.length}/${pool.length}`
      : base.includes('条')
        ? base
        : `${base} · ${pool.length} 条`;
    if (el.listTitle) el.listTitle.textContent = '历史消息';
  } else {
    setLiveListTitle(filtered.length, pool.length, kw);
  }
  const keepId = selectedId;
  renderMessageList(filtered, {
    scrollTop: kw || historyMode ? 0 : el.list.scrollHeight,
    selectFirst: selectFirst && filtered.length > 0,
  });
  if (!selectFirst && keepId && store.has(keepId)) {
    selectMsg(keepId);
  } else if (!selectFirst && !kw && !historyMode) {
    el.list.scrollTop = el.list.scrollHeight;
  }
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
  applyMsgFilter({ selectFirst: false });
  closeHistoryModal();
}

/* —— scheme / http —— */
function urlScheme(url) {
  const m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return m ? m[1].toLowerCase() : '';
}

function currentScheme() {
  const s = urlScheme(currentURL());
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
  try {
    setState(await GetStatus());
  } catch (_) {}
  await loadLiveMessages();
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
    closeSendMenu();
    el.tabBody.appendChild(el.payload);
  } else if (!http && el.payloadWrap && el.payload.parentElement !== el.payloadWrap) {
    el.payloadWrap.insertBefore(el.payload, el.sendMenu || null);
  }
}

function placeReqMeta(http) {
  if (!el.reqMeta) return;
  if (http && el.reqBuilder && el.reqMeta.parentElement !== el.reqBuilder) {
    el.reqBuilder.insertBefore(el.reqMeta, el.reqBuilder.firstChild);
  } else if (!http && el.composer && el.reqMeta.parentElement !== el.composer) {
    el.composer.insertBefore(el.reqMeta, el.composer.firstChild);
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
  el.redirectWrap?.classList.toggle('hidden', !http);
  el.btnCurlDetail?.classList.toggle('hidden', !http);
  el.btnToggle?.classList.toggle('hidden', http);
  el.btnSendTop?.classList.toggle('hidden', !http);
  el.btnRecord?.classList.remove('hidden');
  if (el.btnRecord) {
    el.btnRecord.title = http
      ? '打开手动记录：用当前请求配一条响应，不发送'
      : '打开手动记录：保存一对发送/返回，不发送';
  }
  el.state?.classList.toggle('hidden', http);
  el.reqPane?.classList.toggle('hidden', historyMode || !http);
  el.composer?.classList.toggle('hidden', historyMode);
  placePayload(http);
  placeReqMeta(http);
  if (el.detailTitle) el.detailTitle.textContent = http ? '响应' : '详情';
  if (!historyMode) refreshFilterTitle();
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

function originFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!ALL_SCHEMES.has(scheme) || !u.host) return '';
    return `${scheme}://${u.host}`;
  } catch {
    return '';
  }
}

function splitLockedURL(url, lockName) {
  const raw = String(url || '').trim();
  if (!raw) {
    const name = String(lockName || '').trim();
    return { prefix: name, rest: '' };
  }
  let prefix = originFromURL(raw);
  if (!prefix) {
    const name = String(lockName || el.profile?.value || profileNameFromURL(raw) || '').trim();
    if (name && raw.slice(0, name.length).toLowerCase() === name.toLowerCase()) prefix = name;
  }
  if (!prefix) return { prefix: '', rest: raw };
  let rest = raw;
  if (rest.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    rest = rest.slice(prefix.length);
  } else {
    try {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
      const u = new URL(withScheme);
      rest = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
    } catch {
      rest = '';
    }
  }
  if (rest === '/') rest = '';
  return { prefix, rest };
}

function setURL(url, lockName) {
  const { prefix, rest } = splitLockedURL(url, lockName);
  urlPrefix = prefix;
  if (el.urlPrefix) {
    el.urlPrefix.textContent = prefix;
    el.urlPrefix.title = prefix ? `${prefix}（前缀不可改，点 + 换地址）` : '';
    el.urlPrefix.classList.toggle('hidden', !prefix);
    el.urlPrefix.setAttribute('aria-hidden', prefix ? 'false' : 'true');
  }
  if (el.url) {
    el.url.value = rest;
    el.url.readOnly = !prefix;
    el.url.placeholder = prefix ? '/path' : '点击 + 填写地址';
  }
}

function currentURL() {
  const rest = (el.url?.value || '').trim();
  if (!urlPrefix) return rest;
  if (!rest) return urlPrefix;
  if (rest.slice(0, urlPrefix.length).toLowerCase() === urlPrefix.toLowerCase()) return rest;
  if (rest.startsWith('/') || rest.startsWith('?') || rest.startsWith('#')) return urlPrefix + rest;
  return `${urlPrefix}/${rest.replace(/^\/+/, '')}`;
}

function normalizeURLPathInput() {
  if (!urlPrefix || !el.url) return;
  const raw = el.url.value;
  const t = raw.trim();
  if (!t) {
    el.url.value = '';
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    const origin = originFromURL(t);
    if (origin && origin.toLowerCase() === urlPrefix.toLowerCase()) {
      el.url.value = splitLockedURL(t).rest;
      return;
    }
    try {
      const u = new URL(t);
      const path = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
      el.url.value = path === '/' ? '' : path;
    } catch {
      el.url.value = '';
    }
  }
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
  if (next) setURL(next);
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

function loadBodyFromProfile(p) {
  const savedBody = p?.body || '';
  if (Array.isArray(p?.formList) && p.formList.length) {
    formRows = cloneRows(p.formList);
  } else if (p?.bodyType === 'form' && savedBody) {
    formRows = parseForm(savedBody);
  } else {
    formRows = [emptyRow()];
  }
  if (bodyType === 'form') {
    if (el.payload) el.payload.value = '';
  } else {
    if (el.payload) el.payload.value = savedBody;
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

function defaultPort(scheme) {
  if (scheme === 'http' || scheme === 'ws') return '80';
  if (scheme === 'https' || scheme === 'wss') return '443';
  return '';
}

function hostPortFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const host = u.hostname || '';
    if (!host) return '';
    const port = u.port || '';
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!port || port === defaultPort(scheme)) return host;
    return u.host || `${host}:${port}`;
  } catch {
    return '';
  }
}

function profileNameFromURL(url) {
  const host = hostPortFromURL(url);
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
  setURL(keepTemplate(currentURL(), ex.url, vars));
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
  selectProfileHost(currentURL());
  setReqTab(String(ex.reqBody || '').trim() ? 'body' : 'params');
  return true;
}

function looksLikeVarRef(s) {
  return String(s || '').includes('{{');
}

function applyWSRecord(rec) {
  if (!rec) return false;
  const vars = currentVarMap();
  if (rec.url) setURL(keepTemplate(currentURL(), rec.url, vars));
  if (el.protocol) el.protocol.value = keepTemplate(el.protocol.value, rec.protocol || '', vars);
  if (el.payload) el.payload.value = keepTemplate(el.payload.value, rec.out || '', vars);
  recordDraft.in = keepTemplate(recordDraft.in, rec.in || '', vars);
  lastSent = rec.out || lastSent;
  if (recordModalOpen()) applyRecordDraftToForm();
  withoutSessionReset(() => applyTransportFromURL());
  selectProfileHost(rec.url);
  return Boolean(rec.url || rec.out || rec.in);
}

function fillPlainMessage(m) {
  if (!m || (m.dir !== 'out' && m.dir !== 'in')) return false;
  const hint = parseHTTPOutPreview(m.text);
  const url = historySessionURL || currentURL();
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
      setURL(historySessionURL);
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
    return true;
  }
  if (historySessionURL) {
    setURL(historySessionURL);
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
  return true;
}

function canFillFromMessage(m) {
  if (!m) return false;
  if (m.exchange || m.ws) return true;
  const near = siblingFillSource(m);
  if (near?.exchange || near?.ws) return true;
  return m.dir === 'out' || m.dir === 'in';
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
  setURL(p.url || p.name || '', p.name);
  el.protocol.value = p.protocol || '';
  const method = (p.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  el.reconnect.checked = p.reconnect !== false;
  if (el.followRedirects) el.followRedirects.checked = !p.noFollowRedirects;
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
  closeSavedMenu();
  closeSendMenu();
  if (isHTTPMode()) renderSavedSelect(matchSavedId());
  else renderSendSelect(matchSavedWSId());
  loadReqMeta(currentSavedRequest());
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
  setURL('');
  if (el.protocol) el.protocol.value = '';
  if (el.method) el.method.value = 'GET';
  el.reconnect.checked = true;
  if (el.payload) el.payload.value = '';
  paramRows = [emptyRow()];
  headerRows = [emptyRow()];
  varRows = [emptyRow()];
  formRows = [emptyRow()];
  lastSent = '';
  resetRecordDraft();
  activeProfileName = '';
  if (el.followRedirects) el.followRedirects.checked = true;
  loadAuthFromProfile(null);
  loadBodyTypeFromProfile(null);
  applyTransportFromURL();
  renderRequestEditor();
  closeSavedMenu();
  closeSendMenu();
  renderSavedSelect('');
  renderSendSelect('');
  loadReqMeta(null);
}

let confirmResolver = null;
let savedSelectSig = '';
let sendSelectSig = '';
let activeSavedId = '';
let savedFilterArmed = false;
let sendFilterArmed = false;

function confirmModalOpen() {
  return Boolean(el.confirmModal && !el.confirmModal.classList.contains('hidden'));
}

function closeConfirmModal(ok) {
  if (!confirmModalOpen()) return;
  el.confirmModal.classList.add('hidden');
  el.confirmModal.setAttribute('aria-hidden', 'true');
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(Boolean(ok));
}

function askConfirm({ title, message, okText }) {
  closeConfirmModal(false);
  if (el.confirmTitle) el.confirmTitle.textContent = title || '确认';
  if (el.confirmMsg) el.confirmMsg.textContent = message || '';
  if (el.btnConfirmOk) el.btnConfirmOk.textContent = okText || '确定';
  el.confirmModal?.classList.remove('hidden');
  el.confirmModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.btnConfirmCancel?.focus(), 30);
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

async function deleteCurrentProfile() {
  const name = el.profile?.value || profileNameFromURL(currentURL());
  if (!name) return;
  const ok = await askConfirm({
    title: '删除地址',
    message: `确定删除 ${name} ？此操作不可恢复。`,
    okText: '删除',
  });
  if (!ok) return;
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
    openUrlModal();
  }
}

async function loadProfiles() {
  profiles = (await GetProfiles()) || [];
  renderProfileSelect();
  if (profiles.length) {
    const cur = profiles.find((p) => p.name === el.profile.value) || profiles[0];
    await applyProfile(cur);
  } else {
    clearEditor();
    openUrlModal();
  }
}

function urlModalOpen() {
  return Boolean(el.urlModal && !el.urlModal.classList.contains('hidden'));
}

function setUrlModalError(text) {
  if (el.urlModalErr) el.urlModalErr.textContent = text || '';
}

function normalizeDialURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (urlScheme(t)) return t;
  return `ws://${t.replace(/^\/\//, '')}`;
}

function validateNewURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return '请输入 URL';
  const scheme = urlScheme(t);
  if (scheme && !ALL_SCHEMES.has(scheme)) return '仅支持 ws、wss、http、https';
  const url = normalizeDialURL(t);
  if (!hostFromURL(url) || !profileNameFromURL(url)) return '请输入有效的主机（IP 或域名）';
  return '';
}

function openUrlModal() {
  closeSavedMenu();
  closeSendMenu();
  if (el.urlModalTitle) el.urlModalTitle.textContent = profiles.length ? '增加地址' : '输入地址';
  if (el.urlModalInput) el.urlModalInput.value = '';
  setUrlModalError('');
  el.urlModal?.classList.remove('hidden');
  el.urlModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.urlModalInput?.focus(), 30);
}

function closeUrlModal() {
  if (!urlModalOpen()) return;
  el.urlModal.classList.add('hidden');
  el.urlModal.setAttribute('aria-hidden', 'true');
  setUrlModalError('');
}

function urlModalHasDraft() {
  return Boolean(String(el.urlModalInput?.value || '').trim());
}

async function submitUrlModal() {
  const raw = el.urlModalInput?.value || '';
  const err = validateNewURL(raw);
  if (err) {
    setUrlModalError(err);
    el.urlModalInput?.focus();
    return;
  }
  const url = normalizeDialURL(raw);
  const name = profileNameFromURL(url);
  const existing = name ? profiles.find((p) => p.name === name) : null;
  closeUrlModal();
  const prevName = profileNameFromURL(currentURL());
  if (prevName && prevName !== name) {
    await persistProfile(existing ? name : prevName);
  }
  if (existing) {
    await applyProfile({ ...existing, url });
    await persistProfile();
    return;
  }
  clearTimeout(persistTimer);
  clearEditor();
  setURL(url, name);
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  await persistProfile();
  await activateCurrent();
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
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
  };
}

function curlFollowRedirects() {
  return el.followRedirects ? el.followRedirects.checked : true;
}

function currentCurlSpec() {
  const opts = resolvedOpts();
  return {
    method: opts.method,
    url: opts.url,
    headers: opts.headers,
    body: isHTTPMode() ? resolvedBody() : '',
    followRedirects: curlFollowRedirects(),
  };
}

function exchangeCurlSpec(ex) {
  return {
    method: ex.method,
    url: ex.url,
    headers: ex.reqHeaders || {},
    body: ex.reqBody || '',
    followRedirects: curlFollowRedirects(),
  };
}

async function copyText(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    if (await ClipboardSetText(s)) return true;
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch (_) {}
  return false;
}

function flashButton(btn, label, ms = 900) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = label;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.textContent = prev;
  }, ms);
}

async function copyCurl(fromDetail) {
  const m = fromDetail ? store.get(selectedId) : null;
  const spec = m?.exchange ? exchangeCurlSpec(m.exchange) : currentCurlSpec();
  if (!spec.url) {
    setDetailEmpty('请先填写 URL');
    return;
  }
  const ok = await copyText(toCurl(spec));
  const btn = fromDetail ? el.btnCurlDetail : el.btnCurl;
  flashButton(btn, ok ? '已复制' : '复制失败');
}

function currentProfile() {
  const name = profileNameFromURL(currentURL()) || activeProfileName || el.profile?.value || '';
  if (!name) return null;
  return profiles.find((p) => p.name === name) || null;
}

function currentProfileRequests() {
  const p = currentProfile();
  return Array.isArray(p?.requests) ? p.requests : [];
}

function isHTTPSaved(r) {
  if (!r) return false;
  if (r.kind === 'ws') return false;
  if (r.kind === 'http') return true;
  return HTTP_SCHEMES.has(urlScheme(r.url));
}

function isWSSaved(r) {
  if (!r) return false;
  if (r.kind === 'http') return false;
  if (r.kind === 'ws') return true;
  return !HTTP_SCHEMES.has(urlScheme(r.url));
}

function currentHTTPRequests() {
  return currentProfileRequests().filter(isHTTPSaved);
}

function currentWSMessages() {
  return currentProfileRequests().filter(isWSSaved);
}

function scalarMessageName(v) {
  if (v == null) return '';
  const t = typeof v;
  if (t === 'string') return v.trim();
  if (t === 'number' && Number.isFinite(v)) return String(v);
  if (t === 'boolean') return String(v);
  return '';
}

function firstNamedField(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  for (const k of keys) {
    const name = scalarMessageName(obj[k]);
    if (name) return name;
  }
  return '';
}

function wsMessageKey(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const top = firstNamedField(v, ['cmd', 'type', 'action', 'op', 'event', 'venus', 'janus', 'request']);
      const nested = firstNamedField(v.body, ['request', 'cmd', 'type', 'action', 'op', 'event']);
      if (top && nested && top !== nested) return `${top}/${nested}`;
      if (nested) return nested;
      if (top) return top;
    }
  } catch (_) {}
  return raw.replace(/\s+/g, '');
}

function wsShortName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 40) return false;
  if (/^[{[\/]/.test(n)) return false;
  if (/\s/.test(n)) return false;
  return true;
}

function oneLinePreview(text, max = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function wsMessageStoreName(key, text) {
  if (wsShortName(key)) return key.slice(0, 80);
  const preview = oneLinePreview(text, 80);
  return preview.replace(/…$/, '') || key.slice(0, 80);
}

function wsCmdLabel(r) {
  const key = wsMessageKey(r?.body || '');
  return wsShortName(key) ? key : '';
}

function looksLikeHTTPKey(name) {
  return /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S/i.test(String(name || ''));
}

function requestDisplayTitle(r) {
  const t = String(r?.title || '').trim();
  if (t) return t;
  const n = String(r?.name || '').trim();
  if (!n) return '';
  if (isHTTPSaved(r) && looksLikeHTTPKey(n)) return '';
  if (isWSSaved(r)) {
    if (!wsShortName(n)) return '';
    if (n === wsMessageKey(r.body || '')) return '';
  }
  return n;
}

function requestDescription(r) {
  return String(r?.description || '').trim();
}

function currentReqTitle() {
  return String(el.reqTitle?.value || '').trim();
}

function currentReqDesc() {
  return String(el.reqDesc?.value || '').trim();
}

function loadReqMeta(req) {
  if (el.reqTitle) el.reqTitle.value = req?.title || '';
  if (el.reqDesc) el.reqDesc.value = req?.description || '';
}

function flushReqMeta() {
  const req = currentSavedRequest();
  if (!req) return;
  req.title = currentReqTitle();
  req.description = currentReqDesc();
}

function rematchSavedFromEditor() {
  const id = isHTTPMode() ? matchSavedId() : matchSavedWSId();
  if (id === activeSavedId) return;
  flushReqMeta();
  activeSavedId = id || '';
  loadReqMeta(currentSavedRequest());
}

function onReqMetaInput() {
  const req = currentSavedRequest();
  if (req) {
    req.title = currentReqTitle();
    req.description = currentReqDesc();
    if (isHTTPMode()) {
      if (savedMenuOpen()) renderSavedSelect();
    } else if (sendMenuOpen()) {
      renderSendSelect();
    }
  }
  schedulePersist();
}

function currentSavedRequest() {
  if (!activeSavedId) return null;
  return currentProfileRequests().find((r) => r.id === activeSavedId) || null;
}

function savedMenuOpen() {
  return Boolean(el.savedMenu && !el.savedMenu.classList.contains('hidden'));
}

function canOpenSavedMenu() {
  if (!isHTTPMode()) return false;
  if (historyMode) return false;
  if (confirmModalOpen() || urlModalOpen() || recordModalOpen()) return false;
  if (!urlPrefix || el.url?.readOnly) return false;
  return true;
}

function canOpenSendMenu() {
  if (isHTTPMode()) return false;
  if (historyMode) return false;
  if (confirmModalOpen() || urlModalOpen() || recordModalOpen()) return false;
  if (!profileNameFromURL(currentURL()) && !activeProfileName) return false;
  return true;
}

function savedFilterKeyword() {
  if (!savedFilterArmed) return '';
  return String(el.url?.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function closeSavedMenu() {
  el.savedMenu?.classList.add('hidden');
  el.savedMenu?.setAttribute('aria-hidden', 'true');
  el.url?.setAttribute('aria-expanded', 'false');
  el.urlWrap?.classList.remove('open');
}

function sendMenuOpen() {
  return Boolean(el.sendMenu && !el.sendMenu.classList.contains('hidden'));
}

function closeSendMenu() {
  el.sendMenu?.classList.add('hidden');
  el.sendMenu?.setAttribute('aria-hidden', 'true');
  el.payload?.setAttribute('aria-expanded', 'false');
  el.payloadWrap?.classList.remove('open');
}

function openSavedMenu() {
  if (!el.savedMenu || !canOpenSavedMenu()) return;
  flushReqMeta();
  const reqs = currentHTTPRequests();
  if (!reqs.length && !savedFilterKeyword()) return;
  closeSendMenu();
  renderSavedSelect(activeSavedId);
  el.savedMenu.classList.remove('hidden');
  el.savedMenu.setAttribute('aria-hidden', 'false');
  el.url?.setAttribute('aria-expanded', 'true');
  el.urlWrap?.classList.add('open');
}

function sendFilterKeyword() {
  if (!sendFilterArmed) return '';
  return String(el.payload?.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function openSendMenu() {
  if (!el.sendMenu || !canOpenSendMenu()) return;
  flushReqMeta();
  const reqs = currentWSMessages();
  if (!reqs.length && !sendFilterKeyword()) return;
  closeSavedMenu();
  renderSendSelect(activeSavedId);
  el.sendMenu.classList.remove('hidden');
  el.sendMenu.setAttribute('aria-hidden', 'false');
  el.payload?.setAttribute('aria-expanded', 'true');
  el.payloadWrap?.classList.add('open');
}

function urlPathname(url) {
  let path = splitLockedURL(url).rest || '';
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  path = path.trim();
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function requestKeyFrom(req) {
  const url = req?.url || '';
  const path = urlPathname(url);
  if (HTTP_SCHEMES.has(urlScheme(url))) {
    return `${String(req?.method || 'GET').toUpperCase()} ${path}`;
  }
  return path;
}

function currentRequestKey() {
  const path = urlPathname(currentURL());
  if (isHTTPMode()) return `${(el.method?.value || 'GET').toUpperCase()} ${path}`;
  return path;
}

function matchSavedId() {
  const key = currentRequestKey();
  return currentHTTPRequests().find((r) => requestKeyFrom(r) === key)?.id || '';
}

function matchSavedWSId() {
  const key = wsMessageKey(el.payload?.value || '');
  if (!key) return '';
  return currentWSMessages().find((r) => wsMessageKey(r.body || '') === key)?.id || '';
}

function newRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function snapshotCurrentRequest(name, id) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    kind: 'http',
    url: currentURL(),
    method: el.method?.value || 'GET',
    protocol: el.protocol?.value?.trim() || '',
    headerList: cloneRows(headerRows),
    authType: el.authType?.value || authState.type || 'none',
    authToken: el.authToken?.value || authState.token || '',
    authUser: el.authUser?.value || authState.user || '',
    authPass: el.authPass?.value || authState.pass || '',
    bodyType: currentBodyType(),
    body: currentBody(),
    formList: cloneRows(formRows),
  };
}

function snapshotWSMessage(name, id) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    kind: 'ws',
    url: currentURL(),
    protocol: el.protocol?.value?.trim() || '',
    body: el.payload?.value || '',
  };
}

function applySavedRequest(req) {
  if (!req) return false;
  const lock = profileNameFromURL(currentURL()) || activeProfileName || '';
  const raw = String(req.url || '').trim();
  const reqHost = profileNameFromURL(raw);
  if (lock && reqHost && reqHost !== lock) {
    const rest = splitLockedURL(raw).rest;
    setURL(rest ? lock + rest : lock, lock);
  } else if (raw) {
    setURL(raw, lock || reqHost);
  }
  if (el.protocol) el.protocol.value = req.protocol || '';
  const method = (req.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  loadHeadersFromProfile(req);
  loadAuthFromProfile(req);
  loadBodyTypeFromProfile(req);
  loadBodyFromProfile(req);
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  loadReqMeta(req);
  return true;
}

function applySavedWSMessage(req) {
  if (!req || !el.payload) return false;
  el.payload.value = req.body || '';
  lastSent = el.payload.value;
  loadReqMeta(req);
  return true;
}

function savedSelectSignature(reqs) {
  return (reqs || []).map((r) => `${r.id}\t${r.name || ''}\t${r.title || ''}\t${r.description || ''}`).join('\n');
}

function requestItemPath(r) {
  const rest = splitLockedURL(r?.url || '').rest;
  return rest || urlPathname(r?.url) || '/';
}

function savedRequestHaystack(r) {
  const http = HTTP_SCHEMES.has(urlScheme(r?.url));
  const method = http ? String(r?.method || 'GET').toUpperCase() : '';
  const path = requestItemPath(r);
  return `${method} ${path} ${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.url || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function savedRequestMatches(r, kw) {
  if (!kw) return true;
  return savedRequestHaystack(r).includes(kw);
}

function fillHighlighted(node, text, kw) {
  node.textContent = '';
  const raw = String(text || '');
  const needle = String(kw || '').trim();
  if (!needle) {
    node.textContent = raw;
    return;
  }
  const lower = raw.toLowerCase();
  const q = needle.toLowerCase();
  let from = 0;
  let i = lower.indexOf(q, from);
  if (i < 0) {
    node.textContent = raw;
    return;
  }
  while (i >= 0) {
    if (i > from) node.appendChild(document.createTextNode(raw.slice(from, i)));
    const mark = document.createElement('span');
    mark.className = 'saved-hit';
    mark.textContent = raw.slice(i, i + q.length);
    node.appendChild(mark);
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  if (from < raw.length) node.appendChild(document.createTextNode(raw.slice(from)));
}

function appendSavedEmpty(menu, text) {
  const empty = document.createElement('div');
  empty.className = 'saved-empty';
  empty.textContent = text;
  menu.appendChild(empty);
}

function makeSavedDelButton(label) {
  const del = document.createElement('button');
  del.className = 'saved-item-del';
  del.type = 'button';
  del.tabIndex = -1;
  del.title = '删除';
  del.setAttribute('aria-label', `删除 ${label}`);
  del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  return del;
}

function renderSavedSelect(selectedId) {
  if (selectedId !== undefined) {
    activeSavedId = selectedId || '';
  }
  const reqs = currentHTTPRequests();
  if (activeSavedId && !reqs.some((r) => r.id === activeSavedId)) activeSavedId = '';
  savedSelectSig = savedSelectSignature(reqs);
  if (!el.savedMenu) return;
  const kw = savedFilterKeyword();
  const shown = kw ? reqs.filter((r) => savedRequestMatches(r, kw)) : reqs;
  el.savedMenu.innerHTML = '';
  if (!reqs.length) {
    appendSavedEmpty(el.savedMenu, '发送后会按方法 + 路径出现在这里');
    return;
  }
  if (!shown.length) {
    appendSavedEmpty(el.savedMenu, `没有匹配 “${el.url?.value?.trim() || kw}”`);
    return;
  }
  for (const r of shown) {
    const item = document.createElement('div');
    item.className = 'saved-item' + (r.id === activeSavedId ? ' on' : '');
    item.dataset.id = r.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', r.id === activeSavedId ? 'true' : 'false');
    const method = String(r.method || 'GET').toUpperCase();
    const path = requestItemPath(r);
    const title = requestDisplayTitle(r);
    const desc = requestDescription(r);
    item.title = [title, `${method} ${path}`, desc].filter(Boolean).join('\n');
    const main = document.createElement('div');
    main.className = 'saved-item-main';
    const line = document.createElement('div');
    line.className = 'saved-item-line';
    const m = document.createElement('span');
    m.className = `saved-item-method ${method.toLowerCase()}`;
    fillHighlighted(m, method, kw);
    line.appendChild(m);
    const head = document.createElement('span');
    head.className = title ? 'saved-item-title' : 'saved-item-path';
    fillHighlighted(head, title || path, kw);
    line.appendChild(head);
    main.appendChild(line);
    const subParts = [];
    if (title) subParts.push(path);
    if (desc) subParts.push(desc);
    if (subParts.length) {
      const sub = document.createElement('div');
      sub.className = 'saved-item-sub';
      fillHighlighted(sub, subParts.join(' · '), kw);
      main.appendChild(sub);
    }
    item.appendChild(main);
    item.appendChild(makeSavedDelButton(title || `${method} ${path}`));
    el.savedMenu.appendChild(item);
  }
}

function savedWSHaystack(r) {
  return `${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.body || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function savedWSMatches(r, kw) {
  if (!kw) return true;
  return savedWSHaystack(r).includes(kw);
}

function renderSendSelect(selectedId) {
  if (selectedId !== undefined) {
    activeSavedId = selectedId || '';
  }
  const reqs = currentWSMessages();
  if (activeSavedId && !reqs.some((r) => r.id === activeSavedId)) activeSavedId = '';
  sendSelectSig = savedSelectSignature(reqs);
  if (!el.sendMenu) return;
  const kw = sendFilterKeyword();
  const shown = kw ? reqs.filter((r) => savedWSMatches(r, kw)) : reqs;
  el.sendMenu.innerHTML = '';
  if (!reqs.length) {
    appendSavedEmpty(el.sendMenu, '发送后会按 cmd / type / request 出现在这里');
    return;
  }
  if (!shown.length) {
    appendSavedEmpty(el.sendMenu, `没有匹配 “${oneLinePreview(el.payload?.value, 24) || kw}”`);
    return;
  }
  for (const r of shown) {
    const item = document.createElement('div');
    item.className = 'saved-item' + (r.id === activeSavedId ? ' on' : '');
    item.dataset.id = r.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', r.id === activeSavedId ? 'true' : 'false');
    const title = requestDisplayTitle(r);
    const cmd = wsCmdLabel(r);
    const preview = oneLinePreview(r.body || r.name || '', 96);
    const desc = requestDescription(r);
    const tip = [title, cmd, preview, desc].filter(Boolean).join('\n');
    item.title = tip;
    const main = document.createElement('div');
    main.className = 'saved-item-main';
    const line = document.createElement('div');
    line.className = 'saved-item-line';
    const headText = title || cmd || preview;
    if (headText) {
      const n = document.createElement('span');
      n.className = title ? 'saved-item-title' : 'saved-item-cmd';
      fillHighlighted(n, headText, kw);
      line.appendChild(n);
    }
    if (title && cmd && cmd !== title) {
      const c = document.createElement('span');
      c.className = 'saved-item-cmd';
      fillHighlighted(c, cmd, kw);
      line.appendChild(c);
    }
    if (line.childNodes.length) main.appendChild(line);
    const subParts = [];
    if (preview && preview !== headText) subParts.push(preview);
    if (desc) subParts.push(desc);
    if (subParts.length) {
      const sub = document.createElement('div');
      sub.className = 'saved-item-sub';
      fillHighlighted(sub, subParts.join(' · '), kw);
      main.appendChild(sub);
    }
    item.appendChild(main);
    item.appendChild(makeSavedDelButton(title || cmd || preview));
    el.sendMenu.appendChild(item);
  }
}

function syncSavedSelect(selectedId) {
  if (selectedId !== undefined) activeSavedId = selectedId || '';
  const reqs = currentHTTPRequests();
  if (savedSelectSignature(reqs) !== savedSelectSig || savedMenuOpen()) {
    renderSavedSelect(activeSavedId);
  }
}

function syncSendSelect(selectedId) {
  if (selectedId !== undefined) activeSavedId = selectedId || '';
  const reqs = currentWSMessages();
  if (savedSelectSignature(reqs) !== sendSelectSig || sendMenuOpen()) {
    renderSendSelect(activeSavedId);
  }
}

function upsertCurrentSavedRequest() {
  const host = profileNameFromURL(currentURL());
  if (!host) return '';
  let p = currentProfile();
  if (!p) {
    p = { name: host, url: currentURL(), requests: [] };
    profiles.push(p);
    profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const list = Array.isArray(p.requests) ? p.requests.slice() : [];
  if (isHTTPMode()) {
    const key = currentRequestKey();
    let i = list.findIndex((r) => isHTTPSaved(r) && requestKeyFrom(r) === key);
    if (i < 0) i = list.findIndex((r) => isHTTPSaved(r) && r.name === key);
    const req = snapshotCurrentRequest(key, i >= 0 ? list[i].id : newRequestId());
    if (i >= 0) list[i] = req;
    else list.push(req);
    p.requests = list;
    return req.id;
  }
  const text = el.payload?.value || '';
  const key = wsMessageKey(text);
  if (!key) return '';
  let i = list.findIndex((r) => isWSSaved(r) && wsMessageKey(r.body || '') === key);
  const req = snapshotWSMessage(wsMessageStoreName(key, text), i >= 0 ? list[i].id : newRequestId());
  if (i >= 0) list[i] = req;
  else list.push(req);
  p.requests = list;
  return req.id;
}

async function deleteNamedRequest(id) {
  const req = currentProfileRequests().find((r) => r.id === id);
  if (!req?.id) return;
  const httpOpen = savedMenuOpen();
  const wsOpen = sendMenuOpen();
  closeSavedMenu();
  closeSendMenu();
  const ws = isWSSaved(req);
  const label = requestDisplayTitle(req) || req.name;
  const ok = await askConfirm({
    title: ws ? '删除发送' : '删除请求',
    message: `确定删除「${label}」？此操作不可恢复。`,
    okText: '删除',
  });
  if (!ok) {
    if (httpOpen) openSavedMenu();
    if (wsOpen) openSendMenu();
    return;
  }
  const name = profileNameFromURL(currentURL()) || activeProfileName;
  if (!name) return;
  try {
    await DeleteRequest(name, req.id);
  } catch (e) {
    setDetailEmpty('删除失败: ' + e);
    return;
  }
  const p = currentProfile();
  if (p) p.requests = currentProfileRequests().filter((r) => r.id !== req.id);
  if (activeSavedId === req.id) {
    activeSavedId = '';
    loadReqMeta(null);
  }
  if (ws) renderSendSelect(activeSavedId);
  else renderSavedSelect(activeSavedId);
  if (httpOpen && canOpenSavedMenu()) {
    openSavedMenu();
    el.url?.focus();
  } else if (wsOpen && canOpenSendMenu()) {
    openSendMenu();
    el.payload?.focus();
  }
}

async function pickSavedRequest(id) {
  const req = currentHTTPRequests().find((r) => r.id === id);
  if (!req) return;
  applySavedRequest(req);
  activeSavedId = req.id;
  closeSavedMenu();
  renderSavedSelect(req.id);
  await persistProfile();
}

async function pickSavedWSMessage(id) {
  const req = currentWSMessages().find((r) => r.id === id);
  if (!req) return;
  applySavedWSMessage(req);
  activeSavedId = req.id;
  sendFilterArmed = false;
  closeSendMenu();
  renderSendSelect(req.id);
  await persistProfile();
}

function onSavedMenuClick(e) {
  const del = e.target?.closest?.('.saved-item-del');
  if (del) {
    e.preventDefault();
    e.stopPropagation();
    const id = del.closest('.saved-item')?.dataset?.id;
    if (id) deleteNamedRequest(id);
    return;
  }
  const item = e.target?.closest?.('.saved-item');
  if (item?.dataset?.id) pickSavedRequest(item.dataset.id);
}

function onSendMenuClick(e) {
  const del = e.target?.closest?.('.saved-item-del');
  if (del) {
    e.preventDefault();
    e.stopPropagation();
    const id = del.closest('.saved-item')?.dataset?.id;
    if (id) deleteNamedRequest(id);
    return;
  }
  const item = e.target?.closest?.('.saved-item');
  if (item?.dataset?.id) pickSavedWSMessage(item.dataset.id);
}

async function persistProfile(selectName) {
  if (typeof selectName !== 'string') selectName = '';
  flushReqMeta();
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
    body: currentBody(),
    formList: cloneRows(formRows),
    reconnect: el.reconnect.checked,
    pingSec: 20,
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
    requests: currentProfileRequests(),
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

function requireURL() {
  if (currentURL() && profileNameFromURL(currentURL())) return true;
  openUrlModal();
  return false;
}

async function toggleConn() {
  if (isHTTPMode()) return;
  if (!requireURL()) return;
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
  if (!requireURL()) return;
  await activateCurrent();
  const rawURL = currentURL();
  const http = isHTTPURL(rawURL);
  const opts = resolvedOpts();
  const text = http ? resolvedBody() : expandVars(el.payload.value.trim(), currentVarMap());
  if (!http && !text) return;
  setBusy(true);
  try {
    if (historyMode) await exitHistoryMode();
    const savedId = upsertCurrentSavedRequest();
    await persistProfile();
    if (http) syncSavedSelect(savedId);
    else syncSendSelect(savedId);
    if (savedId) loadReqMeta(currentSavedRequest());
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
  schedulePersist();
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
  closeSavedMenu();
  closeSendMenu();
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
  closeSavedMenu();
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
  const named = profileNameFromURL(s?.url);
  if (named) return [s?.day, named].filter(Boolean).join('  ·  ');
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
  el.btnAddProfile?.addEventListener('click', () => openUrlModal());
  el.btnUrlModalClose?.addEventListener('click', closeUrlModal);
  el.btnUrlModalCancel?.addEventListener('click', closeUrlModal);
  el.btnUrlModalOk?.addEventListener('click', submitUrlModal);
  el.urlModalInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submitUrlModal();
    }
  });
  el.btnConfirmCancel?.addEventListener('click', () => closeConfirmModal(false));
  el.btnConfirmOk?.addEventListener('click', () => closeConfirmModal(true));
  el.confirmModal?.addEventListener('click', (e) => {
    if (e.target === el.confirmModal) closeConfirmModal(false);
  });
  suppressSessionReset = true;
  try {
    applyTransportFromURL();
    await loadProfiles();
  } finally {
    suppressSessionReset = false;
  }

  el.profile.addEventListener('change', async () => {
    closeSavedMenu();
    closeSendMenu();
    const nextName = el.profile.value;
    clearTimeout(persistTimer);
    await persistProfile(nextName);
    const p = profiles.find((x) => x.name === nextName);
    await applyProfile(p);
  });
  el.btnDelProfile?.addEventListener('click', deleteCurrentProfile);
  el.savedMenu?.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('.saved-item-del')) e.preventDefault();
  });
  el.savedMenu?.addEventListener('click', onSavedMenuClick);
  el.sendMenu?.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('.saved-item-del')) e.preventDefault();
  });
  el.sendMenu?.addEventListener('click', onSendMenuClick);
  document.addEventListener('mousedown', (e) => {
    if (savedMenuOpen() && !el.savedMenu?.contains(e.target) && e.target !== el.url) {
      closeSavedMenu();
    }
    if (sendMenuOpen() && !el.sendMenu?.contains(e.target) && e.target !== el.payload) {
      closeSendMenu();
    }
  });

  el.btnToggle.addEventListener('click', toggleConn);
  el.btnSend.addEventListener('click', sendMsg);
  el.btnSendTop?.addEventListener('click', sendMsg);
  el.btnRecord?.addEventListener('click', openRecordModal);
  el.btnFill?.addEventListener('click', () => {
    const m = store.get(selectedId);
    if (fillFromMessage(m)) {
      setFillButton(true);
      flashFilled();
      schedulePersist();
    }
  });
  el.btnCurl?.addEventListener('click', () => copyCurl(false));
  el.btnCurlDetail?.addEventListener('click', () => copyCurl(true));
  el.btnClearCookies?.addEventListener('click', async () => {
    try {
      await ClearCookies();
      flashButton(el.btnClearCookies, '已清除');
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.followRedirects?.addEventListener('change', persistProfile);
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
    allLiveMsgs = [];
    clearListUI();
    refreshFilterTitle();
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
  el.msgFilter.addEventListener('input', () => applyMsgFilter());
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

  el.payload.addEventListener('focus', () => {
    if (!canOpenSendMenu()) return;
    sendFilterArmed = false;
    openSendMenu();
  });
  el.payload.addEventListener('input', () => {
    schedulePersist();
    if (!canOpenSendMenu()) return;
    sendFilterArmed = true;
    if (currentWSMessages().length) openSendMenu();
    else closeSendMenu();
  });
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
    if (confirmModalOpen()) {
      closeConfirmModal(false);
      return;
    }
    if (savedMenuOpen()) {
      closeSavedMenu();
      return;
    }
    if (sendMenuOpen()) {
      closeSendMenu();
      return;
    }
    if (recordModalOpen()) {
      closeRecordModal();
      return;
    }
    if (urlModalOpen()) {
      if (e.isComposing || e.keyCode === 229 || urlModalHasDraft()) return;
      closeUrlModal();
      return;
    }
    if (el.histModal && !el.histModal.classList.contains('hidden')) {
      closeHistoryModal();
    }
  });

  el.url.addEventListener('click', () => {
    if (!urlPrefix) openUrlModal();
  });
  el.url.addEventListener('focus', () => {
    if (!canOpenSavedMenu()) return;
    savedFilterArmed = false;
    openSavedMenu();
  });
  el.url.addEventListener('change', async () => {
    normalizeURLPathInput();
    applyTransportFromURL();
    syncParamsFromURL();
    rematchSavedFromEditor();
    await activateCurrent();
    await persistProfile();
  });
  el.url.addEventListener('input', () => {
    if (syncingQuery) return;
    if (isHTTPMode()) syncParamsFromURL();
    if (!canOpenSavedMenu()) return;
    savedFilterArmed = true;
    if (currentHTTPRequests().length) openSavedMenu();
  });
  el.protocol.addEventListener('change', persistProfile);
  el.method.addEventListener('change', () => {
    rematchSavedFromEditor();
    persistProfile();
  });
  el.reconnect.addEventListener('change', persistProfile);
  el.reqTitle?.addEventListener('input', onReqMetaInput);
  el.reqDesc?.addEventListener('input', onReqMetaInput);

  EventsOn('message', (m) => {
    if (historyMode) return;
    if (!isCurrentProfileEvent(m?.profile)) return;
    rememberLiveMsg(m);
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
