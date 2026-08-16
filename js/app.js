// ===== N2 冲刺网 主逻辑 =====

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const storage = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickN(arr, n) {
  const a = arr.slice();
  shuffle(a);
  return a.slice(0, n);
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------- 考试日期（2026年12月6日・12月第一周日） ----------
const EXAM_DATE = new Date(2026, 11, 6);
function daysUntil() {
  const now = new Date();
  const diff = EXAM_DATE - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------- 状态 ----------
let state = storage.get('n2sprint', {
  checks: {},
  seenVocab: [],
  knownVocab: [],
  wrongVocab: [],
  wrongQuiz: [],
  achievements: {},
  quizBest: null,
  quizHistory: [],
  listenDone: [],
  readDone: [],
  kanjiLearned: [],
  dailyStats: {},
  dailyQuiz: null,
});
function saveState() { storage.set('n2sprint', state); }

// ---------- 全局变量 ----------
let currentView = 'dashboard';
let vocabCat = '全部';
let vocabIdx = 0;
let vocabList = [];      // 当前过滤后的 N2_VOCAB 下标
let unitIdx = 0;
let listenCat = '全部';
let listenIdx = 0;
let listenAnswered = false;
let readingCat = '全部';
let readingIdx = 0;
let readingAnswered = {};
let quizMode = 'full';
let quizQuestions = [];
let quizIdx = 0;
let quizAnswers = [];
let quizRevealed = [];
let quizTimer = null;
let quizSeconds = 0;
let quizDuration = 0;
let kanjiCat = '全部';
let kanjiIdx = 0;
let kanjiList = [];
let tableTab = 'wt6000';
let wtPage = 0;

// ---------- 日期工具 ----------
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(d) {
  return `${d.getMonth()+1}月${d.getDate()}日（${['日','月','火','水','木','金','土'][d.getDay()]}）`;
}
const WEEK_JP = ['日','月','火','水','木','金','土'];

// ---------- 导航 ----------
function switchView(view) {
  currentView = view;
  $$('.view').forEach(v => v.style.display = 'none');
  $('#view-' + view).style.display = '';
  $$('.nav-item, .bn-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  window.scrollTo({ top: 0 });
  if (window.innerWidth <= 768) $('#sidebar').classList.remove('open');
  if (view === 'dashboard') renderDashboard();
  if (view === 'vocab') renderVocab();
  if (view === 'kanji') renderKanji();
  if (view === 'tables') renderTables();
  if (view === 'grammar') renderGrammar();
  if (view === 'listening') renderListening();
  if (view === 'reading') renderReading();
  if (view === 'quiz') renderQuiz();
  if (view === 'mistakes') renderMistakes();
  if (view === 'stats') renderStats();
  if (view === 'exam') renderExam();
  if (view === 'plan') renderPlan();
}
$$('.nav-item, .bn-item').forEach(n => {
  n.addEventListener('click', (e) => { e.preventDefault(); switchView(n.dataset.view); });
});
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- 语音朗读 ----------
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音朗读'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const jp = voices.find(v => v.lang === 'ja-JP') || voices.find(v => v.lang.startsWith('ja'));
  if (jp) u.voice = jp;
  window.speechSynthesis.speak(u);
}

// ---------- 成就 ----------
const ACHIEVEMENTS = [
  { id: 'first', emoji: '🌱', name: '初出茅庐', desc: '完成第一次打卡' },
  { id: 'week3', emoji: '🔥', name: '三日之约', desc: '连续打卡3天' },
  { id: 'week7', emoji: '⚡', name: '七日小成', desc: '连续打卡7天' },
  { id: 'week14', emoji: '💪', name: '半月坚持', desc: '连续打卡14天' },
  { id: 'week30', emoji: '🏆', name: '月满功成', desc: '连续打卡30天' },
  { id: 'vocab50', emoji: '📚', name: '词汇小达人', desc: '学过50个单词' },
  { id: 'vocab200', emoji: '📕', name: '词汇大师', desc: '学过200个单词' },
  { id: 'grammar20', emoji: '📖', name: '文法新秀', desc: '学习20个文法点' },
  { id: 'listen20', emoji: '🎧', name: '听力先锋', desc: '完成20道听力题' },
  { id: 'read10', emoji: '📰', name: '阅读能手', desc: '完成10篇阅读' },
  { id: 'quiz1', emoji: '🎯', name: '首战告捷', desc: '完成第一次模拟测试' },
  { id: 'quiz80', emoji: '🌟', name: '高分学霸', desc: '测试正确率80%以上' },
];
function unlock(id) {
  if (!state.achievements[id]) {
    state.achievements[id] = true;
    saveState();
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach) toast('🏆 解锁成就：' + ach.name + '！');
  }
}
function refreshAchievements() {
  if (getStreak() >= 3) unlock('week3');
  if (getStreak() >= 7) unlock('week7');
  if (getStreak() >= 14) unlock('week14');
  if (getStreak() >= 30) unlock('week30');
  if (state.seenVocab.length >= 50) unlock('vocab50');
  if (state.seenVocab.length >= 200) unlock('vocab200');
  if (state.quizBest >= 80) unlock('quiz80');
  if (state.listenDone.length >= 20) unlock('listen20');
  if (state.readDone.length >= 10) unlock('read10');
  if (totalChecks() > 0) unlock('first');
}

// ---------- 打卡 ----------
function getStreak() {
  let streak = 0;
  const d = new Date();
  if (!state.checks[todayStr()]) d.setDate(d.getDate() - 1);
  while (true) {
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (state.checks[key]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}
function totalChecks() { return Object.keys(state.checks).length; }

const DAILY_TASKS = [
  { id: 'vocab', icon: '🃏', text: '学习 20 个新单词', xp: 10, check: () => dailyStat().vocab >= 20 },
  { id: 'grammar', icon: '📖', text: '学习 3 个文法点', xp: 10, check: () => dailyStat().grammar >= 3 },
  { id: 'listen', icon: '🎧', text: '完成 3 道听力题', xp: 10, check: () => dailyStat().listen >= 3 },
  { id: 'read', icon: '📰', text: '读 1 篇短文', xp: 10, check: () => dailyStat().read >= 1 },
  { id: 'quiz', icon: '✍️', text: '完成今日一练 20 题', xp: 10, check: () => dailyStat().quiz >= 20 },
];
$('#markAllBtn').addEventListener('click', () => checkTask('all'));
// ---------- 每日统计 ----------
function dailyStat() {
  const t = todayStr();
  state.dailyStats = state.dailyStats || {};
  state.dailyStats[t] = state.dailyStats[t] || { vocab: 0, grammar: 0, listen: 0, read: 0, quiz: 0 };
  return state.dailyStats[t];
}
function bumpStat(key, n) {
  const s = dailyStat();
  s[key] = (s[key] || 0) + (n || 1);
  saveState();
}
function ensureDailyQuiz() {
  if (!state.dailyQuiz || state.dailyQuiz.date !== todayStr() || !state.dailyQuiz.questions || !state.dailyQuiz.questions.length || state.dailyQuiz.questions.some(q => !q.t || !q.opts)) {
    buildDailyQuiz();
  }
}
function buildDailyQuiz() {
  state.dailyQuiz = { date: todayStr(), questions: buildDailyQuestions() };
  saveState();
}
function buildDailyQuestions() {
  const moji = pickN(N2_MOJI, 7);
  const bunpo = pickN(N2_BUNPO, 5);
  const arr = pickN(N2_ARRANGE, 2).map(q => ({
    q: `（文の組み立て）${q.parts.map((p, i) => `${i + 1}．${p}`).join(' ')} を正しい順序に並べるとき、★に入るのはどれか。`,
    opts: q.parts, ans: q.ans, type: '排列', explain: q.explain,
  }));
  const psg = pickN(N2_PASSAGE_GRAMMAR, 2);
  const rdPool = [];
  N2_READING.forEach(p => p.questions.forEach(q => {
    rdPool.push({ q: p.title + '：' + q.q, opts: q.opts, ans: q.ans, type: '読解・' + p.type, explain: q.explain });
  }));
  const rd = pickN(rdPool, 2);
  const lt = pickN(N2_LISTENING, 2).map(q => ({
    q: q.q, opts: q.opts, ans: q.ans, type: '聴解・' + q.type, explain: q.tip, jp: q.jp, cn: q.cn
  }));
  return shuffle([...moji, ...bunpo, ...arr, ...psg, ...rd, ...lt]);
}

function checkTask(id) {
  if (!state.checks[todayStr()]) {
    state.checks[todayStr()] = true;
    saveState();
    unlock('first');
  }
  toast('✅ 打卡成功！+10 XP');
  renderDashboard();
}

// ---------- 仪表盘 ----------
function renderDashboard() {
  $('#heroCountdown').textContent = daysUntil();
  $('#countdown').textContent = `距考试 ${daysUntil()} 天`;
  $('#countdown').classList.toggle('warn', daysUntil() <= 30);
  $('#todayDate').textContent = fmtDate(new Date()) + ' · がんばろう！';
  $('#streakNum').textContent = getStreak();
  $('#statStreak').textContent = getStreak();
  $('#statTotalChecks').textContent = totalChecks();
  $('#statVocab').textContent = state.seenVocab.length;
  $('#statMistakes').textContent = state.wrongVocab.length + state.wrongQuiz.length;

  const today = todayStr();
  const done = !!state.checks[today];
  const list = $('#dailyChecklist');
  list.innerHTML = '';
  DAILY_TASKS.forEach(t => {
    const item = document.createElement('div');
    item.className = 'check-item' + (done ? ' done' : '');
    item.innerHTML = `<div class="check-box">${done ? '✓' : ''}</div>
      <span class="check-text">${t.icon} ${t.text}</span>
      <span class="check-xp">+${t.xp} XP</span>`;
    item.querySelector('.check-box').addEventListener('click', () => checkTask(t.id));
    list.appendChild(item);
  });
  $('#markAllBtn').disabled = done;
  $('#markAllBtn').classList.toggle('disabled', done);
  $('#markAllBtn').textContent = done ? '✅ 今天已完成！' : '✅ 全部完成（打卡）';

  const week = $('#weekCalendar');
  week.innerHTML = '';
  let weekCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (state.checks[key]) weekCount++;
    const cell = document.createElement('div');
    cell.className = 'day-cell' + (state.checks[key] ? ' done' : '') + (key === today ? ' today' : '');
    cell.innerHTML = `<div class="d">${WEEK_JP[d.getDay()]}</div><div class="n">${d.getDate()}</div>`;
    week.appendChild(cell);
  }
  $('#weekProgress').style.width = (weekCount / 7 * 100) + '%';
  $('#weekProgressText').textContent = Math.round(weekCount / 7 * 100) + '%';

  const quotes = [
    { jp: '継続は力なり。', cn: '坚持就是力量。' },
    { jp: '千里の道も一歩から。', cn: '千里之行，始于足下。' },
    { jp: '七転び八起き。', cn: '七次跌倒八次爬起（百折不挠）。' },
    { jp: '石の上にも三年。', cn: '功到自然成。' },
    { jp: 'できると思えばできる。', cn: '认为能做到就能做到。' },
    { jp: '急がば回れ。', cn: '欲速则不达。' },
    { jp: '失敗は成功のもと。', cn: '失败是成功之母。' },
    { jp: '努力は裏切らない。', cn: '努力不会辜负你。' },
  ];
  const q = quotes[new Date().getDate() % quotes.length];
  $('#dailyQuote').innerHTML = `<span class="jp">${esc(q.jp)}</span><span class="cn">${esc(q.cn)}</span>`;
}

// ---------- 单词卡 ----------
function buildVocabList() {
  vocabList = [];
  N2_VOCAB.forEach((v, i) => {
    if (vocabCat !== '全部' && v.cat !== vocabCat) return;
    if ($('#filterUnseen') && $('#filterUnseen').checked && state.seenVocab.includes(i)) return;
    if ($('#filterWrong') && $('#filterWrong').checked && !state.wrongVocab.includes(i)) return;
    vocabList.push(i);
  });
  if (!vocabList.length) vocabList = N2_VOCAB.map((_, i) => i);
  if (vocabIdx >= vocabList.length) vocabIdx = 0;
}
const VOCAB_CHIPS = [
  { label: '全部', cat: '全部' }
].concat(
  N2_VOCAB_CATS.map(c => ({ label: c.name, cat: '精选·' + c.name })),
  ['N2核心', 'N3基础', 'N4基础', 'N5基础'].map(l => ({ label: l, cat: l }))
);
function renderVocabCats() {
  const box = $('#vocabCats');
  box.innerHTML = '';
  VOCAB_CHIPS.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (c.cat === vocabCat ? ' active' : '');
    chip.textContent = c.label + (c.cat !== '全部' ? `（${N2_VOCAB.filter(v => v.cat === c.cat).length}）` : `（${N2_VOCAB.length}）`);
    chip.addEventListener('click', () => { vocabCat = c.cat; vocabIdx = 0; buildVocabList(); renderVocabCats(); showVocabCard(); });
    box.appendChild(chip);
  });
}
function renderVocab() {
  $('#vocabTotal').textContent = N2_VOCAB.length;
  $('#vocabTotal2').textContent = N2_VOCAB.length;
  $('#vocabSeen').textContent = state.seenVocab.length;
  renderVocabCats();
  buildVocabList();
  showVocabCard();
}
function showVocabCard() {
  const i = vocabList[vocabIdx];
  const v = N2_VOCAB[i];
  if (!v) return;
  $('#fcKana').textContent = v.r;
  $('#fcKanji').textContent = v.k;
  $('#fcKanjiBack').textContent = v.k;
  $('#fcKanaBack').textContent = v.r;
  $('#fcType').textContent = v.t;
  $('#fcMeaning').textContent = v.m;
  $('#fcExample').textContent = v.e + '（' + v.ec + '）';
  $('#cardInner').classList.remove('flip');
  if (!state.seenVocab.includes(i)) {
    state.seenVocab.push(i);
    bumpStat('vocab', 1);
    $('#vocabSeen').textContent = state.seenVocab.length;
    if (state.seenVocab.length === 50) unlock('vocab50');
    if (state.seenVocab.length === 200) unlock('vocab200');
  }
  speak(v.r + '。' + v.k);
}
$('#flashcard').addEventListener('click', () => $('#cardInner').classList.toggle('flip'));
$('#vocabNext').addEventListener('click', () => { vocabIdx = (vocabIdx + 1) % vocabList.length; showVocabCard(); });
$('#vocabPrev').addEventListener('click', () => { vocabIdx = (vocabIdx - 1 + vocabList.length) % vocabList.length; showVocabCard(); });
$('#vocabSpeak').addEventListener('click', () => {
  const v = N2_VOCAB[vocabList[vocabIdx]];
  if (v) speak(v.e);
});
$('#vocabKnown').addEventListener('click', () => {
  const i = vocabList[vocabIdx];
  if (!state.knownVocab.includes(i)) state.knownVocab.push(i);
  saveState();
  toast('😊 记住了！');
  $('#vocabNext').click();
});
$('#vocabAgain').addEventListener('click', () => {
  toast('🤔 没关系，多看几遍！');
  $('#vocabNext').click();
});
$('#vocabWrong').addEventListener('click', () => {
  const i = vocabList[vocabIdx];
  if (!state.wrongVocab.includes(i)) {
    state.wrongVocab.push(i);
    saveState();
    toast('📌 已加入错题本');
  } else {
    toast('已在错题本中');
  }
});
$('#filterUnseen').addEventListener('change', () => { vocabIdx = 0; buildVocabList(); showVocabCard(); });
$('#filterWrong').addEventListener('change', () => { vocabIdx = 0; buildVocabList(); showVocabCard(); });


// ---------- 汉字 ----------
function buildKanjiList() {
  if (kanjiCat === '全部') return KANJI_LIST;
  const g = parseInt(kanjiCat.replace('grade', ''), 10);
  return KANJI_LIST.filter(k => k.grade === g);
}
function renderKanjiTabs() {
  const cats = [['全部', '全部'], ['grade1', '1年'], ['grade2', '2年'], ['grade3', '3年'], ['grade4', '4年'], ['grade5', '5年'], ['grade6', '6年']];
  const box = $('#kanjiTabs');
  box.innerHTML = '';
  cats.forEach(([cat, label]) => {
    const tab = document.createElement('button');
    tab.className = 'unit-tab' + (cat === kanjiCat ? ' active' : '');
    const n = cat === '全部' ? KANJI_LIST.length : KANJI_LIST.filter(k => k.grade === +cat.replace('grade', '')).length;
    tab.textContent = label + '（' + n + '）';
    tab.addEventListener('click', () => { kanjiCat = cat; kanjiIdx = 0; renderKanji(); });
    box.appendChild(tab);
  });
}
function renderKanji() {
  $('#kanjiTotal').textContent = KANJI_LIST.length;
  renderKanjiTabs();
  kanjiList = buildKanjiList();
  if (!kanjiList.length) return;
  if (kanjiIdx >= kanjiList.length) kanjiIdx = 0;
  showKanjiCard();
  renderKanjiGrid();
}
function showKanjiCard() {
  const k = kanjiList[kanjiIdx];
  if (!k) return;
  $('#kanjiChar').textContent = k.c;
  $('#kanjiInfo').innerHTML = `<span class="k-grade">小学${k.grade}年级</span>
    <div>音読み：<span class="k-on">${esc(k.on || '—')}</span></div>
    <div>訓読み：<span class="k-kun">${esc(k.kun || '—')}</span></div>
    <div class="k-mean">${esc(k.m || '')}</div>`;
  $('#kanjiProgress').textContent = `${kanjiIdx + 1} / ${kanjiList.length}`;
  speak(k.c);
  const grid = document.querySelectorAll('#kanjiGrid .kanji-cell');
  grid.forEach(cell => cell.classList.toggle('active', cell.dataset.c === k.c));
}
function renderKanjiGrid() {
  const grid = $('#kanjiGrid');
  grid.innerHTML = '';
  kanjiList.forEach(k => {
    const cell = document.createElement('button');
    cell.className = 'kanji-cell' + (state.kanjiLearned.includes(k.c) ? ' learned' : '');
    cell.dataset.c = k.c;
    cell.textContent = k.c;
    cell.addEventListener('click', () => {
      kanjiIdx = kanjiList.indexOf(k);
      showKanjiCard();
    });
    grid.appendChild(cell);
  });
}
$('#kanjiSpeak').addEventListener('click', () => {
  const k = kanjiList[kanjiIdx];
  if (k) speak(k.c + '。' + (k.on ? k.on.split('、')[0] : '') + '、' + (k.kun ? k.kun.split('、')[0] : ''));
});
$('#kanjiNext').addEventListener('click', () => { kanjiIdx = (kanjiIdx + 1) % kanjiList.length; showKanjiCard(); });
$('#kanjiPrev').addEventListener('click', () => { kanjiIdx = (kanjiIdx - 1 + kanjiList.length) % kanjiList.length; showKanjiCard(); });
$('#kanjiRandom').addEventListener('click', () => {
  kanjiIdx = Math.floor(Math.random() * kanjiList.length);
  showKanjiCard();
});
$('#kanjiShow').addEventListener('click', (e) => {
  if (e.target.id === 'kanjiChar' || e.target.closest('#kanjiChar')) {
    const k = kanjiList[kanjiIdx];
    if (k && !state.kanjiLearned.includes(k.c)) {
      state.kanjiLearned.push(k.c);
      saveState();
      toast('✅ 已标记「' + k.c + '」为已学');
      renderKanjiGrid();
    }
  }
});


// ---------- 词表资料库 ----------
const WT_PAGE_SIZE = 100;
function posGroup(t) {
  if (!t) return '其他';
  if (t.includes('名')) return '名词';
  if (t.includes('动')) return '动词';
  if (t.includes('イ形') || t.includes('形')) return '形容词・形容动词';
  if (t.includes('副')) return '副词';
  if (t.includes('接续') || t.includes('接続')) return '接续词';
  if (t.includes('连体') || t.includes('連体')) return '连体词';
  return '其他';
}
function renderTableTabs() {
  const tabs = [
    ['wt6000', '6000 词表（' + N2_VOCAB.length + '）'],
    ['wtScene', '场景词表'],
    ['wtOno', '拟声拟态词（' + N2_ONO.length + '）'],
    ['wtLoan', '外来语（' + N2_LOAN.length + '）'],
    ['wtKanji', '汉字表（' + KANJI_LIST.length + '）'],
  ];
  const box = $('#tableTabs');
  box.innerHTML = '';
  tabs.forEach(([id, label]) => {
    const tab = document.createElement('button');
    tab.className = 'unit-tab' + (id === tableTab ? ' active' : '');
    tab.textContent = label;
    tab.addEventListener('click', () => { tableTab = id; wtPage = 0; renderTables(); });
    box.appendChild(tab);
  });
}
function renderTables() {
  renderTableTabs();
  const box = $('#tableContent');
  box.innerHTML = '';
  if (tableTab === 'wt6000') renderWt6000(box);
  else if (tableTab === 'wtScene') renderWtScene(box);
  else if (tableTab === 'wtOno') renderWtWordList(box, N2_ONO, '拟声拟态词');
  else if (tableTab === 'wtLoan') renderWtWordList(box, N2_LOAN, '外来语');
  else if (tableTab === 'wtKanji') renderWtKanji(box);
}
function wtSearchKw() {
  const el = document.getElementById('wtSearch');
  return el ? el.value.trim().toLowerCase() : '';
}
function renderWt6000(box) {
  box.innerHTML = `
    <div class="card">
      <div class="wt-controls">
        <input type="text" id="wtSearch" placeholder="🔍 搜索单词/读音/释义（如：影響 / えいきょう / 影响）">
        <select id="wtLevel">
          <option value="">全部等级</option>
          <option value="精选">精选核心</option>
          <option value="N2核心">N2核心</option>
          <option value="N3基础">N3基础</option>
          <option value="N4基础">N4基础</option>
          <option value="N5基础">N5基础</option>
        </select>
        <select id="wtPos">
          <option value="">全部词性</option>
          <option>名词</option><option>动词</option><option>形容词・形容动词</option>
          <option>副词</option><option>接续词</option><option>连体词</option><option>其他</option>
        </select>
      </div>
      <div class="wt-count" id="wtCount"></div>
      <div class="wt-scroll"><table class="wt-table">
        <thead><tr><th>单词</th><th>读音</th><th>词性</th><th>释义</th><th></th></tr></thead>
        <tbody id="wtBody"></tbody>
      </table></div>
      <div class="wt-pager" id="wtPager"></div>
    </div>`;
  const apply = () => { wtPage = 0; renderWt6000Rows(); };
  $('#wtSearch').addEventListener('input', apply);
  $('#wtLevel').addEventListener('change', apply);
  $('#wtPos').addEventListener('change', apply);
  renderWt6000Rows();
}
function renderWt6000Rows() {
  const kw = wtSearchKw();
  const lv = $('#wtLevel').value;
  const pos = $('#wtPos').value;
  let rows = N2_VOCAB.filter(v => {
    if (lv) {
      if (lv === '精选') { if (!v.cat.startsWith('精选')) return false; }
      else if (v.cat !== lv) return false;
    }
    if (pos && posGroup(v.t) !== pos) return false;
    if (kw && !((v.k + v.r + v.m).toLowerCase().includes(kw))) return false;
    return true;
  });
  $('#wtCount').textContent = `共 ${rows.length} 词`;
  const pages = Math.max(1, Math.ceil(rows.length / WT_PAGE_SIZE));
  if (wtPage >= pages) wtPage = pages - 1;
  const slice = rows.slice(wtPage * WT_PAGE_SIZE, (wtPage + 1) * WT_PAGE_SIZE);
  const body = $('#wtBody');
  body.innerHTML = '';
  slice.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="wt-k">${esc(v.k)}</td><td class="wt-r">${esc(v.r)}</td><td class="wt-t">${esc(v.t)}</td><td class="wt-m">${esc(v.m)}</td><td><button class="btn btn-outline small wt-speak" data-s="${esc(v.r)}">🔊</button></td>`;
    tr.querySelector('.wt-speak').addEventListener('click', () => speak(v.r + '。' + v.k));
    body.appendChild(tr);
  });
  const pg = $('#wtPager');
  pg.innerHTML = '';
  const prev = document.createElement('button');
  prev.className = 'btn btn-outline small';
  prev.textContent = '← 上一页';
  prev.disabled = wtPage === 0;
  prev.addEventListener('click', () => { if (wtPage > 0) { wtPage--; renderWt6000Rows(); } });
  pg.appendChild(prev);
  const info = document.createElement('span');
  info.className = 'wt-pageinfo';
  info.textContent = ` ${wtPage + 1} / ${pages} 页 `;
  pg.appendChild(info);
  const next = document.createElement('button');
  next.className = 'btn btn-outline small';
  next.textContent = '下一页 →';
  next.disabled = wtPage >= pages - 1;
  next.addEventListener('click', () => { if (wtPage < pages - 1) { wtPage++; renderWt6000Rows(); } });
  pg.appendChild(next);
}
function renderWtScene(box) {
  let si = 0;
  const chips = document.createElement('div');
  chips.className = 'unit-tabs';
  chips.innerHTML = '';
  N2_SCENE_WORDS.forEach((s, i) => {
    const c = document.createElement('button');
    c.className = 'unit-tab' + (i === si ? ' active' : '');
    c.textContent = s.scene + '（' + s.items.length + '）';
    c.addEventListener('click', () => { si = i; renderWtScene(box); });
    chips.appendChild(c);
  });
  const scene = N2_SCENE_WORDS[si];
  const list = document.createElement('div');
  list.className = 'wt-words';
  scene.items.forEach(w => {
    const d = document.createElement('div');
    d.className = 'wt-word';
    d.innerHTML = `<button class="wt-word-k" data-s="${esc(w.r)}">${esc(w.k)}</button><span class="wt-word-r">${esc(w.r)}</span><span class="wt-word-m">${esc(w.m)}</span>`;
    d.querySelector('.wt-word-k').addEventListener('click', () => speak(w.r));
    list.appendChild(d);
  });
  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.appendChild(chips);
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = '📍 ' + scene.scene + '（' + scene.items.length + ' 词）· 点击单词朗读';
  card.appendChild(title);
  card.appendChild(list);
  box.appendChild(card);
}
function renderWtWordList(box, data, name) {
  box.innerHTML = `
    <div class="card">
      <div class="wt-controls"><input type="text" id="wtSearch" placeholder="🔍 搜索「${name}」"></div>
      <div class="wt-count" id="wtCount"></div>
      <div class="wt-words" id="wtWords"></div>
    </div>`;
  const apply = () => renderWtWords(data, name);
  $('#wtSearch').addEventListener('input', apply);
  renderWtWords(data, name);
}
function renderWtWords(data, name) {
  const kw = wtSearchKw();
  const rows = data.filter(w => !kw || (w.k + w.r + w.m).toLowerCase().includes(kw));
  $('#wtCount').textContent = `共 ${rows.length} 词（高频${name}）· 点击单词朗读`;
  const box = $('#wtWords');
  box.innerHTML = '';
  rows.forEach(w => {
    const d = document.createElement('div');
    d.className = 'wt-word';
    d.innerHTML = `<button class="wt-word-k" data-s="${esc(w.r)}">${esc(w.k)}</button><span class="wt-word-r">${esc(w.r)}</span><span class="wt-word-m">${esc(w.m)}</span>`;
    d.querySelector('.wt-word-k').addEventListener('click', () => speak(w.r));
    box.appendChild(d);
  });
}
function renderWtKanji(box) {
  let grade = '全部';
  box.innerHTML = `
    <div class="card">
      <div class="wt-controls">
        <input type="text" id="wtSearch" placeholder="🔍 搜索汉字/音读/训读（如：日 / にち / ひ）">
        <select id="wtGrade">
          <option value="全部">全部年级</option><option value="1">小学1年</option><option value="2">小学2年</option>
          <option value="3">小学3年</option><option value="4">小学4年</option><option value="5">小学5年</option><option value="6">小学6年</option>
        </select>
      </div>
      <div class="wt-count" id="wtCount"></div>
      <div class="wt-scroll"><table class="wt-table wt-kanji">
        <thead><tr><th>汉字</th><th>音读</th><th>训读</th><th>年级</th><th>释义</th></tr></thead>
        <tbody id="wtBody"></tbody>
      </table></div>
    </div>`;
  const apply = () => renderWtKanjiRows(grade);
  $('#wtSearch').addEventListener('input', apply);
  $('#wtGrade').addEventListener('change', (e) => { grade = e.target.value; renderWtKanjiRows(grade); });
  renderWtKanjiRows(grade);
}
function renderWtKanjiRows(grade) {
  const kw = wtSearchKw();
  const rows = KANJI_LIST.filter(k => {
    if (grade !== '全部' && k.grade !== +grade) return false;
    if (kw && !((k.c + k.on + k.kun + k.m).toLowerCase().includes(kw))) return false;
    return true;
  });
  $('#wtCount').textContent = `共 ${rows.length} 个汉字`;
  const body = $('#wtBody');
  body.innerHTML = '';
  rows.forEach(k => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="wt-kanji-c">${esc(k.c)}</td><td>${esc(k.on)}</td><td>${esc(k.kun)}</td><td class="wt-t">小学${k.grade}年</td><td class="wt-m">${esc(k.m)}</td>`;
    body.appendChild(tr);
  });
}

// ---------- 文法 ----------
function renderGrammar() {
  $('#grammarCount').textContent = N2_GRAMMAR.reduce((s, u) => s + u.items.length, 0);
  const tabs = $('#unitTabs');
  tabs.innerHTML = '';
  N2_GRAMMAR.forEach((u, i) => {
    const tab = document.createElement('button');
    tab.className = 'unit-tab' + (i === unitIdx ? ' active' : '');
    tab.textContent = u.unit + '（' + u.items.length + '）';
    tab.addEventListener('click', () => { unitIdx = i; $('#grammarSearch').value = ''; renderGrammar(); });
    tabs.appendChild(tab);
  });
  const kw = ($('#grammarSearch').value || '').trim().toLowerCase();
  let shown = 0;
  const list = $('#grammarList');
  list.innerHTML = '';
  N2_GRAMMAR.forEach((u, ui) => {
    const filtered = kw ? u.items.filter(it => (it.g + it.m + it.f + it.ex).toLowerCase().includes(kw)) : (ui === unitIdx ? u.items : []);
    shown += filtered.length;
    if (!filtered.length) return;
    if (kw && ui !== unitIdx) {
      const head = document.createElement('div');
      head.className = 'grammar-count';
      head.textContent = '【' + u.unit + '】';
      list.appendChild(head);
    }
    filtered.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'grammar-item';
      div.innerHTML = `
        <div class="g-form">${esc(it.g)} <button class="btn btn-outline speak-btn small" data-s="${esc(it.ex)}">🔊</button></div>
        <div class="g-mean">${esc(it.m)}</div>
        <div class="g-formation"><b>接续：</b>${esc(it.f)}</div>
        <div class="g-example"><div class="jp">${esc(it.ex)}</div><div class="cn">${esc(it.exT)}</div></div>
        ${it.note ? `<div class="g-note"><b>💡 注意：</b>${esc(it.note)}</div>` : ''}`;
      div.querySelector('.speak-btn').addEventListener('click', (e) => { e.stopPropagation(); speak(it.ex); });
      div.addEventListener('dblclick', () => {
        // 双击标记已学该文法点
        const key = 'grammar:' + ui + ':' + idx;
        if (!state.achievements[key]) { state.achievements[key] = true; bumpStat('grammar', 1); toast('📖 文法点已标记学习'); }
        let n = Object.keys(state.achievements).filter(k => k.startsWith('grammar:')).length;
        if (n >= 20) unlock('grammar20');
      });
      list.appendChild(div);
    });
  });
  $('#grammarHint').textContent = kw ? `搜索到 ${shown} 个文法点` : `共 ${N2_GRAMMAR.reduce((s,u)=>s+u.items.length,0)} 个文法点，双击卡片可标记“已学”`;
}
$('#grammarSearch').addEventListener('input', renderGrammar);

// ---------- 听力 ----------
function buildListenList() {
  if (listenCat === '全部') return N2_LISTENING;
  return N2_LISTENING.filter(q => q.type === listenCat);
}
function renderListenTabs() {
  const cats = ['全部','課題理解','ポイント理解','概要理解','即時応答','統合理解'];
  const box = $('#listenTabs');
  box.innerHTML = '';
  cats.forEach(c => {
    const tab = document.createElement('button');
    tab.className = 'unit-tab' + (c === listenCat ? ' active' : '');
    const n = c === '全部' ? N2_LISTENING.length : N2_LISTENING.filter(q => q.type === c).length;
    tab.textContent = c + '（' + n + '）';
    tab.addEventListener('click', () => { listenCat = c; listenIdx = 0; renderListening(); });
    box.appendChild(tab);
  });
}
function renderListening() {
  renderListenTabs();
  const list = buildListenList();
  if (!list.length) return;
  if (listenIdx >= list.length) listenIdx = 0;
  const q = list[listenIdx];
  listenAnswered = false;
  $('#listenProgress').textContent = `${listenIdx + 1} / ${list.length} · 【${q.type}】`;
  $('#listenQuestion').textContent = 'Q. ' + q.q;
  $('#listenCn').textContent = '💬 中文提示：' + q.cn;
  $('#listenJp').style.display = 'none';
  $('#listenJp').textContent = '';
  const opts = $('#listenOptions');
  opts.innerHTML = '';
  q.opts.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.className = 'listen-opt';
    btn.textContent = String.fromCharCode(65 + i) + '. ' + o;
    btn.addEventListener('click', () => answerListen(i));
    opts.appendChild(btn);
  });
  $('#listenFeedback').textContent = '';
  const nxt = $('#listenNext');
  nxt.textContent = listenIdx === list.length - 1 ? '🔁 重新开始' : '下一题 →';
  setTimeout(() => speak(q.jp), 300);
}
$('#listenPlay').addEventListener('click', () => {
  const q = buildListenList()[listenIdx];
  if (q) speak(q.jp);
});
function answerListen(i) {
  if (listenAnswered) return;
  listenAnswered = true;
  const q = buildListenList()[listenIdx];
  const opts = $$('#listenOptions .listen-opt');
  opts.forEach((b, j) => {
    b.disabled = true;
    if (j === q.ans) b.classList.add('correct');
    else if (j === i) b.classList.add('wrong');
  });
  $('#listenJp').textContent = '📝 原文：' + q.jp;
  $('#listenJp').style.display = 'block';
  $('#listenFeedback').innerHTML = (i === q.ans ? '✅ 回答正确！' : `❌ 正确答案是 ${String.fromCharCode(65+q.ans)}。`) + `<br><span style="font-weight:400;font-size:13px">💡 ${esc(q.tip)}</span>`;
  if (!state.listenDone.includes(q.jp)) {
    state.listenDone.push(q.jp);
    bumpStat('listen', 1);
    if (state.listenDone.length >= 20) unlock('listen20');
  }
  if (i !== q.ans) {
    addWrongQuiz({ q: '【聴解・' + q.type + '】' + q.q, opts: q.opts, ans: q.ans, explain: q.tip, type: '聴解', jp: q.jp });
  }
}
$('#listenNext').addEventListener('click', () => {
  const list = buildListenList();
  listenIdx = (listenIdx + 1) % list.length;
  renderListening();
});

// ---------- 阅读 ----------
function buildReadingList() {
  if (readingCat === '全部') return N2_READING;
  return N2_READING.filter(p => p.type === readingCat);
}
function renderReadingTabs() {
  const cats = ['全部','短文','中文','長文','統合理解','情報検索'];
  const box = $('#readingTabs');
  box.innerHTML = '';
  cats.forEach(c => {
    const tab = document.createElement('button');
    tab.className = 'unit-tab' + (c === readingCat ? ' active' : '');
    const n = c === '全部' ? N2_READING.length : N2_READING.filter(p => p.type === c).length;
    tab.textContent = c + '（' + n + '）';
    tab.addEventListener('click', () => { readingCat = c; readingIdx = 0; renderReading(); });
    box.appendChild(tab);
  });
}
let readingShowCn = false;
$('#readingCnBtn').addEventListener('click', () => {
  readingShowCn = !readingShowCn;
  $('#readingCnBtn').textContent = readingShowCn ? '🌐 隐藏中文翻译' : '🌐 显示中文翻译';
  $('#readingCnHint').textContent = readingShowCn ? '已显示中文翻译' : '点击查看文章/题目中文翻译';
  renderReading();
});
function renderReading() {
  $('#readingTotal').textContent = N2_READING.length;
  $('#readingQTotal').textContent = N2_READING.reduce((s, p) => s + p.questions.length, 0);
  renderReadingTabs();
  const list = buildReadingList();
  if (!list.length) return;
  if (readingIdx >= list.length) readingIdx = 0;
  const p = list[readingIdx];
  readingAnswered = {};
  $('#readingProgress').textContent = `${readingIdx + 1} / ${list.length}`;
  const textBox = $('#readingText');
  let body = p.text ? esc(p.text) : esc(p.text1 || '');
  let bodyCn = '';
  if (readingShowCn) {
    bodyCn = p.text ? (p.text_cn || '') : (p.text1_cn || '');
    if (bodyCn) bodyCn = `<div class="rt-cn">${esc(bodyCn)}</div>`;
  }
  textBox.innerHTML = `<span class="rt-type">${esc(p.type)}</span><div class="rt-title">${esc(p.title)}</div><div>${body}</div>${bodyCn}`;
  if (!state.readDone.includes(p.title)) {
    state.readDone.push(p.title);
    bumpStat('read', 1);
    if (state.readDone.length >= 10) unlock('read10');
  }
  renderReadingQuestions();
}
function renderReadingQuestions() {
  const list = buildReadingList();
  const p = list[readingIdx];
  const box = $('#readingQuestions');
  box.innerHTML = '';
  p.questions.forEach((q, qi) => {
    const div = document.createElement('div');
    div.className = 'rt-question';
    let optsHtml = '';
    q.opts.forEach((o, oi) => {
      const cls = [];
      if (readingAnswered[qi] !== undefined) {
        if (oi === q.ans) cls.push('correct');
        else if (oi === readingAnswered[qi]) cls.push('wrong');
      }
      optsHtml += `<button class="opt ${cls.join(' ')}" data-qi="${qi}" data-oi="${oi}">${String.fromCharCode(65+oi)}. ${esc(o)}</button>`;
    });
    let fb = '';
    if (readingAnswered[qi] !== undefined) {
      fb = `<div class="q-feedback" style="color:${readingAnswered[qi] === q.ans ? 'var(--green)' : 'var(--red)'}">${readingAnswered[qi] === q.ans ? '✅ 正确！' : `❌ 正确答案：${String.fromCharCode(65+q.ans)}`} <span style="font-weight:400">${esc(q.explain)}</span></div>`;
    }
    const tBtn = q.t ? `<button class="btn btn-outline small rt-translate" data-qi="${qi}">🌐 译</button>` : '';
    div.innerHTML = `<div class="q">Q${qi+1}. ${esc(q.q)} ${tBtn}</div>${readingShowCn && q.t ? `<div class="rt-cn">${esc(q.t)}</div>` : ''}${optsHtml}${fb}`;
    div.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        if (readingAnswered[btn.dataset.qi] !== undefined) return;
        const qi2 = +btn.dataset.qi, oi2 = +btn.dataset.oi;
        readingAnswered[qi2] = oi2;
        if (oi2 !== q.ans) {
          addWrongQuiz({ q: '【読解・' + p.type + '】' + p.title + '：' + q.q, opts: q.opts, ans: q.ans, explain: q.explain, type: '読解', t: q.t });
        }
        renderReadingQuestions();
      });
    });
    const tBtn2 = div.querySelector('.rt-translate');
    if (tBtn2) {
      tBtn2.addEventListener('click', () => {
        const qi2 = +tBtn2.dataset.qi;
        const qq = p.questions[qi2];
        if (!qq || !qq.t) return;
        const cnDiv = document.createElement('div');
        cnDiv.className = 'rt-cn';
        cnDiv.textContent = qq.t;
        tBtn2.parentElement.appendChild(cnDiv);
        tBtn2.remove();
      });
    }
    box.appendChild(div);
  });
}
$('#readingPrev').addEventListener('click', () => {
  const list = buildReadingList();
  readingIdx = (readingIdx - 1 + list.length) % list.length;
  renderReading();
});
$('#readingNext').addEventListener('click', () => {
  const list = buildReadingList();
  readingIdx = (readingIdx + 1) % list.length;
  renderReading();
});

// ---------- 错题本（通用） ----------
function addWrongQuiz(item) {
  state.wrongQuiz.push(item);
  saveState();
  toast('📌 错题已加入错题本');
}
function renderMistakes() {
  const list = $('#mistakeList');
  list.innerHTML = '';
  let has = false;
  state.wrongVocab.forEach((i, pos) => {
    const v = N2_VOCAB[i];
    if (!v) return;
    has = true;
    const card = document.createElement('div');
    card.className = 'mistake-card';
    card.innerHTML = `
      <div class="mistake-q">🃏 ${esc(v.k)}（${esc(v.r)}）<button class="btn btn-outline speak-btn small" data-s="${esc(v.e)}">🔊</button></div>
      <div class="mistake-a"><b>${esc(v.m)}</b> · ${esc(v.t)}</div>
      <div class="mistake-a">例: ${esc(v.e)}</div>
      <button class="btn btn-outline small mistake-remove">🗑 移出错题本</button>`;
    card.querySelector('.speak-btn').addEventListener('click', () => speak(v.e));
    card.querySelector('.mistake-remove').addEventListener('click', () => {
      state.wrongVocab = state.wrongVocab.filter(x => x !== i);
      saveState(); renderMistakes();
    });
    list.appendChild(card);
  });
  state.wrongQuiz.forEach((item, pos) => {
    if (!item) return;
    has = true;
    const card = document.createElement('div');
    card.className = 'mistake-card';
    const isListen = item.type === '聴解';
    card.innerHTML = `
      <div class="mistake-q">✍️ ${esc(item.q)} ${isListen ? '<button class="btn btn-outline small listen-wrong">🔊 听原文</button>' : ''}</div>
      <div class="mistake-a">正确答案: <b>${String.fromCharCode(65 + item.ans)}. ${esc(item.opts[item.ans])}</b></div>
      ${item.explain ? `<div class="mistake-a">💡 ${esc(item.explain)}</div>` : ''}
      <button class="btn btn-outline small mistake-remove">🗑 移出错题本</button>`;
    if (isListen && item.jp) {
      card.querySelector('.listen-wrong').addEventListener('click', () => speak(item.jp));
    }
    card.querySelector('.mistake-remove').addEventListener('click', () => {
      state.wrongQuiz.splice(pos, 1);
      saveState(); renderMistakes();
    });
    list.appendChild(card);
  });
  if (!has) {
    list.innerHTML = '<div class="card center-card"><h3>🎉 错题本是空的！</h3><p>继续保持，全部答对！</p></div>';
  }
}

// ---------- 模拟测试 ----------
const QUIZ_MODES = [
  { id: 'daily', name: '📅 今日一练', sub: '20题 · 每天更新 · 可换一批', dur: 20, desc: '每天随机抽取 20 题（词汇/文法/排列/篇章/阅读/听力混合），完成即达成每日任务；点“换一批”可换新题。' },
  { id: 'kanji', name: '🈶 汉字读音专项', sub: '10题 · 5分钟 · 音读/训读', dur: 5, desc: '从 1006 个教育汉字中随机抽考音读与训读，巩固汉字基础。' },
  { id: 'full', name: '🚀 全真模拟', sub: '30题 · 30分钟 · 覆盖全部题型', dur: 30, desc: '混合抽题：文字词汇 10 + 文法 8 + 排列 4 + 篇章语法 3 + 阅读 5，模拟考场节奏。' },
  { id: 'moji', name: '🈶 文字・語彙专项', sub: '15题 · 15分钟', dur: 15, desc: '汉字读音・表记・语形成・文脉・近义・用法，稳拿保底分。' },
  { id: 'bunpo', name: '📖 文法专项', sub: '15题 · 15分钟', dur: 15, desc: '文法形式判断 + 句子组合 + 篇章语法。' },
  { id: 'dokkai', name: '📰 読解专项', sub: '8题 · 15分钟', dur: 15, desc: '短文・中文・長文・統合理解・情報検索，练阅读速度。' },
  { id: 'chokai', name: '🎧 聴解专项', sub: '10题 · 10分钟', dur: 10, desc: '课题理解・ポイント・概要・即时应答・統合理解，含朗读。' },
];
function buildKanjiQuizQuestions(n) {
  const pool = KANJI_LIST.filter(k => k.on && k.kun);
  const picked = pickN(pool, n);
  return picked.map(k => {
    const useOn = Math.random() < 0.6;
    const onArr = k.on.split('、').filter(Boolean);
    const kunArr = k.kun.split('、').filter(Boolean);
    const correct = (useOn ? onArr[0] : kunArr[0]) || '';
    if (!correct) return null;
    const sameGrade = KANJI_LIST.filter(x => x.grade === k.grade && x.c !== k.c);
    const distract = [];
    while (distract.length < 3 && sameGrade.length) {
      const idx = Math.floor(Math.random() * sameGrade.length);
      const cand = sameGrade.splice(idx, 1)[0];
      const arr = useOn ? (cand.on || '').split('、').filter(Boolean) : (cand.kun || '').split('、').filter(Boolean);
      const val = arr[0];
      if (val && !distract.includes(val) && val !== correct) distract.push(val);
    }
    if (distract.length < 3) return null;
    const opts = shuffle([correct, ...distract]);
    return {
      q: `「${k.c}」の${useOn ? '音読み' : '訓読み'}はどれか。`,
      opts, ans: opts.indexOf(correct), type: '漢字',
      explain: `${k.c}：音読み「${k.on}」・訓読み「${k.kun}」`
    };
  }).filter(Boolean);
}
function buildQuizQuestions(mode) {
  if (mode === 'daily') {
    ensureDailyQuiz();
    return (state.dailyQuiz.questions || []).map(q => ({ ...q }));
  }
  if (mode === 'kanji') return buildKanjiQuizQuestions(10);
  if (mode === 'moji') return pickN(N2_MOJI, 15).map(q => ({ ...q }));
  if (mode === 'bunpo') {
    const a = pickN(N2_BUNPO, 8).map(q => ({ ...q }));
    const b = pickN(N2_ARRANGE, 4).map(q => ({
      q: `（文の組み立て）${q.parts.map((p, i) => `${i+1}．${p}`).join(' ')} を正しい順序に並べるとき、★に入るのはどれか。\n${q.template.replace('★','★')}`,
      opts: q.parts,
      ans: q.ans,
      type: '排列',
      explain: q.explain,
    }));
    const c = pickN(N2_PASSAGE_GRAMMAR, 3).map(q => ({ ...q }));
    return shuffle([...a, ...b, ...c]);
  }
  if (mode === 'dokkai') {
    const pool = [];
    N2_READING.forEach(p => p.questions.forEach(q => {
      pool.push({ q: p.title + '：' + q.q, opts: q.opts, ans: q.ans, type: '読解・' + p.type, explain: q.explain });
    }));
    return pickN(pool, 8);
  }
  if (mode === 'chokai') {
    return pickN(N2_LISTENING, 10).map(q => ({
      q: q.q,
      opts: q.opts, ans: q.ans, type: '聴解・' + q.type, explain: q.tip, jp: q.jp, cn: q.cn
    }));
  }
  // full
  const moji = pickN(N2_MOJI, 10);
  const bunpo = pickN(N2_BUNPO, 8);
  const arr = pickN(N2_ARRANGE, 4).map(q => ({
    q: `（文の組み立て）${q.parts.map((p, i) => `${i+1}．${p}`).join(' ')} を正しい順序に並べるとき、★に入るのはどれか。`,
    opts: q.parts, ans: q.ans, type: '排列', explain: q.explain,
  }));
  const psg = pickN(N2_PASSAGE_GRAMMAR, 3);
  const rdPool = [];
  N2_READING.forEach(p => p.questions.forEach(q => {
    rdPool.push({ q: p.title + '：' + q.q, opts: q.opts, ans: q.ans, type: '読解・' + p.type, explain: q.explain });
  }));
  const rd = pickN(rdPool, 5);
  return shuffle([...moji, ...bunpo, ...arr, ...psg, ...rd]);
}
function renderQuiz() {
  $('#quizHome').style.display = '';
  $('#quizRunning').style.display = 'none';
  $('#quizResult').style.display = 'none';
  const box = $('#quizModes');
  box.innerHTML = '';
  QUIZ_MODES.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'quiz-mode-btn' + (m.id === quizMode ? ' active' : '');
    btn.innerHTML = `${m.name}<span class="qm-sub">${m.sub}</span>`;
    btn.addEventListener('click', () => {
      quizMode = m.id;
      document.querySelectorAll('.quiz-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#quizModeDesc').textContent = m.desc;
    });
    box.appendChild(btn);
  });
  const m = QUIZ_MODES.find(x => x.id === quizMode);
  $('#quizModeDesc').textContent = m.desc;
  // 换一批按钮（每日一练）
  const homeCard = $('#quizHome .center-card');
  let btn = $('#reshuffleBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'reshuffleBtn';
    btn.className = 'btn btn-amber btn-big';
    btn.style.marginTop = '10px';
    btn.style.display = 'none';
    btn.addEventListener('click', () => {
      buildDailyQuiz();
      toast('🔄 已换一批新题！');
    });
    homeCard.appendChild(btn);
  }
  btn.style.display = quizMode === 'daily' ? '' : 'none';
  btn.textContent = '🔄 换一批（今日题目）';
}
$('#quizStart').addEventListener('click', () => {
  const m = QUIZ_MODES.find(x => x.id === quizMode);
  quizQuestions = buildQuizQuestions(quizMode);
  if (!quizQuestions.length) return;
  quizIdx = 0;
  quizAnswers = new Array(quizQuestions.length).fill(-1);
  quizRevealed = new Array(quizQuestions.length).fill(false);
  quizDuration = m.dur * 60;
  quizSeconds = 0;
  $('#quizHome').style.display = 'none';
  $('#quizResult').style.display = 'none';
  $('#quizRunning').style.display = '';
  startQuizTimer();
  showQuizQuestion();
});
function startQuizTimer() {
  clearInterval(quizTimer);
  quizTimer = setInterval(() => {
    quizSeconds++;
    const remain = Math.max(0, quizDuration - quizSeconds);
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
    $('#quizTimer').textContent = '⏱ ' + mm + ':' + ss;
    if (remain <= 0) { clearInterval(quizTimer); submitQuiz(); }
  }, 1000);
}
function showQuizQuestion() {
  const q = quizQuestions[quizIdx];
  $('#quizCountDisplay').textContent = `${quizIdx + 1} / ${quizQuestions.length}`;
  const box = $('#quizQuestion');
  let extra = '';
  if ((q.type === '聴解' || q.type.startsWith('聴解')) && q.jp) {
    extra = `<div style="margin:10px 0"><button class="btn btn-blue small" id="quizListenBtn">🔊 播放录音</button> ${q.cn ? `<span style="font-size:12px;color:var(--text-light)">${esc(q.cn)}</span>` : ''}</div>`;
  }
  const transText = q.t || q.cn || '';
  box.innerHTML = `<span class="q-type">${esc(q.type)}</span><br>${esc(q.q)} ${transText ? '<button class="btn btn-outline small" id="quizTransBtn">🌐 译</button>' : ''}<div id="quizTransBox" style="display:none;margin-top:8px;padding:10px;border-radius:10px;background:var(--accent-light);font-size:13px"></div>${extra}`;
  const transBtn = $('#quizTransBtn');
  if (transBtn) {
    transBtn.addEventListener('click', () => {
      const tb = $('#quizTransBox');
      tb.style.display = tb.style.display === 'none' ? 'block' : 'none';
      if (tb.style.display === 'block') tb.textContent = '🌐 ' + transText;
    });
  }
  if (q.jp) {
    const b = $('#quizListenBtn');
    if (b) b.addEventListener('click', () => speak(q.jp));
    setTimeout(() => speak(q.jp), 400);
  }
  const opts = $('#quizOptions');
  opts.innerHTML = '';
  q.opts.forEach((o, i) => {
    const btn = document.createElement('button');
    const selected = quizAnswers[quizIdx] === i;
    btn.className = 'quiz-opt' + (selected ? ' selected' : '') + (quizRevealed[quizIdx] && i === q.ans ? ' correct' : '') + (quizRevealed[quizIdx] && selected && i !== q.ans ? ' wrong' : '');
    btn.textContent = String.fromCharCode(65 + i) + '. ' + o;
    btn.disabled = quizRevealed[quizIdx];
    btn.addEventListener('click', () => {
      if (quizRevealed[quizIdx]) return;
      quizAnswers[quizIdx] = i;
      showQuizQuestion();
    });
    opts.appendChild(btn);
  });
  let revealBox = $('#quizRevealBox');
  if (!revealBox) {
    revealBox = document.createElement('div');
    revealBox.id = 'quizRevealBox';
    revealBox.style.cssText = 'margin-top:14px;padding:12px;border-radius:10px;background:var(--green-light);font-size:13px;display:none';
    opts.parentElement.appendChild(revealBox);
  }
  if (quizRevealed[quizIdx]) {
    revealBox.style.display = 'block';
    revealBox.innerHTML = `✅ 正确答案：<b>${String.fromCharCode(65 + q.ans)}. ${esc(q.opts[q.ans])}</b>${q.explain ? `<br>💡 ${esc(q.explain)}` : ''}${q.jp ? `<br>🔊 原文：${esc(q.jp)}` : ''}`;
  } else {
    revealBox.style.display = 'none';
  }
  const revealBtn = $('#quizRevealBtn');
  if (revealBtn) revealBtn.style.display = quizRevealed[quizIdx] ? 'none' : '';

  const prev = $('#quizPrev'), next = $('#quizNext'), submit = $('#quizSubmit');
  let revBtn = $('#quizRevealBtn');
  if (!revBtn) {
    revBtn = document.createElement('button');
    revBtn.id = 'quizRevealBtn';
    revBtn.className = 'btn btn-outline';
    revBtn.textContent = '👁 查看本题答案';
    document.querySelector('.quiz-nav').insertBefore(revBtn, submit);
    revBtn.addEventListener('click', revealCurrentAnswer);
  }
  revBtn.style.display = 'block';
  prev.disabled = quizIdx === 0;
  prev.classList.toggle('disabled', quizIdx === 0);
  next.style.display = quizIdx === quizQuestions.length - 1 ? 'none' : '';
  submit.style.display = quizIdx === quizQuestions.length - 1 ? '' : 'none';
  if (quizIdx < quizQuestions.length - 1) {
    next.textContent = quizAnswers[quizIdx] >= 0 ? '下一题 →' : '跳过 →';
  }
}
$('#quizPrev').addEventListener('click', () => { if (quizIdx > 0) { quizIdx--; showQuizQuestion(); } });
$('#quizNext').addEventListener('click', () => { if (quizIdx < quizQuestions.length - 1) { quizIdx++; showQuizQuestion(); } });
$('#quizSubmit').addEventListener('click', submitQuiz);
function revealCurrentAnswer() {
  if (quizRevealed[quizIdx]) return;
  quizRevealed[quizIdx] = true;
  if (quizAnswers[quizIdx] === -1) quizAnswers[quizIdx] = -99;
  showQuizQuestion();
  toast('👁 已显示本题答案');
}
function submitQuiz() {
  clearInterval(quizTimer);
  const total = quizQuestions.length;
  let correct = 0;
  const wrongList = [];
  const byType = {};
  quizQuestions.forEach((q, i) => {
    const ok = quizAnswers[i] === q.ans;
    if (ok) correct++;
    else if (quizAnswers[i] !== -1 || false) {}
    byType[q.type] = byType[q.type] || { c: 0, t: 0 };
    byType[q.type].t++;
    if (ok) byType[q.type].c++;
    if (quizAnswers[i] !== q.ans) {
      wrongList.push({ item: q, your: quizAnswers[i] });
      addWrongQuiz({ q: '【' + q.type + '】' + q.q.replace(/^【[^】]+】/, ''), opts: q.opts, ans: q.ans, explain: q.explain || '', type: q.type });
    }
  });
  const pct = Math.round(correct / total * 100);
  bumpStat('quiz', total);
  if (!state.quizBest || pct > state.quizBest) state.quizBest = pct;
  state.quizHistory.push({ date: todayStr(), score: pct, total, correct });
  saveState();
  unlock('quiz1');
  if (pct >= 80) unlock('quiz80');
  $('#quizRunning').style.display = 'none';
  $('#quizResult').style.display = '';
  $('#resultScore').textContent = correct + ' / ' + total + '（' + pct + '%）';
  $('#resultMsg').textContent = pct >= 90 ? '🏆 太棒了！继续保持！' : pct >= 80 ? '🌟 优秀！离满分不远了！' : pct >= 60 ? '💪 不错，再巩固一下错题！' : pct >= 40 ? '📚 继续加油，重点复习错题！' : '🔥 别灰心，把错题本过一遍！';
  const bd = $('#resultBreakdown');
  bd.innerHTML = '';
  Object.keys(byType).forEach(k => {
    const v = byType[k];
    bd.innerHTML += `<div class="rd-box"><div class="rd-num">${v.c}/${v.t}</div><div class="rd-label">${esc(k)}</div></div>`;
  });
  const rv = $('#resultWrongList');
  rv.innerHTML = '';
  rv.innerHTML = `<h4>📋 全部题目答案与解析（${quizQuestions.length} 题）</h4>
    <p style="font-size:12px;color:var(--text-light);margin-bottom:8px">✅ 绿色为正确，❌ 红色为答错/未答，点亮的题目为已查看答案。</p>`;
  quizQuestions.forEach((q, i) => {
    const your = quizAnswers[i];
    const ok = your === q.ans;
    const d = document.createElement('div');
    d.className = 'rv-item';
    d.style.cssText = 'border-left:4px solid ' + (ok ? 'var(--green)' : 'var(--red)');
    const yourTxt = your === -99 ? '（已查看答案）' : (your >= 0 ? String.fromCharCode(65 + your) + '. ' + esc(q.opts[your]) : '未作答');
    d.innerHTML = `<div style="margin-bottom:4px">${ok ? '✅' : '❌'} <b>[${esc(q.type)}]</b> ${esc(q.q)}</div>
      <div>你的答案: ${yourTxt}</div>
      <div>正确答案: <b style="color:var(--green)">${String.fromCharCode(65 + q.ans)}. ${esc(q.opts[q.ans])}</b></div>
      ${q.explain ? `<div style="color:var(--text-light)">💡 ${esc(q.explain)}</div>` : ''}
      ${q.jp ? `<div style="color:var(--text-light)">🔊 原文：${esc(q.jp)}</div>` : ''}`;
    rv.appendChild(d);
  });
  toast('📊 成绩已保存');
}
$('#quizRetry').addEventListener('click', () => {
  $('#quizResult').style.display = 'none';
  $('#quizHome').style.display = '';
  renderQuiz();
});

// ---------- 成就 ----------
function renderStats() {
  refreshAchievements();
  const grid = $('#achievements');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const d = document.createElement('div');
    d.className = 'ach' + (state.achievements[a.id] ? ' earned' : '');
    d.innerHTML = `<div class="a-emoji">${a.emoji}</div><div class="a-name">${a.name}</div><div class="a-desc">${state.achievements[a.id] ? '✓ ' + a.desc : a.desc}</div>`;
    grid.appendChild(d);
  });
  const cal = $('#monthCalendar');
  cal.innerHTML = '';
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const title = document.createElement('div');
  title.className = 'month-title';
  title.textContent = `${year}年${month + 1}月`;
  cal.appendChild(title);
  const grid2 = document.createElement('div');
  grid2.className = 'month-grid';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const b = document.createElement('div');
    b.className = 'mc-day blank';
    grid2.appendChild(b);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'mc-day' + (state.checks[key] ? ' done' : '') + (key === todayStr() ? ' today' : '');
    cell.textContent = d;
    grid2.appendChild(cell);
  }
  cal.appendChild(grid2);
}

// ---------- 考试情报 ----------
function renderExam() {
  // 动态：把考试日期倒计时更新到标题
  const head = document.querySelector('#view-exam .sub');
  if (head) head.textContent = `JLPT 日本語能力試験 N2 · 距考试还有 ${daysUntil()} 天`;
}

// ---------- 冲刺计划 ----------
const PLAN_PHASES = [
  { period: '第1～4周（8/17～9/13）', title: '阶段一：基础全覆盖', items: ['每天 30 个新单词 + 复习旧词，先过一遍全部 N2 核心词汇', '按单元学完 N2 文法（每周 2 个单元，共 10 单元）', '每周末做 1 次文法+词汇综合小测', '开始养成每天打卡习惯'], goal: '目标：词汇过完 1 遍（633词），文法全部过 1 遍' },
  { period: '第5～8周（9/14～10/11）', title: '阶段二：专项强化', items: ['词汇第二轮：重点攻克读音易错、意思相近的词', '文法第二轮：做文法专项练习（形式判断/排列/篇章）', '阅读专项：每天 1 篇，从短文到中文、长文', '听力专项：每天 15 分钟，按题型逐个突破'], goal: '目标：词汇过 2 遍，阅读听力正确率 60%+' },
  { period: '第9～12周（10/12～11/8）', title: '阶段三：真题实战', items: ['每周 1～2 套全真模拟（严格计时 105 分钟）', '错题本全面整理，错题重做 3 遍', '针对薄弱题型（如統合理解、即時応答）集中突破', '报名确认：准考证、考点信息核对'], goal: '目标：模拟正确率 70%+，稳住 90 分线' },
  { period: '第13～16周（11/9～12/6）', title: '阶段四：考前冲刺', items: ['每周 2 套模拟保持手感，严格模拟考场时间', '词汇最后冲刺：只复习错题本和高频词', '文法只看错题 + 高频句型，不再学新内容', '考前一周：调整作息，早睡早起，清淡饮食', '12月6日：自信上场！'], goal: '目标：保持状态，稳稳拿下 N2！' },
];
function renderPlan() {
  const box = $('#planTimeline');
  box.innerHTML = '';
  PLAN_PHASES.forEach(p => {
    const div = document.createElement('div');
    div.className = 'plan-phase';
    div.innerHTML = `<div class="pp-period">${esc(p.period)}</div><div class="pp-title">${esc(p.title)}</div><ul>${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><div class="pp-goal">${esc(p.goal)}</div>`;
    box.appendChild(div);
  });
}

// ---------- 初始化 ----------
function init() {
  ensureDailyQuiz();
  refreshAchievements();
  renderDashboard();
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  // 预生成词表
  buildVocabList();
}
init();
