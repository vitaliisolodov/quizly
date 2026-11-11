const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const icon = '<span class="logo">Q</span>';
const colors = ['#f28aad', '#ffc857', '#54dcb0', '#b695ff'];
const noInterest = 'Ніщо з цього не цікавить';
const defaultInterests = ['Фото', 'Відео', 'Ігри', 'Програмування', 'Електроніка', '3D-графіка', 'Радіозв’язок і мережі', 'Кібербезпека'];
const peerPrefix = 'quizly-gh-v1-';
const connectionTimeout = 15000;
let quizzes = [], hostSession = null, hostPeer = null, playerConnection = null, archiveKey = null, clockTimer = null;
let cancelPlayerConnection = () => {};
const preloadedImages = new Set();

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
function asset(path) { return String(path || '').replace(/^\/+/, ''); }
function nav() { return `<nav class="nav"><a class="brand" href="#/">${icon} Quizly</a><div class="nav-actions"><button class="btn secondary" onclick="location.hash='#/join'">Приєднатися</button><button class="btn accent" onclick="location.hash='#/dashboard'">Провести гру</button></div></nav>`; }
function toast(message) { const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3200); }
function questionArt(question) { return question?.image ? `<img class="question-art" src="${html(asset(question.image))}" alt="">` : ''; }
function answerCard(answer, label, className, index) {
  const tag=index===undefined?'div':'button';
  const action=index===undefined?'':` type="button" data-answer="${index}"`;
  if(!answer.image||!Number.isInteger(answer.tile))return `<${tag} class="${className}"${action} style="background:${html(answer.color||colors[index]||colors[0])}"><span>${html(label)}</span></${tag}>`;
  const position=`${(answer.tile%2)*100}% ${Math.floor(answer.tile/2)*100}%`;
  return `<${tag} class="${className} illustrated-answer"${action} style="background-color:${html(answer.color||colors[index]||colors[0])}"><span class="answer-art" aria-hidden="true" style="background-image:url('${html(asset(answer.image))}');background-position:${position}"></span><span class="answer-caption">${html(label)}</span></${tag}>`;
}
async function loadQuizzes() { const r=await fetch('./data/quizzes.json',{cache:'no-store'});if(!r.ok)throw new Error('Не вдалося завантажити data/quizzes.json');quizzes=await r.json(); }

function home(){app.innerHTML=`<div class="shell">${nav()}<main><section class="hero"><div><span class="eyebrow"><i class="pulse"></i> ЖИВІ ВІКТОРИНИ НОВОГО ФОРМАТУ</span><h1>Грай. Дивуй.<br><span class="grad">Запам’ятовуй.</span></h1><p>Проводьте інтерактивні вікторини, де кожна відповідь має власний дизайн, текст та зображення — і все це гравці бачать прямо на своїх телефонах.</p><div class="hero-actions"><button class="btn accent" onclick="location.hash='#/dashboard'">Провести вікторину →</button><button class="btn secondary" onclick="location.hash='#/join'">Ввести PIN</button></div><div class="stats"><div><b>∞</b><small>свободи дизайну</small></div><div><b>QR</b><small>швидке приєднання</small></div><div><b>100%</b><small>ваші контакти</small></div></div></div><div class="mockup"><div class="host-card"><div class="windowbar"><i></i><i></i><i></i></div><div class="question-preview">Яка технологія врятує твій стрім від шуму?</div><div class="answer-grid"><div class="answer-tile">Шкарпетка на мікрофон</div><div class="answer-tile">Говорити голосніше</div><div class="answer-tile">DSP і шумозаглушення</div><div class="answer-tile">Показувати меми</div></div></div><div class="phone"><div class="notch"></div><h4>Обери відповідь</h4><div class="mini" style="background:#f28aad">Шкарпетка</div><div class="mini" style="background:#ffc857">Говорити голосніше</div><div class="mini" style="background:#54dcb0">DSP</div><div class="mini" style="background:#b695ff">Меми</div></div></div></section><section class="section"><div class="section-head"><span class="tag">БІЛЬШЕ, НІЖ ТЕСТ</span><h2>Усе, чого бракує звичайним вікторинам</h2></div><div class="features"><article class="feature"><span class="icon">🎨</span><h3>Ілюстровані відповіді</h3><p>Колір, текст і власне зображення для кожного варіанта — без шаблонних символів.</p></article><article class="feature"><span class="icon">📱</span><h3>Повний контент на телефоні</h3><p>Гравець бачить запитання й усі картки відповідей так само повно, як ведучий.</p></article><article class="feature"><span class="icon">✦</span><h3>Контакти, а не нікнейми</h3><p>Збирайте email або телефон із валідацією та фільтром некоректних імен.</p></article></div></section></main></div>`}
function dashboard() {
  app.innerHTML=`<div class="dash"><aside class="sidebar"><a class="brand" href="#/">${icon} Quizly</a><a class="side-link active">▦ Мої вікторини</a><a class="side-link" href="#/join">↗ Приєднатися</a><a class="side-link" href="#/">⌂ На головну</a></aside><main class="main"><div class="topline"><div><div class="tag">КАБІНЕТ ВЕДУЧОГО</div><h1>Мої вікторини</h1></div></div><p><button class="btn secondary" id="exportArchive">Завантажити приватний архів CSV</button></p><div class="quiz-list">${quizzes.map(q=>`<article class="quiz-card"><div class="quiz-art">${q.id==='demo'?'⚡':'✦'}</div><div class="quiz-body"><h3>${html(q.title)}</h3><div class="quiz-meta">${q.questions.length} запитань • готова до запуску</div><div class="quiz-actions"><button class="btn mint" data-host="${html(q.id)}">Запустити</button></div></div></article>`).join('')}</div></main></div>`;
  document.querySelectorAll('[data-host]').forEach(button => {
    button.onclick = () => beginHost(quizzes.find(quiz => quiz.id === button.dataset.host));
  });
  $('#exportArchive').onclick = () => askArchivePassword('export');
}
function beginHost(quiz) { askArchivePassword('start',quiz); }
function askArchivePassword(mode,quiz){
  document.querySelector('.password-modal')?.remove();
  const modal=document.createElement('div');modal.className='password-modal';modal.innerHTML=`<form class="password-dialog"><button type="button" class="modal-close" aria-label="Закрити">×</button><div class="tag">ПРИВАТНИЙ АРХІВ</div><h2>${mode==='start'?'Захистіть контакти':'Відкрийте архів'}</h2><p>${mode==='start'?'Придумайте або введіть пароль цього браузера. Він шифрує імена й контакти учасників.':'Введіть пароль, яким зашифровано контакти в цьому браузері.'}</p><label>Пароль<input name="password" type="password" minlength="8" autocomplete="current-password" required placeholder="Щонайменше 8 символів"></label><small>Збережіть пароль: відновити його неможливо.</small><button class="btn mint" type="submit">${mode==='start'?'Створити гру':'Завантажити CSV'}</button></form>`;
  const close=()=>modal.remove();modal.querySelector('.modal-close').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
  modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.submitter, password=new FormData(event.currentTarget).get('password');button.disabled=true;button.textContent='Перевіряю…';try{const key=await unlockArchive(password);if(mode==='export'){await downloadArchive(key);close();return;}archiveKey=key;close();app.innerHTML='<div class="notice"><div class="big">◌</div><h2>Створюю кімнату…</h2></div>';createHostPeer(quiz,0);}catch(error){toast(error.message);button.disabled=false;button.textContent=mode==='start'?'Створити гру':'Завантажити CSV';}};
  document.body.append(modal);setTimeout(()=>modal.querySelector('input').focus(),0);
}
function createHostPeer(quiz, attempt, resume = null) {
  if (resume && attempt >= 3) {
    toast('Не вдалося відновити прийом нових підключень. Перевірте інтернет.');
    return;
  }
  if(attempt>8)return showFatal('Не вдалося підібрати вільний PIN. Спробуйте ще раз.');
  const pin = resume?.pin ?? String(Math.floor(100000 + Math.random() * 900000));
  hostPeer?.destroy();
  const peer = createQuizPeer(peerPrefix + pin);
  hostPeer = peer;
  let opened = false;
  let reconnectTimer;
  const startupTimer = setTimeout(() => failStartup('Не вдалося створити кімнату за 15 секунд. Перевірте інтернет і спробуйте ще раз.'), connectionTimeout);

  function failStartup(message) {
    if (hostPeer !== peer) return;
    clearTimeout(startupTimer);
    hostPeer = null;
    peer.destroy();
    if (resume) {
      setTimeout(() => {
        if (!hostPeer && hostSession === resume && location.hash === '#/host/' + pin) {
          createHostPeer(quiz, attempt + 1, resume);
        }
      }, 1000 * 2 ** attempt);
      return;
    }
    showFatal(message);
  }

  peer.on('open', () => {
    if (hostPeer !== peer) return;
    clearTimeout(startupTimer);
    clearTimeout(reconnectTimer);
    if (opened) return;
    opened = true;
    hostSession = resume ?? { id: crypto.randomUUID(), pin, quiz, status: 'lobby', questionIndex: -1,
      players: [], connections: new Map(), answers: new Map(), deadline: 0, timer: null, allAnswered: false };
    location.hash = '#/host/' + pin;
    renderHost();
  });
  peer.on('connection', connection => {
    if (hostPeer === peer) setupHostConnection(connection);
    else connection.close();
  });
  function scheduleRecovery() {
    if (!opened || hostPeer !== peer || hostSession.status === 'final') return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (hostPeer !== peer || location.hash !== '#/host/' + pin) return;
      if (peer.destroyed) createHostPeer(quiz, 0, hostSession);
      else if (peer.disconnected) peer.reconnect();
    }, 1500);
  }
  peer.on('disconnected', scheduleRecovery);
  peer.on('close', scheduleRecovery);
  peer.on('error', error => {
    if (hostPeer !== peer) return;
    if (opened) {
      if (peer.disconnected) scheduleRecovery();
      toast('Збій зв’язку із сервісом підключення. Перевірте інтернет, залишивши вкладку гри відкритою.');
      return;
    }
    if (resume || error.type !== 'unavailable-id') return failStartup(peerError(error));
    clearTimeout(startupTimer);
    hostPeer = null;
    peer.destroy();
    createHostPeer(quiz, attempt + 1);
  });
}
function setupHostConnection(connection) {
  connection.on('data',message=>receiveHostMessage(connection,message));
  connection.on('close', () => {
    const id = connection.playerId;
    if (hostSession?.connections.get(id) !== connection) return;
    hostSession.connections.delete(id);
    const player = hostSession.players.find(item => item.id === id);
    if (player) player.connected = false;
    renderHost();
  });
  connection.on('error', () => connection.close());
}
async function receiveHostMessage(connection,message) {
  if(!hostSession||!message||typeof message!=='object')return;
  if(message.type==='register'){
    const name=validateName(message.name),contact=validateContact(message.contact),interests=normalizeInterests(message.interests);
    if(!name)return connection.send({type:'error',field:'name',message:'Введіть ім’я з літер, без цифр і нецензурних слів'});
    if(!contact)return connection.send({type:'error',field:'contact',message:'Вкажіть коректний email або телефон'});
    if(!interests.length)return connection.send({type:'error',field:'interests',message:'Оберіть хоча б один варіант'});
    const playerId=/^[a-f0-9-]{16,64}$/i.test(message.playerId||'')?message.playerId:crypto.randomUUID();
    const session = hostSession;
    const existing = session.players.find(item => item.id === playerId);
    const candidate = { ...existing, id: playerId, name, contact, interests, connected: true,
      score: existing?.score ?? 0, roundPoints: existing?.roundPoints ?? 0 };
    const sameRegistration = existing && existing.name === name && existing.contact === contact &&
      JSON.stringify(existing.interests) === JSON.stringify(interests);
    try {
      if (!sameRegistration) await savePlayerRecord(candidate);
    } catch {
      if (connection.open) connection.send({ type: 'error', message: 'Ведучий не зміг зберегти реєстрацію. Повідомте ведучого й повторіть спробу.' });
      toast('Не вдалося зберегти контакт у приватному архіві.');
      return;
    }
    if (hostSession !== session || !connection.open) return;
    const player = session.players.find(item => item.id === playerId);
    if (player) Object.assign(player, { name, contact, interests, connected: true });
    else session.players.push(candidate);
    const previous = session.connections.get(playerId);
    connection.playerId = playerId;
    session.connections.set(playerId, connection);
    if (previous !== connection) previous?.close();
    connection.send({ type: 'registered', playerId, heartbeat: true });
    connection.send(publicState(playerId));
    renderHost();
    return;
  }
  const player=hostSession.players.find(x=>x.id===connection.playerId);
  if (!player || hostSession.connections.get(player.id) !== connection) return;
  if (message.type === 'ping') connection.send({ type: 'pong' });
  if (message.type === 'answer') acceptAnswer(player, message, connection);
}
function activePlayers(){return hostSession.players.filter(p=>p.connected);}
function acceptAnswer(player, message, connection) {
  const { answerIndex, questionIndex } = message;
  const session = hostSession;
  const answeredAt = Date.now();
  if (session.status !== 'question' || answeredAt >= session.deadline ||
      (questionIndex !== undefined && questionIndex !== session.questionIndex)) {
    connection.send(publicState(player.id));
    return;
  }
  if (session.answers.has(player.id)) {
    connection.send({ type: 'answerAccepted' });
    return;
  }
  const answers = session.quiz.questions[session.questionIndex].answers;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= answers.length) return;
  session.answers.set(player.id, { answerIndex, answeredAt });
  connection.send({ type: 'answerAccepted' });
  renderHost();
  const active=activePlayers();if(active.length&&active.every(p=>hostSession.answers.has(p.id)))revealQuestion(true);
}
function publicState(playerId){
  const s=hostSession,q=s.questionIndex>=0?s.quiz.questions[s.questionIndex]:null,revealed=s.status==='result',p=s.players.find(x=>x.id===playerId);
  return {type:'state',pin:s.pin,quizTitle:s.quiz.title,status:s.status,questionIndex:s.questionIndex,total:s.quiz.questions.length,deadline:s.deadline,remainingMs:remainingTime(s.deadline),allAnswered:s.allAnswered,preloadImages:s.status==='reading' ? [...new Set(q.answers.map(answer=>answer.image).filter(Boolean))] : [],question:q?{text:q.text,image:q.image,answers:s.status==='reading'?[]:q.answers.map(({text,image,tile,color,correct})=>({text,image,tile,color,...(revealed?{correct}:{})}))}:null,players:s.players.map(x=>({id:x.id,name:x.name,score:x.score})),ownScore:p?.score||0,roundPoints:p?.roundPoints||0,answered:s.answers.has(playerId)};
}
function broadcast(){if(!hostSession)return;for(const [id,c] of hostSession.connections)if(c.open)c.send(publicState(id));renderHost();}
function startGame(){if(!hostSession.players.length)return toast('Дочекайтеся хоча б одного гравця');hostSession.questionIndex=-1;nextQuestion();}
function nextQuestion(){
  clearTimeout(hostSession.timer);
  if(hostSession.questionIndex+1>=hostSession.quiz.questions.length){hostSession.status='final';hostSession.deadline=0;broadcast();return;}
  hostSession.questionIndex+=1;hostSession.status='reading';hostSession.answers.clear();hostSession.allAnswered=false;hostSession.players.forEach(p=>p.roundPoints=0);
  const q=hostSession.quiz.questions[hostSession.questionIndex],seconds=Math.max(0,Math.min(60,Number(q.readTime)||0));hostSession.deadline=seconds?Date.now()+seconds*1000:0;
  if(seconds)hostSession.timer=setTimeout(openAnswers,seconds*1000);broadcast();
}
function openAnswers(){
  if(!hostSession||hostSession.status!=='reading')return;clearTimeout(hostSession.timer);const q=hostSession.quiz.questions[hostSession.questionIndex],seconds=Math.max(5,Number(q.time)||20);
  hostSession.status='question';hostSession.answers.clear();hostSession.deadline=Date.now()+seconds*1000;hostSession.timer=setTimeout(()=>revealQuestion(false),seconds*1000);broadcast();
}
async function revealQuestion(allAnswered){
  if(!hostSession||hostSession.status!=='question')return;clearTimeout(hostSession.timer);const q=hostSession.quiz.questions[hostSession.questionIndex],duration=Math.max(5,Number(q.time)||20)*1000;
  for(const p of hostSession.players){const a=hostSession.answers.get(p.id),correct=a&&q.answers[a.answerIndex]?.correct;p.roundPoints=correct?500+Math.floor(500*Math.max(0,hostSession.deadline-a.answeredAt)/duration):0;p.score+=p.roundPoints;}
  hostSession.status = 'result';
  hostSession.allAnswered = allAnswered;
  hostSession.deadline = 0;
  const saved = await Promise.allSettled(hostSession.players.map(savePlayerRecord));
  if (saved.some(item => item.status === 'rejected')) toast('Не вдалося оновити частину балів у приватному архіві.');
  broadcast();
}
function fullscreenButton() {
  return document.fullscreenEnabled
    ? '<button type="button" class="btn secondary fullscreen-toggle" aria-label="Повноекранний режим" title="Повноекранний режим">⛶</button>'
    : '';
}

app.addEventListener('click', event => {
  if (!event.target.closest('.fullscreen-toggle')) return;
  const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  action.catch(() => toast('Повноекранний режим недоступний'));
});

window.addEventListener('keydown', event => {
  if (event.key !== ' ' || event.defaultPrevented || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!hostSession || location.hash !== '#/host/' + hostSession.pin) return;
  const target = event.target;
  if (target.isContentEditable || target.closest?.('input, textarea, select, button, a, [role="button"]')) return;
  if ($('.password-modal')) return;

  const action = $('.host-stage #openAnswers, .host-stage #next');
  if (!action || action.disabled) return;
  event.preventDefault();
  if (!event.repeat) action.click();
});

function clockBadge(state) {
  if (state.status === 'result') return `<span class="tag">${state.allAnswered ? 'Усі відповіли' : 'Час вийшов'}</span>`;
  if (state.status === 'reading' && state.remainingMs === null) return '<span class="tag round-clock">Ведучий читає запитання</span>';
  return `<span class="tag round-clock">${state.status === 'reading' ? 'Читання' : 'Час на відповідь'} <b id="secondsLeft">${Math.ceil(state.remainingMs / 1000)}</b> с</span>`;
}

function startClock(remainingMs) {
  clearInterval(clockTimer);
  const timer = $('#secondsLeft');
  if (!timer || remainingMs == null) return;
  const deadline = performance.now() + remainingMs;
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    timer.textContent = seconds;
    if (seconds === 0) clearInterval(clockTimer);
  };
  clockTimer = setInterval(tick, 150);
  tick();
}

function roundCards(state, playerMode) {
  return state.question.answers.map((answer, index) => {
    const correct = state.status === 'result' && answer.correct;
    const label = `${playerMode ? '' : (index + 1) + '. '}${correct ? '✓ ' : ''}${answer.text}`;
    const style = playerMode ? 'player-answer' : 'live-answer';
    return answerCard(answer, label, style + (correct ? ' correct-card' : ''), playerMode ? index : undefined);
  }).join('');
}

function renderHost() {
  if (!hostSession || location.hash !== '#/host/' + hostSession.pin) return;
  const s = hostSession;
  const qz = s.quiz;
  if(s.status==='lobby'){
    const joinUrl=new URL(location.href);joinUrl.hash='#/join/'+s.pin;
    if (hostPeer?.fingerprint) joinUrl.hash += '?key=' + hostPeer.fingerprint;
    app.innerHTML=`<div class="host"><header class="host-head"><a class="brand" href="#/dashboard">${icon} Quizly</a><div class="round-controls">PIN <span class="pin">${s.pin}</span>${fullscreenButton()}</div></header><main class="lobby"><div class="qr-card"><div id="qr"></div><b>Скануйте QR або введіть PIN</b><small>${html(joinUrl.href)}</small></div><section><span class="tag">ЛОБІ • ${s.players.length} УЧАСНИКІВ</span><h1 style="font:700 42px Unbounded">${html(qz.title)}</h1><div class="players">${s.players.map(p=>`<span class="chip">${html(p.name)}</span>`).join('')||'<p>Очікую на учасників…</p>'}</div><button class="btn accent" id="startGame" style="margin-top:28px" ${s.players.length ? '' : 'disabled'}>Почати гру →</button></section></main></div>`;
    new QRCode($('#qr'),{text:joinUrl.href,width:280,height:280,colorDark:'#11102c',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});$('#startGame').onclick=startGame;return;
  }
  if (s.status === 'final') return renderResults(publicState(), true);
  const state = {
    ...s,
    question: qz.questions[s.questionIndex],
    total: qz.questions.length,
    remainingMs: remainingTime(s.deadline)
  };
  renderHostRound(state);
}

function remainingTime(deadline) {
  return deadline ? Math.max(0, deadline - Date.now()) : null;
}

function renderHostRound(s) {
  const count = `${s.answers.size}/${activePlayers().length} відповіли`;
  const key = `${s.id}:${s.questionIndex}:${s.status}`;
  if ($('.host-screen')?.dataset.view === key) {
    $('#responseCount').textContent = count;
    return;
  }
  app.innerHTML = `<div class="host-stage"><section data-view="${key}" class="host-screen${s.status === 'reading' ? ' reading-screen' : ''}">
    <header class="host-head"><span class="brand">${icon} Quizly</span><div class="round-controls"><span id="responseCount">${count}</span>
    <span class="tag">${s.questionIndex + 1}/${s.total}</span>${clockBadge(s)}${fullscreenButton()}</div></header>
    <div class="stage-question"><h1>${html(s.question.text)}</h1>${questionArt(s.question)}</div>
    ${s.status === 'reading' ? '' : `<div class="live-answers">${roundCards(s, false)}</div>`}
    <footer class="stage-footer">${s.status === 'reading' ? '<button class="btn mint" id="openAnswers" aria-keyshortcuts="Space" title="Пробіл">Відкрити відповіді →</button>' : s.status === 'result' ? `<button class="btn accent" id="next" aria-keyshortcuts="Space" title="Пробіл">${s.questionIndex + 1 === s.total ? 'Результати' : 'Наступне запитання'} →</button>` : ''}</footer>
  </section></div>`;
  const next = $('#next');
  if (next) next.onclick = nextQuestion;
  const openButton = $('#openAnswers');
  if (openButton) openButton.onclick = openAnswers;
  startClock(s.remainingMs);
}

function joinPage(prefill = '', details) {
  details ??= JSON.parse(localStorage.getItem('quizly-player-details') || '{}');
  app.innerHTML = `<div class="join"><form class="join-card" id="registerForm">
    <a class="brand" href="#/">${icon} Quizly</a><h1>Приєднатися до гри</h1>
    <label for="pin">PIN гри</label>
    <input class="input" id="pin" inputmode="numeric" maxlength="6" required value="${/^\d{6}$/.test(prefill) ? prefill : ''}">
    <label for="name">Ваше ім’я</label>
    <input class="input" id="name" autocomplete="name" maxlength="28" required value="${html(details.name ?? '')}">
    <label for="contact">Email або номер телефону</label>
    <input class="input" id="contact" maxlength="80" required value="${html(details.contact ?? '')}">
    <p class="join-error" role="alert"></p>
    <button type="submit" class="btn accent" id="joinButton">Далі →</button>
  </form></div>`;
  $('#registerForm').onsubmit = event => {
    event.preventDefault();
    const pin = $('#pin').value.trim();
    const name = validateName($('#name').value);
    const contact = validateContact($('#contact').value);
    if (!/^\d{6}$/.test(pin)) return formError('Введіть шестизначний PIN гри', 'pin');
    if (!name) return formError('Введіть ім’я з літер, без цифр і нецензурних слів', 'name');
    if (!contact) return formError('Вкажіть коректний email або телефон', 'contact');
    renderIntro(pin, { name, contact, interests: details.interests });
  };
}

function renderIntro(pin, registration) {
  const choices = [...defaultInterests, noInterest];
  app.innerHTML = `<div class="join"><form class="join-card" id="interestForm">
    <a class="brand" href="#/">${icon} Quizly</a><h1>Давайте познайомимось?</h1>
    <fieldset class="interest-options"><legend>Чим ви цікавитесь?</legend>
      <p>Можна обрати кілька варіантів.</p>
      ${choices.map((label, index) => `<label class="interest-choice"><input type="checkbox" value="${index}"${registration.interests?.includes(label) ? ' checked' : ''}><span>${html(label)}</span></label>`).join('')}
    </fieldset>
    <p class="join-error" role="alert"></p>
    <p class="registration-note">Організатор отримає ваш контакт та інтереси, щоб надалі зв’язатися з вами щодо обраних тем.</p>
    <button type="submit" class="btn accent" id="joinButton">Приєднатися →</button>
    <button type="button" class="btn secondary" id="backToRegistration">← Змінити ім’я або контакт</button>
  </form></div>`;
  const form = $('#interestForm');
  const inputs = [...form.querySelectorAll('input[type=checkbox]')];
  const none = inputs.at(-1);
  form.onchange = event => {
    if (!event.target.checked) return;
    if (event.target === none) inputs.slice(0, -1).forEach(input => { input.checked = false; });
    else none.checked = false;
  };
  form.onsubmit = event => {
    event.preventDefault();
    const interests = inputs.filter(input => input.checked).map(input => choices[Number(input.value)]);
    if (!interests.length) return formError('Оберіть хоча б один варіант');
    localStorage.setItem('quizly-player-details', JSON.stringify({ ...registration, interests }));
    connectPlayer(pin, { ...registration, interests });
  };
  $('#backToRegistration').onclick = () => {
    cancelPlayerConnection();
    joinPage(pin, { ...registration, interests: inputs.filter(input => input.checked).map(input => choices[Number(input.value)]) });
  };
}
function formError(message, field) {
  const alert = $('.join-error');
  if (!alert) return toast(message);
  alert.textContent = message;
  if (field) $('#' + field)?.focus();
}
function connectPlayer(pin, registration) {
  cancelPlayerConnection();
  const playerId = sessionStorage.getItem('quizly-player-id') || crypto.randomUUID();
  sessionStorage.setItem('quizly-player-id', playerId);
  let cancelled = false;
  let joined = false;
  let finished = false;
  let retries = 0;
  let attemptTimer;
  let retryTimer;
  let heartbeatTimer;
  let peer;

  function disposeAttempt() {
    clearTimeout(attemptTimer);
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    const current = peer;
    peer = null;
    playerConnection = null;
    current?.destroy();
  }

  cancelPlayerConnection = () => {
    cancelled = true;
    clearTimeout(retryTimer);
    disposeAttempt();
  };

  function fail(current, message, canRetry = true) {
    if (cancelled || peer !== current) return;
    disposeAttempt();
    if (finished) return;
    if (!joined) {
      const button = $('#joinButton');
      if (button) button.disabled = false;
      formError(message);
      return;
    }
    if (canRetry && retries < 3) {
      const delay = 1000 * 2 ** retries;
      retries++;
      showPlayerReconnect(pin, null);
      retryTimer = setTimeout(attempt, delay);
    } else {
      showPlayerReconnect(pin, () => {
        retries = 0;
        showPlayerReconnect(pin, null);
        attempt();
      });
    }
  }

  function attempt() {
    if (cancelled) return;
    const button = $('#joinButton');
    if (button) {
      button.disabled = true;
      formError('З’єднуюся з браузером ведучого…');
    }
    const current = createQuizPeer();
    peer = current;
    let stage = 'signal';
    let ready = false;
    attemptTimer = setTimeout(() => {
      const message = {
        signal: 'Сервіс підключення не відповідає. Перевірте інтернет і повторіть спробу.',
        channel: window.QUIZLY_RELAY_URL
          ? 'Сервер не підтвердив вхід до кімнати. Перевірте PIN і спробуйте ще раз.'
          : 'Не вдалося встановити зв’язок із ведучим. Спробуйте іншу мережу або відкрийте гру у звичайному браузері.',
        registration: 'Браузер ведучого не підтвердив реєстрацію. Повідомте ведучого й повторіть спробу.'
      }[stage];
      fail(current, message);
    }, connectionTimeout);

    current.on('open', () => {
      if (peer !== current) return;
      stage = 'channel';
      const connection = current.connect(peerPrefix + pin, { reliable: true, serialization: 'json' });
      playerConnection = connection;
      let lastMessage = performance.now();
      const lost = () => fail(current, 'Зв’язок із браузером ведучого перервався. Повторіть спробу.');
      connection.on('open', () => {
        if (peer !== current) return;
        stage = 'registration';
        connection.send({ type: 'register', playerId, ...registration });
      });
      connection.on('data', message => {
        if (peer !== current) return;
        lastMessage = performance.now();
        if (message.type === 'registered' && message.heartbeat && !heartbeatTimer) {
          heartbeatTimer = setInterval(() => {
            if (document.hidden || finished) {
              lastMessage = performance.now();
              return;
            }
            if (performance.now() - lastMessage > connectionTimeout) {
              lost();
              return;
            }
            if (connection.open) connection.send({ type: 'ping' });
            else lost();
          }, 5000);
        }
        if (message.type === 'error') {
          if (!ready) fail(current, message.message, false);
          else toast(message.message);
          return;
        }
        if (message.type === 'state') {
          clearTimeout(attemptTimer);
          joined = ready = true;
          finished = message.status === 'final';
          if (finished) clearInterval(heartbeatTimer);
          retries = 0;
          renderPlayer(message, pin);
        } else if (message.type === 'answerAccepted') {
          showAccepted();
        }
      });
      connection.on('close', lost);
      connection.on('error', lost);
    });
    current.on('error', error => {
      if (ready && playerConnection?.open && ['network', 'disconnected'].includes(error.type)) return;
      fail(current, error.type === 'peer-unavailable'
        ? 'Гру з таким PIN не знайдено. Перевірте PIN і вкладку ведучого.'
        : peerError(error), error.type !== 'browser-incompatible');
    });
  }

  attempt();
}

function renderPlayer(state, pin) {
  for (const path of state.preloadImages ?? []) {
    const url = asset(path);
    if (preloadedImages.has(url)) continue;
    preloadedImages.add(url);
    const image = new Image();
    image.onerror = () => preloadedImages.delete(url);
    image.src = url;
  }
  const { status, question, questionIndex, total } = state;
  const submission = state.answered ? { points: state.roundPoints } : null;
  const remainingMs = state.remainingMs === undefined ? remainingTime(state.deadline) : state.remainingMs;
  if (status === 'lobby') {
    app.innerHTML = `<div class="join"><div class="join-card notice"><div class="big">✨</div><h1>Ви в грі!</h1>
      <p>Чекаємо, поки ведучий запустить вікторину.</p><span class="tag">PIN ${pin}</span> ${fullscreenButton()}</div></div>`;
    return;
  }
  if (status === 'final') return renderResults(state, false);
  const header = `<header class="round-controls"><span class="tag">${questionIndex + 1}/${total}</span>${clockBadge({ ...state, remainingMs })}${fullscreenButton()}</header>`;
  let content;
  if (status === 'result') {
    const totalScore = state.ownScore;
    const correct = question.answers.filter(answer => answer.correct).map(answer => html(answer.text)).join(', ');
    content = `<div class="round-feedback" role="status"><section class="panel">
      <h2>${submission?.points ? 'Правильно!' : submission ? 'Неправильна відповідь' : 'Час вийшов'}</h2>
      <strong class="points-earned">+${submission?.points ?? 0} балів</strong>
      <p>Усього: <b>${totalScore}</b></p>${correct ? `<p>Правильна відповідь: <b>${correct}</b></p>` : ''}
      <small>Чекаємо на ведучого.</small></section></div>`;
  } else if (submission) {
    content = acceptedFeedback();
  } else {
    content = `<div class="mobile-question"><h2>${html(question.text)}</h2>${questionArt(question)}
      ${status === 'reading' ? '<p class="round-caption" role="status">Варіанти з’являться, коли ведучий їх відкриє.</p>' : ''}</div>
      ${status === 'reading' ? '' : `<div class="player-answers">${roundCards(state, true)}</div>`}`;
  }
  app.innerHTML = `<div class="player-q compact-round">${header}${content}</div>`;
  document.querySelectorAll('[data-answer]').forEach(button => {
    button.onclick = () => {
      if (!playerConnection?.open) return toast('Зв’язок із ведучим перервано');
      document.querySelectorAll('[data-answer]').forEach(card => { card.disabled = true; });
      playerConnection.send({ type: 'answer', questionIndex, answerIndex: Number(button.dataset.answer) });
    };
  });
  startClock(remainingMs);
}

function showAccepted() {
  const answers = $('.player-answers');
  if (!answers) return;
  $('.mobile-question')?.remove();
  answers.outerHTML = acceptedFeedback();
}

function acceptedFeedback() {
  return '<div class="round-feedback" role="status"><section class="panel"><div class="feedback-check" aria-hidden="true">✓</div><h2>Відповідь прийнято</h2><p>Бали з’являться після завершення раунду.</p></section></div>';
}
function showPlayerReconnect(pin, retry) {
  clearInterval(clockTimer);
  app.innerHTML = `<div class="join"><div class="join-card notice" role="status"><div class="big">⌁</div>
    <h1>${retry ? 'Зв’язок із ведучим втрачено' : 'Відновлюю зв’язок із ведучим…'}</h1>
    <p>PIN гри ${html(pin)}</p>
    ${retry ? '<button type="button" class="btn accent" id="retryConnection">Спробувати знову</button>' : ''}
  </div></div>`;
  if (retry) $('#retryConnection').onclick = retry;
}
function confetti() {
  const palette = ['#8b5cf6', '#36d399', '#f4b942', '#ef6c8f', '#42d4ff'];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 48 }, (_, i) =>
    `<i style="--x:${(i * 37) % 100}%;--drift:${(i * 31) % 160 - 80}px;--delay:${i % 12 * 80}ms;--color:${palette[i % palette.length]}"></i>`).join('')}</div>`;
}

function renderResults(state, hostMode) {
  clearInterval(clockTimer);
  if ($('#finalResults')) return;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const ownIndex = hostMode ? -1 : sorted.findIndex(player => player.id === sessionStorage.getItem('quizly-player-id'));
  const celebrate = hostMode || (ownIndex >= 0 && ownIndex < 3);
  app.innerHTML = `<div class="host" id="finalResults">
    ${celebrate ? confetti() : ''}
    <header class="host-head"><div class="brand">${icon} Quizly</div>${hostMode ? '<a class="btn secondary" href="#/dashboard">До кабінету</a>' : ''}</header>
    <main class="leaderboard"><div class="notice"><div class="big" aria-hidden="true">🏆</div><h1>Фінальний рейтинг</h1>
      ${ownIndex >= 0 ? `<p>Ваше місце — <b>${ownIndex + 1}</b></p>` : ''}
      ${hostMode ? '<button class="btn mint" id="finalExport">Завантажити приватний CSV</button>' : ''}</div>
      ${sorted.map((player, index) => `<div class="rank${index === ownIndex ? ' own-rank' : ''}"><b>${index + 1}</b>
        <span>${html(player.name)}${index === ownIndex ? ' <small>Ви</small>' : ''}</span><b>${player.score}</b></div>`).join('')}
    </main></div>`;
  if (hostMode) $('#finalExport').onclick = () => askArchivePassword('export');
  $('.own-rank')?.scrollIntoView({ block: 'nearest' });
}

const blockedName=/(?:ху[йяєюиеі]|п[іи]зд|бля(?:д|т)|[єеё]ба[тнл]|їба[тнл]|мудак|гандон|довбойоб|долбо[её]б|fuck|shit|bitch|nigg[ea]r)/u;
const lookalikes=['aа','bв','cс','eе','hн','iі','kк','mм','oо','pр','tт','yу','xх'],cyrillicLetters=new Map(lookalikes.map(([a,b])=>[a,b])),latinLetters=new Map(lookalikes.map(([a,b])=>[b,a]));
function validateName(value){if(typeof value!=='string')return;const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(name.length>28||!/^\p{L}\p{M}*(?:[ ’'ʼ-]?\p{L}\p{M}*)+$/u.test(name))return;const normalized=name.toLowerCase().replace(/[^\p{L}]/gu,''),cyrillic=[...normalized].map(c=>cyrillicLetters.get(c)??c).join(''),latin=[...normalized].map(c=>latinLetters.get(c)??c).join(''),whole=/(?:^|[ ’'ʼ-])(?:сука|суки|сучка|бля|хер)(?=$|[ ’'ʼ-])/u;if(whole.test(name.toLowerCase())||[normalized,cyrillic,latin].some(t=>blockedName.test(t)||whole.test(t)))return;return name;}
function validateContact(value){const c=String(value||'').trim(),phone=/^\+?[\d\s()\-]+$/.test(c)&&/^\d{9,15}$/.test(c.replace(/\D/g,'')),email=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);return c.length<=80&&(phone||email)?c:undefined;}
function normalizeInterests(values){const allowed=new Set([...defaultInterests,noInterest]),clean=[...new Set((Array.isArray(values)?values:[]).filter(v=>allowed.has(v)))];return clean.includes(noInterest)?[noInterest]:clean.slice(0,8);}
function peerError(error) {
  return ({
    'browser-incompatible': 'Цей браузер не підтримує WebRTC.',
    'network': 'Не вдалося зв’язатися із сервісом підключення.',
    'server-error': 'Сервіс підключення тимчасово недоступний.',
    'ssl-unavailable': 'Для гри потрібне захищене HTTPS-з’єднання.',
    'room-full': 'У цій кімнаті вже максимальна кількість учасників.',
    'host-key-mismatch': 'Цей QR-код не відповідає поточній кімнаті. Відскануйте новий QR-код ведучого.'
  })[error?.type] || 'Помилка з’єднання. Спробуйте ще раз.';
}
function showFatal(message){app.innerHTML=`<div class="join"><div class="join-card notice"><div class="big">!</div><h1>Не вдалося запустити гру</h1><p>${html(message)}</p><a class="btn accent" href="#/dashboard">Повернутися</a></div></div>`;}

function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open('quizly-private-archive',1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('meta',{keyPath:'key'});db.createObjectStore('records',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function idbGet(store,key){const db=await openDatabase();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function idbPut(store,value){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function idbAll(store){const db=await openDatabase();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function bytesToBase64(bytes){let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
function base64ToBytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function deriveArchiveKey(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptValue(key,value){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return {iv:bytesToBase64(iv),cipher:bytesToBase64(new Uint8Array(cipher))};}
async function decryptValue(key,value){const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(value.iv)},key,base64ToBytes(value.cipher));return JSON.parse(new TextDecoder().decode(clear));}
async function unlockArchive(password){
  if(String(password).length<8)throw new Error('Пароль архіву має містити щонайменше 8 символів');let meta=await idbGet('meta','archive');
  if(!meta){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await deriveArchiveKey(password,salt),verifier=await encryptValue(key,{value:'quizly-private-archive-v1'});meta={key:'archive',salt:bytesToBase64(salt),...verifier};await idbPut('meta',meta);return key;}
  try{const key=await deriveArchiveKey(password,base64ToBytes(meta.salt)),verifier=await decryptValue(key,meta);if(verifier.value!=='quizly-private-archive-v1')throw new Error();return key;}catch{throw new Error('Неправильний пароль приватного архіву');}
}
async function savePlayerRecord(player) {
  const session = hostSession;
  if (!archiveKey || !session) return;
  const record = {
    joinedAt: new Date().toISOString(), quiz: session.quiz.title, pin: session.pin,
    name: player.name, contact: player.contact, interests: player.interests, score: player.score
  };
  const encrypted = await encryptValue(archiveKey, record);
  await idbPut('records', { id: session.id + ':' + player.id, ...encrypted });
}
async function downloadArchive(key){
  const encrypted=await idbAll('records'),records=await Promise.all(encrypted.map(x=>decryptValue(key,x)));records.sort((a,b)=>b.joinedAt.localeCompare(a.joinedAt));const rows=[['Дата','Вікторина','PIN','Ім’я','Контакт','Інтереси','Бали'],...records.map(r=>[r.joinedAt,r.quiz,r.pin,r.name,r.contact,r.interests.join('; '),r.score])],csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='quizly-private-contacts-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function csvCell(value){const text=String(value??''),safe=/^\s*[=+\-@\t\r\n]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';}

async function route(){
  const hash=location.hash||'#/';
  cancelPlayerConnection();
  if(hash.startsWith('#/host/')){if(hostSession)renderHost();else showFatal('Сесію ведучого втрачено після перезавантаження вкладки. Створіть нову гру.');return;}
  if(hash.startsWith('#/join/'))return joinPage(hash.split('?')[0].split('/')[2]||'');
  if(hash==='#/join')return joinPage();
  if(hash==='#/dashboard')return dashboard();
  home();
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(hostSession&&hostSession.status!=='final'){event.preventDefault();event.returnValue='';}});
loadQuizzes().then(route).catch(error=>showFatal(error.message));

