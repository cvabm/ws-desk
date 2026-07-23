import './style.css';
import {
  Connect,
  Disconnect,
  Send,
  GetProfiles,
  GetStatus,
  GetMessages,
  ClearMessages,
  GetPaths,
  FormatJSON,
  SaveProfile,
  ListSessions,
  SearchSessions,
  LoadSession,
  PickAndLoadSession,
  OpenLogDir,
} from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { renderDetailHtml, toggleJsonNode } from './highlight.js';

const $ = (id) => document.getElementById(id);
const THEME_KEY = 'ws-desk-theme';

const el = {
  app: $('app'),
  profile: $('profile'),
  url: $('url'),
  protocol: $('protocol'),
  reconnect: $('reconnect'),
  btnToggle: $('btnToggle'),
  state: $('state'),
  list: $('list'),
  listTitle: $('listTitle'),
  detail: $('detail'),
  payload: $('payload'),
  btnSend: $('btnSend'),
  btnFormat: $('btnFormat'),
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
};

/** @type {Map<number, any>} */
const store = new Map();
/** @type {any[]} */
let allHistoryMsgs = [];
let selectedId = 0;
let lastSent = '';
let historyMode = false;
let activeHistKeyword = '';
/** @type {any[]} */
let profiles = [];
let histSearchTimer = 0;
let histSearchSeq = 0;

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
}

function setState(status) {
  const s = (status?.state || 'idle').toLowerCase();
  el.state.textContent = s;
  el.state.className = 'state ' + s;
  el.btnToggle.textContent = s === 'open' || s === 'connecting' || s === 'reconnecting' ? '断开' : '连接';
  el.btnToggle.classList.toggle('on', s === 'open' || s === 'connecting' || s === 'reconnecting');
}

function appendMsg(m, scroll = true) {
  if (!m || store.has(m.id)) return;
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
    return;
  }
  setDetailHtml(renderDetailHtml(m.dir, m.time, m.pretty || m.text));
}

function setHistoryMode(on, label = '') {
  historyMode = on;
  el.histBanner.classList.toggle('hidden', !on);
  el.msgFilter.classList.toggle('hidden', !on);
  el.listTitle.textContent = on ? '历史消息' : '消息';
  if (on) {
    el.histLabel.textContent = label || '历史模式';
  } else {
    el.msgFilter.value = '';
    allHistoryMsgs = [];
    activeHistKeyword = '';
  }
}

async function exitHistoryMode() {
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
  const day = detail.info?.day || '';
  const name = day || detail.info?.name || 'log';
  const url = detail.url || detail.info?.url || '';
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

/* —— profiles —— */
function applyProfile(p) {
  if (!p) return;
  el.url.value = p.url || '';
  el.protocol.value = p.protocol || '';
  el.reconnect.checked = p.reconnect !== false;
}

async function loadProfiles() {
  profiles = (await GetProfiles()) || [];
  el.profile.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    el.profile.appendChild(opt);
  }
  if (profiles.length) {
    el.profile.value = profiles[0].name;
    applyProfile(profiles[0]);
  }
}

function currentOpts() {
  return {
    url: el.url.value.trim(),
    protocol: el.protocol.value.trim(),
    headers: {},
    reconnect: el.reconnect.checked,
    pingSec: 20,
  };
}

async function toggleConn() {
  const st = await GetStatus();
  if (st.state === 'open' || st.state === 'connecting' || st.state === 'reconnecting') {
    await Disconnect();
    return;
  }
  try {
    if (historyMode) await exitHistoryMode();
    await Connect(currentOpts());
  } catch (e) {
    setDetailEmpty(String(e));
  }
}

async function sendMsg() {
  const text = el.payload.value.trim();
  if (!text) return;
  try {
    if (historyMode) await exitHistoryMode();
    await Send(text);
    lastSent = text;
  } catch (e) {
    setDetailEmpty(String(e));
  }
}

async function formatPayload() {
  const text = el.payload.value;
  if (!text.trim()) return;
  el.payload.value = await FormatJSON(text);
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

function renderHistoryItems(list, keyword) {
  el.histList.innerHTML = '';
  const kw = (keyword || '').trim();
  el.histEmpty.classList.toggle('hidden', list.length > 0);
  el.histEmpty.textContent = kw
    ? `没有匹配 “${kw}” 的日志`
    : '暂无按天日志（ws-YYYY-MM-DD.jsonl），连接后会自动生成';

  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'hist-item';
    item.innerHTML = `
      <div class="name"></div>
      <div class="size"></div>
      <div class="meta"></div>
      <div class="hint hidden"></div>
    `;
    // prefer day label for daily files
    item.querySelector('.name').textContent = s.day ? s.day : s.name;
    const right = item.querySelector('.size');
    if (kw && (s.matchCount > 0 || s.matchHint)) {
      right.className = 'hits';
      right.textContent = s.matchCount > 0 ? `${s.matchCount} 命中` : '匹配';
    } else {
      right.textContent = formatSize(s.size || 0);
    }
    const metaBits = [];
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
  await loadProfiles();

  el.profile.addEventListener('change', () => {
    const p = profiles.find((x) => x.name === el.profile.value);
    applyProfile(p);
  });

  el.btnToggle.addEventListener('click', toggleConn);
  el.btnSend.addEventListener('click', sendMsg);
  el.btnFormat.addEventListener('click', formatPayload);
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

  el.payload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMsg();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.histModal.classList.contains('hidden')) {
      closeHistoryModal();
    }
  });

  const persist = async () => {
    const name = el.profile.value;
    if (!name) return;
    const p = {
      name,
      url: el.url.value.trim(),
      protocol: el.protocol.value.trim(),
      headers: {},
      reconnect: el.reconnect.checked,
      pingSec: 20,
    };
    try {
      await SaveProfile(p);
      const idx = profiles.findIndex((x) => x.name === name);
      if (idx >= 0) profiles[idx] = p;
    } catch (_) {}
  };
  el.url.addEventListener('change', persist);
  el.protocol.addEventListener('change', persist);
  el.reconnect.addEventListener('change', persist);

  EventsOn('message', (m) => {
    if (historyMode) return;
    appendMsg(m, true);
  });
  EventsOn('status', (s) => setState(s));

  const status = await GetStatus();
  setState(status);
  const existing = await GetMessages(0, 500);
  for (const m of existing || []) appendMsg(m, false);
  el.list.scrollTop = el.list.scrollHeight;

  const paths = await GetPaths();
  el.footer.textContent = `logs: ${paths.logs}   ·   profiles: ${paths.profiles}`;
}

init().catch((e) => {
  setDetailEmpty('init failed: ' + e);
});
