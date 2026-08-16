// ===== N2 冲刺营 主逻辑 =====

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const storage = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch(e){ return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

// ---------- 考试日期 ----------
const EXAM_DATE = new Date(2026, 10, 1); // 2026年11月1日(12月考试一般在12月初,设为12月6日)
EXAM_DATE.setMonth(10); // 11月
EXAM_DATE.setDate(1);
// N2 2026年12月考试日期未公布,默认设为11月1日可改;这里用 2026-12-06 更接近实际(12月第一个周日)
EXAM_DATE.setMonth(11); EXAM_DATE.setDate(6);

function daysUntil() {
  const now = new Date();
  const diff = EXAM_DATE - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------- 状态 ----------
let state = storage.get('n2state', {
  checks: {},          // 'YYYY-MM-DD': true
  seenVocab: [],       // 已学习的单词索引
  knownVocab: [],      // 已会的单词索引
  wrongVocab: [],      // 错题本单词索引
  wrongQuiz: [],       // 错题(测试题)索引
  achievements: {},    // 成就id: true
  vocabOrder: [],      // 单词学习顺序(打乱)
  quizBest: null,      // 测试最好成绩
  quizHistory: [],
});
let vocabIdx = 0;
let unitIdx = 0;
let listenIdx = 0;
let readingIdx = 0;
let quizIdx = 0;
let quizAnswers = [];
let quizTimer = null;
let quizSeconds = 0;
let currentView = 'dashboard';

// ---------- 保存 ----------
function saveState() { storage.set('n2state', state); }

// ---------- 日期工具 ----------
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(d) {
  return `${d.getMonth()+1}月${d.getDate()}日（${['日','月','火','水','木','金','土'][d.getDay()]}）`;
}

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
  if (view === 'grammar') renderGrammar();
  if (view === 'listening') renderListening();
  if (view === 'reading') renderReading();
  if (view === 'quiz') renderQuiz();
  if (view === 'mistakes') renderMistakes();
  if (view === 'stats') renderStats();
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
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  // 优先选择日语语音
  const voices = window.speechSynthesis.getVoices();
  const jp = voices.find(v => v.lang === 'ja-JP') || voices.find(v => v.lang.startsWith('ja'));
  if (jp) u.voice = jp;
  window.speechSynthesis.speak(u);
}

// ---------- 成就 ----------
function unlock(id) {
  if (!state.achievements[id]) {
    state.achievements[id] = true;
    saveState();
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach) toast('🏆 解锁成就：' + ach.name + '！');
  }
}
const ACHIEVEMENTS = [
  { id: 'first', emoji: '🌱', name: '初出茅庐', desc: '完成第一天打卡' },
  { id: 'week3', emoji: '🔥', name: '三日之约', desc: '连续打卡3天' },
  { id: 'week7', emoji: '⚡', name: '七日小成', desc: '连续打卡7天' },
  { id: 'week14', emoji: '💪', name: '半月坚持', desc: '连续打卡14天' },
  { id: 'week30', emoji: '🏆', name: '月满功成', desc: '连续打卡30天' },
  { id: 'vocab50', emoji: '📚', name: '词汇小达人', desc: '学过50个单词' },
  { id: 'quiz1', emoji: '🎯', name: '首战告捷', desc: '完成第一次模拟测试' },
  { id: 'quiz80', emoji: '🌟', name: '高分学霸', desc: '测试正确率80%以上' },
];

// ---------- 打卡 ----------
function getStreak() {
  let streak = 0;
  const d = new Date();
  // 如果今天还没打卡,从昨天开始算
  if (!state.checks[todayStr()]) d.setDate(d.getDate() - 1);
  while (true) {
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (state.checks[key]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}
function totalChecks() { return Object.keys(state.checks).length; }

// ---------- 每日任务 ----------
const DAILY_TASKS = [
  { id: 'vocab', icon: '🃏', text: '学习 10 个新单词', xp: 10, check: () => state.seenVocab.length > 0 },
  { id: 'grammar', icon: '📖', text: '学习 2 个文法点', xp: 10, check: () => true },
  { id: 'listen', icon: '🎧', text: '完成 3 道听力题', xp: 10, check: () => true },
  { id: 'read', icon: '📰', text: '读 1 篇短文', xp: 10, check: () => true },
  { id: 'quiz', icon: '✍️', text: '做 5 道模拟题', xp: 10, check: () => true },
];
function checkTask(id) {
  if (!state.checks[todayStr()]) {
    state.checks[todayStr()] = true;
    saveState();
    unlock('first');
  }
  // 简化:今日打卡即视为完成今日任务
  toast('✅ 打卡成功！+10 XP');
  renderDashboard();
}

// ---------- 仪表盘 ----------
function renderDashboard() {
  $('#heroCountdown').textContent = daysUntil();
  $('#countdown').textContent = `距考试 ${daysUntil()} 天`;
  $('#todayDate').textContent = fmtDate(new Date()) + ' · がんばろう！';
  $('#streakNum').textContent = getStreak();
  $('#statStreak').textContent = getStreak();
  $('#statTotalChecks').textContent = totalChecks();
  $('#statVocab').textContent = state.seenVocab.length;
  $('#statMistakes').textContent = state.wrongVocab.length + state.wrongQuiz.length;

  // 任务清单
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

  // 周历
  const week = $('#weekCalendar');
  week.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + i); // 本周日~六
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const cell = document.createElement('div');
    cell.className = 'day-cell' + (state.checks[key] ? ' done' : '') + (key === todayStr() ? ' today' : '');
    cell.innerHTML = `<div class="d">${['日','月','火','水','木','金','土'][d.getDay()]}</div><div class="n">${d.getDate()}</div>`;
    week.appendChild(cell);
  }

  // 每周进度
  const weekCount = [0,1,2,3,4,5,6].filter(i => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return state.checks[key];
  }).length;
  $('#weekProgress').style.width = (weekCount / 7 * 100) + '%';
  $('#weekProgressText').textContent = Math.round(weekCount / 7 * 100) + '%';

  // 每日一句
  const quotes = [
    { jp: '継続は力なり。', cn: '坚持就是力量。' },
    { jp: '千里の道も一歩から。', cn: '千里之行，始于足下。' },
    { jp: '七転び八起き。', cn: '七次跌倒八次爬起（百折不挠）。' },
    { jp: '石の上にも三年。', cn: '功到自然成。' },
    { jp: 'できると思えばできる。', cn: '认为能做到就能做到。' },
  ];
  const q = quotes[new Date().getDate() % quotes.length];
  $('#dailyQuote').innerHTML = `<span class="jp">${q.jp}</span><span class="cn">${q.cn}</span>`;
}

// ---------- 单词卡 ----------
function initVocabOrder() {
  if (!state.vocabOrder.length) {
    state.vocabOrder = N2_VOCAB.map((_, i) => i);
    // 洗牌
    for (let i = state.vocabOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.vocabOrder[i], state.vocabOrder[j]] = [state.vocabOrder[j], state.vocabOrder[i]];
    }
    saveState();
  }
}
function currentVocabIndex() { return state.vocabOrder[vocabIdx]; }
function renderVocab() {
  initVocabOrder();
  $('#vocabTotal').textContent = N2_VOCAB.length;
  $('#vocabTotal2').textContent = N2_VOCAB.length;
  $('#vocabSeen').textContent = state.seenVocab.length;
  showVocabCard();
}
function showVocabCard() {
  const i = currentVocabIndex();
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
  // 标记已学
  if (!state.seenVocab.includes(i)) {
    state.seenVocab.push(i);
    saveState();
    $('#vocabSeen').textContent = state.seenVocab.length;
  }
  speak(v.r + '。' + v.k);
}
$('#flashcard').addEventListener('click', () => $('#cardInner').classList.toggle('flip'));
$('#vocabNext').addEventListener('click', () => { vocabIdx = (vocabIdx + 1) % state.vocabOrder.length; showVocabCard(); });
$('#vocabPrev').addEventListener('click', () => { vocabIdx = (vocabIdx - 1 + state.vocabOrder.length) % state.vocabOrder.length; showVocabCard(); });
$('#vocabKnown').addEventListener('click', () => {
  const i = currentVocabIndex();
  if (!state.knownVocab.includes(i)) state.knownVocab.push(i);
  saveState();
  toast('😊 记住了！');
  $('#vocabNext').click();
});
$('#vocabAgain').addEventListener('click', () => {
  toast('🤔 没关系，多看几次就会了！');
  $('#vocabNext').click();
});
$('#vocabSpeak').addEventListener('click', () => {
  const v = N2_VOCAB[currentVocabIndex()];
  speak(v.e);
});
$('#vocabWrong').addEventListener('click', () => {
  const i = currentVocabIndex();
  if (!state.wrongVocab.includes(i)) state.wrongVocab.push(i);
  saveState();
  toast('📌 已加入错题本');
});

// ---------- 文法 ----------
function renderGrammar() {
  const tabs = $('#unitTabs');
  tabs.innerHTML = '';
  N2_GRAMMAR.forEach((u, i) => {
    const b = document.createElement('button');
    b.className = 'unit-tab' + (i === unitIdx ? ' active' : '');
    b.textContent = u.unit;
    b.addEventListener('click', () => { unitIdx = i; renderGrammar(); });
    tabs.appendChild(b);
  });
  const list = $('#grammarList');
  list.innerHTML = '';
  N2_GRAMMAR[unitIdx].items.forEach(g => {
    const item = document.createElement('div');
    item.className = 'grammar-item';
    item.innerHTML = `
      <div class="g-grammar">${g.g} <button class="btn btn-outline speak-btn" style="padding:2px 8px;font-size:12px">🔊</button></div>
      <div class="g-meaning">${g.m}</div>
      <div class="g-formula">${g.f}</div>
      <div class="g-example">${g.ex}</div>
      <div class="g-example-trans">${g.exT}</div>
      <div class="g-note">💡 ${g.note}</div>`;
    item.querySelector('.speak-btn').addEventListener('click', () => speak(g.ex));
    list.appendChild(item);
  });
}

// ---------- 听力 ----------
function renderListening() {
  showListening();
}
function showListening() {
  const item = N2_LISTENING[listenIdx];
  $('#listenOptions').innerHTML = '';
  $('#listenFeedback').textContent = '';
  $('#listenFeedback').className = 'listen-feedback';
  item.opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'listen-opt';
    b.textContent = `${String.fromCharCode(65 + i)}. ${o}`;
    b.addEventListener('click', () => {
      const fb = $('#listenFeedback');
      if (i === item.ans) {
        fb.textContent = '✅ 正解！' + item.cn;
        fb.className = 'listen-feedback correct';
        b.classList.add('selected');
        $$('.listen-opt').forEach(x => x.disabled = true);
      } else {
        fb.textContent = '❌ 再听一遍试试';
        fb.className = 'listen-feedback wrong';
        b.classList.add('selected');
      }
    });
    $('#listenOptions').appendChild(b);
  });
}
$('#listenPlay').addEventListener('click', () => {
  const item = N2_LISTENING[listenIdx];
  speak(item.jp);
  $('#listenFeedback').textContent = '🔊 听完了吗？选出你听到的内容';
  $('#listenFeedback').className = 'listen-feedback';
});
$('#listenNext').addEventListener('click', () => {
  listenIdx = (listenIdx + 1) % N2_LISTENING.length;
  showListening();
  speak(N2_LISTENING[listenIdx].jp);
});

// ---------- 阅读 ----------
function renderReading() {
  showReading();
}
function showReading() {
  const item = N2_READING[readingIdx];
  $('#readingText').innerHTML = `<h4>📰 ${item.title}</h4><p>${item.text}</p>`;
  const qs = $('#readingQuestions');
  qs.innerHTML = '';
  item.qs.forEach((q, qi) => {
    const box = document.createElement('div');
    box.className = 'rq-item';
    box.innerHTML = `<div class="rq-q">Q${qi + 1}. ${q.q}</div>`;
    q.opts.forEach((o, oi) => {
      const b = document.createElement('button');
      b.className = 'rq-opt';
      b.textContent = `${String.fromCharCode(65 + oi)}. ${o}`;
      b.addEventListener('click', () => {
        const opts = box.querySelectorAll('.rq-opt');
        opts.forEach(x => x.disabled = true);
        if (oi === q.ans) {
          b.classList.add('correct');
          toast('✅ 正解！');
        } else {
          b.classList.add('wrong');
          opts[q.ans].classList.add('correct');
          toast('❌ 正确答案是 ' + String.fromCharCode(65 + q.ans));
        }
      });
      box.appendChild(b);
    });
    qs.appendChild(box);
  });
  $('#readingProgress').textContent = `${readingIdx + 1} / ${N2_READING.length}`;
}
$('#readingPrev').addEventListener('click', () => { readingIdx = (readingIdx - 1 + N2_READING.length) % N2_READING.length; showReading(); });
$('#readingNext').addEventListener('click', () => { readingIdx = (readingIdx + 1) % N2_READING.length; showReading(); });

// ---------- 模拟测试 ----------
function renderQuiz() {
  $('#quizCount').textContent = N2_QUIZ.length;
  if (state.quizBest) {
    $('#quizHome .center-card p').innerHTML = `共 <strong>${N2_QUIZ.length}</strong> 题<br>最佳成绩: <strong>${state.quizBest}%</strong><br>再挑战一次吧！`;
  }
}
function startQuiz() {
  quizIdx = 0;
  quizAnswers = N2_QUIZ.map(() => -1);
  quizSeconds = 0;
  $('#quizHome').style.display = 'none';
  $('#quizResult').style.display = 'none';
  $('#quizRunning').style.display = '';
  clearInterval(quizTimer);
  quizTimer = setInterval(() => {
    quizSeconds++;
    const m = String(Math.floor(quizSeconds / 60)).padStart(2, '0');
    const s = String(quizSeconds % 60).padStart(2, '0');
    $('#quizTimer').textContent = `⏱ ${m}:${s}`;
  }, 1000);
  showQuizQuestion();
}
function showQuizQuestion() {
  const item = N2_QUIZ[quizIdx];
  $('#quizCountDisplay').textContent = `${quizIdx + 1} / ${N2_QUIZ.length}`;
  $('#quizQuestion').textContent = `【${item.type}】${item.q}`;
  const opts = $('#quizOptions');
  opts.innerHTML = '';
  item.opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'quiz-opt' + (quizAnswers[quizIdx] === i ? ' selected' : '');
    b.textContent = `${String.fromCharCode(65 + i)}. ${o}`;
    b.addEventListener('click', () => {
      quizAnswers[quizIdx] = i;
      showQuizQuestion();
    });
    opts.appendChild(b);
  });
  $('#quizPrev').style.visibility = quizIdx === 0 ? 'hidden' : 'visible';
  $('#quizNext').style.display = quizIdx === N2_QUIZ.length - 1 ? 'none' : '';
  $('#quizSubmit').style.display = quizIdx === N2_QUIZ.length - 1 ? '' : 'none';
}
$('#quizStart').addEventListener('click', startQuiz);
$('#quizNext').addEventListener('click', () => { if (quizIdx < N2_QUIZ.length - 1) { quizIdx++; showQuizQuestion(); } });
$('#quizPrev').addEventListener('click', () => { if (quizIdx > 0) { quizIdx--; showQuizQuestion(); } });
$('#quizSubmit').addEventListener('click', submitQuiz);
function submitQuiz() {
  clearInterval(quizTimer);
  let correct = 0;
  const wrongList = [];
  N2_QUIZ.forEach((item, i) => {
    if (quizAnswers[i] === item.ans) correct++;
    else wrongList.push({ idx: i, item, your: quizAnswers[i] });
  });
  const pct = Math.round(correct / N2_QUIZ.length * 100);
  $('#quizRunning').style.display = 'none';
  $('#quizResult').style.display = '';
  $('#resultScore').textContent = pct + '%';
  $('#resultBreakdown').textContent = `答对 ${correct} / ${N2_QUIZ.length} 题 · 用时 ${Math.floor(quizSeconds/60)}分${quizSeconds%60}秒`;
  const msg = pct >= 80 ? '🌟 太棒了！N2 稳了！' : pct >= 60 ? '👍 不错！继续加油！' : '💪 别灰心，把错题复习一遍！';
  $('#resultMsg').textContent = msg;
  // 错题入库
  wrongList.forEach(w => {
    if (!state.wrongQuiz.includes(w.idx)) state.wrongQuiz.push(w.idx);
  });
  // 更新最好成绩
  if (!state.quizBest || pct > state.quizBest) state.quizBest = pct;
  state.quizHistory.push({ date: todayStr(), score: pct });
  saveState();
  unlock('quiz1');
  if (pct >= 80) unlock('quiz80');
  // 展示错题回顾
  const rv = $('#resultWrongList');
  rv.innerHTML = '';
  if (wrongList.length) {
    rv.innerHTML = '<h4>📝 错题回顾</h4>';
    wrongList.forEach(w => {
      const d = document.createElement('div');
      d.className = 'rv-item';
      d.innerHTML = `<b>${w.item.q}</b><br>你的答案: ${w.your >= 0 ? String.fromCharCode(65 + w.your) : '未作答'} · 正确答案: ${String.fromCharCode(65 + w.item.ans)}<br>${w.item.opts[w.item.ans]}`;
      rv.appendChild(d);
    });
  } else {
    rv.innerHTML = '<p>🎉 全部正确！没有错题！</p>';
  }
  toast('📊 成绩已保存');
}
$('#quizRetry').addEventListener('click', () => {
  $('#quizResult').style.display = 'none';
  $('#quizHome').style.display = '';
  renderQuiz();
});

// ---------- 错题本 ----------
function renderMistakes() {
  const list = $('#mistakeList');
  list.innerHTML = '';
  let has = false;
  // 词汇错题
  state.wrongVocab.forEach(i => {
    const v = N2_VOCAB[i];
    if (!v) return;
    has = true;
    const card = document.createElement('div');
    card.className = 'mistake-card';
    card.innerHTML = `
      <div class="mistake-q">🃏 ${v.k}（${v.r}）<button class="btn btn-outline speak-btn" style="padding:2px 8px;font-size:12px">🔊</button></div>
      <div class="mistake-a"><b>${v.m}</b> · ${v.t}</div>
      <div class="mistake-a">例: ${v.e}</div>
      <button class="btn btn-outline mistake-remove" data-type="vocab" data-i="${i}">🗑 移出错题本</button>`;
    card.querySelector('.speak-btn').addEventListener('click', () => speak(v.e));
    card.querySelector('.mistake-remove').addEventListener('click', () => {
      state.wrongVocab = state.wrongVocab.filter(x => x !== i);
      saveState();
      renderMistakes();
    });
    list.appendChild(card);
  });
  // 测试错题
  state.wrongQuiz.forEach(i => {
    const q = N2_QUIZ[i];
    if (!q) return;
    has = true;
    const card = document.createElement('div');
    card.className = 'mistake-card';
    card.innerHTML = `
      <div class="mistake-q">✍️ 【${q.type}】${q.q}</div>
      <div class="mistake-a">正确答案: <b>${String.fromCharCode(65 + q.ans)}. ${q.opts[q.ans]}</b></div>
      <button class="btn btn-outline mistake-remove" data-type="quiz" data-i="${i}">🗑 移出错题本</button>`;
    card.querySelector('.mistake-remove').addEventListener('click', () => {
      state.wrongQuiz = state.wrongQuiz.filter(x => x !== i);
      saveState();
      renderMistakes();
    });
    list.appendChild(card);
  });
  if (!has) {
    list.innerHTML = '<div class="card center-card"><h3>🎉 错题本是空的！</h3><p>继续保持，全部答对！</p></div>';
  }
}

// ---------- 成就 ----------
function refreshAchievements() {
  // 根据当前状态解锁
  if (getStreak() >= 3) unlock('week3');
  if (getStreak() >= 7) unlock('week7');
  if (getStreak() >= 14) unlock('week14');
  if (getStreak() >= 30) unlock('week30');
  if (state.seenVocab.length >= 50) unlock('vocab50');
  if (state.quizBest >= 80) unlock('quiz80');
  if (totalChecks() > 0) unlock('first');
}
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
  // 月历
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

// ---------- 初始化 ----------
function init() {
  refreshAchievements();
  renderDashboard();
  // 预加载语音列表
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
}
init();
