const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const icon = '<span class="logo">Q</span>';
const colors = ['#f28aad', '#ffc857', '#54dcb0', '#b695ff'];
const noInterest = 'Ніщо з цього не цікавить';
const defaultInterests = ['Фото', 'Відео', 'Ігри', 'Програмування', 'Електроніка', '3D-графіка', 'Радіозв’язок і мережі', 'Кібербезпека'];
const peerPrefix = 'quizly-gh-v1-';
let quizzes = [], hostSession = null, hostPeer = null, playerPeer = null, playerConnection = null, archiveKey = null, clockTimer = null;

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}
function asset(path) { return String(path || '').replace(/^\/+/, ''); }
function nav() { return `<nav class="nav"><a class="brand" href="#/">${icon} Quizly P2P</a><div class="nav-actions"><a class="btn secondary" href="#/join">Приєднатися</a><a class="btn accent" href="#/dashboard">Провести гру</a></div></nav>`; }
function toast(message) { const e=document.createElement('div');e.className='toast';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3200); }
function questionArt(question) { return question?.image ? `<img class="question-art" src="${html(asset(question.image))}" alt="">` : ''; }
function answerCard(answer, label, className, index, disabled=false, correct=false) {
  const tag=index===undefined?'div':'button';
  const action=index===undefined?'':` type="button" data-answer="${index}"${disabled?' disabled':''}`;
  if(!answer?.image||!Number.isInteger(answer.tile))return `<${tag} class="${className} illustrated-answer plain-answer${correct?' correct-answer':''}"${action} style="background-color:${html(answer?.color||colors[index]||colors[0])}"><span class="answer-caption">${html(label)}</span></${tag}>`;
  const position=`${(answer.tile%2)*100}% ${Math.floor(answer.tile/2)*100}%`;
  return `<${tag} class="${className} illustrated-answer${correct?' correct-answer':''}"${action} style="background-color:${html(answer.color||colors[index]||colors[0])}"><span class="answer-art" aria-hidden="true" style="background-image:url('${html(asset(answer.image))}');background-position:${position}"></span><span class="answer-caption">${html(label)}</span></${tag}>`;
}
async function loadQuizzes() { const r=await fetch('./data/quizzes.json',{cache:'no-store'});if(!r.ok)throw new Error('Не вдалося завантажити data/quizzes.json');quizzes=await r.json(); }

function home() {
  app.innerHTML=`<div class="shell">${nav()}<main><section class="hero"><div><span class="eyebrow"><i class="pulse"></i> СТАТИЧНА P2P-ВЕРСІЯ</span><h1>Грай. Дивуй.<br><span class="grad">Зберігай приватно.</span></h1><p>Гра працює на GitHub Pages, а браузер ведучого керує сесією. Контакти шифруються та залишаються тільки на пристрої ведучого.</p><div class="hero-actions"><a class="btn accent" href="#/dashboard">Провести вікторину →</a><a class="btn secondary" href="#/join">Ввести PIN</a></div><div class="stats"><div><b>P2P</b><small>гра між браузерами</small></div><div><b>AES</b><small>зашифрований архів</small></div><div><b>0</b><small>контактів на сервері</small></div></div></div><div class="mockup"><div class="host-card"><div class="windowbar"><i></i><i></i><i></i></div><div class="question-preview">Хто зберігає контакти учасників?</div><div class="answer-grid"><div class="answer-tile">GitHub Pages</div><div class="answer-tile">PeerJS Cloud</div><div class="answer-tile">Браузер ведучого</div><div class="answer-tile">Публічний CSV</div></div></div><div class="phone"><div class="notch"></div><h4>Приватний канал</h4><div class="mini" style="background:#f28aad">QR та PIN</div><div class="mini" style="background:#ffc857">WebRTC</div><div class="mini" style="background:#54dcb0">Тільки ведучий</div><div class="mini" style="background:#b695ff">Зашифровано</div></div></div></section></main></div>`;
}
function dashboard() {
  app.innerHTML=`<div class="dash"><aside class="sidebar"><a class="brand" href="#/">${icon} Quizly</a><a class="side-link active">▦ Вікторини</a><a class="side-link" href="#/join">↗ Приєднатися</a><a class="side-link" href="#/">⌂ Головна</a></aside><main class="main"><div class="topline"><div><div class="tag">БРАУЗЕР ВЕДУЧОГО</div><h1>Запуск гри</h1></div><button class="btn secondary" id="exportArchive">Завантажити приватний архів CSV</button></div><div class="privacy-card"><b>Контакти не завантажуються на GitHub.</b><span>Вони зашифровані паролем у цьому браузері. Пароль неможливо відновити.</span></div><div class="quiz-list">${quizzes.map(q=>`<article class="quiz-card"><div class="quiz-art">✦</div><div class="quiz-body"><h3>${html(q.title)}</h3><div class="quiz-meta">${q.questions.length} запитань • P2P-режим</div><div class="quiz-actions"><button class="btn mint" data-host="${html(q.id)}">Запустити</button></div></div></article>`).join('')}</div><section class="panel static-note"><h3>Що важливо</h3><p>Не закривайте вкладку ведучого до завершення гри. Для підключення потрібен інтернет, але контакти не записуються на зовнішній сервер.</p></section></main></div>`;
  document.querySelectorAll('[data-host]').forEach(b=>b.onclick=()=>beginHost(quizzes.find(q=>q.id===b.dataset.host)));
  $('#exportArchive').onclick=()=>askArchivePassword('export');
}
function beginHost(quiz) { askArchivePassword('start',quiz); }
function askArchivePassword(mode,quiz){
  document.querySelector('.password-modal')?.remove();
  const modal=document.createElement('div');modal.className='password-modal';modal.innerHTML=`<form class="password-dialog"><button type="button" class="modal-close" aria-label="Закрити">×</button><div class="tag">ПРИВАТНИЙ АРХІВ</div><h2>${mode==='start'?'Захистіть контакти':'Відкрийте архів'}</h2><p>${mode==='start'?'Придумайте або введіть пароль цього браузера. Він шифрує імена й контакти учасників.':'Введіть пароль, яким зашифровано контакти в цьому браузері.'}</p><label>Пароль<input name="password" type="password" minlength="8" autocomplete="current-password" required placeholder="Щонайменше 8 символів"></label><small>Збережіть пароль: відновити його неможливо.</small><button class="btn mint" type="submit">${mode==='start'?'Створити гру':'Завантажити CSV'}</button></form>`;
  const close=()=>modal.remove();modal.querySelector('.modal-close').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
  modal.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.submitter, password=new FormData(event.currentTarget).get('password');button.disabled=true;button.textContent='Перевіряю…';try{const key=await unlockArchive(password);if(mode==='export'){await downloadArchive(key);close();return;}archiveKey=key;close();app.innerHTML='<div class="notice"><div class="big">◌</div><h2>Створюю P2P-кімнату…</h2></div>';createHostPeer(quiz,0);}catch(error){toast(error.message);button.disabled=false;button.textContent=mode==='start'?'Створити гру':'Завантажити CSV';}};
  document.body.append(modal);setTimeout(()=>modal.querySelector('input').focus(),0);
}
function createHostPeer(quiz,attempt) {
  if(attempt>8)return showFatal('Не вдалося підібрати вільний PIN. Спробуйте ще раз.');
  const pin=String(Math.floor(100000+Math.random()*900000));
  const peer=new Peer(peerPrefix+pin,{debug:1});hostPeer=peer;let opened=false;
  peer.on('open',()=>{opened=true;hostSession={id:crypto.randomUUID(),pin,quiz,status:'lobby',questionIndex:-1,players:[],connections:new Map(),answers:new Map(),deadline:0,timer:null,allAnswered:false};peer.on('connection',setupHostConnection);location.hash='#/host/'+pin;renderHost();});
  peer.on('error',error=>{if(!opened&&error.type==='unavailable-id'){peer.destroy();return createHostPeer(quiz,attempt+1);}showFatal(peerError(error));});
}
function setupHostConnection(connection) {
  connection.on('data',message=>receiveHostMessage(connection,message));
  connection.on('close',()=>{if(!hostSession||!connection.playerId)return;const p=hostSession.players.find(x=>x.id===connection.playerId);if(p)p.connected=false;hostSession.connections.delete(connection.playerId);broadcast();});
  connection.on('error',()=>{});
}
async function receiveHostMessage(connection,message) {
  if(!hostSession||!message||typeof message!=='object')return;
  if(message.type==='register'){
    const name=validateName(message.name),contact=validateContact(message.contact),interests=normalizeInterests(message.interests);
    if(!name)return connection.send({type:'error',field:'name',message:'Введіть ім’я з літер, без цифр і нецензурних слів'});
    if(!contact)return connection.send({type:'error',field:'contact',message:'Вкажіть коректний email або телефон'});
    if(!interests.length)return connection.send({type:'error',field:'interests',message:'Оберіть хоча б один варіант'});
    const playerId=/^[a-f0-9-]{16,64}$/i.test(message.playerId||'')?message.playerId:crypto.randomUUID();
    let player=hostSession.players.find(x=>x.id===playerId);
    if(!player){player={id:playerId,name,contact,interests,score:0,roundPoints:0,connected:true};hostSession.players.push(player);}else Object.assign(player,{name,contact,interests,connected:true});
    connection.playerId=playerId;hostSession.connections.set(playerId,connection);await savePlayerRecord(player);connection.send({type:'registered',playerId});broadcast();return;
  }
  const player=hostSession.players.find(x=>x.id===connection.playerId);
  if(!player)return connection.send({type:'error',message:'Спочатку зареєструйтеся'});
  if(message.type==='answer')acceptAnswer(player,Number(message.answerIndex),connection);
}
function activePlayers(){return hostSession.players.filter(p=>p.connected);}
function acceptAnswer(player,answerIndex,connection){
  if(hostSession.status!=='question'||!Number.isInteger(answerIndex)||answerIndex<0||answerIndex>3||Date.now()>hostSession.deadline||hostSession.answers.has(player.id))return;
  hostSession.answers.set(player.id,{answerIndex,answeredAt:Date.now()});connection.send({type:'answerAccepted'});renderHost();
  const active=activePlayers();if(active.length&&active.every(p=>hostSession.answers.has(p.id)))revealQuestion(true);
}
function publicState(playerId){
  const s=hostSession,q=s.questionIndex>=0?s.quiz.questions[s.questionIndex]:null,revealed=s.status==='result',p=s.players.find(x=>x.id===playerId);
  return {type:'state',pin:s.pin,quizTitle:s.quiz.title,status:s.status,questionIndex:s.questionIndex,total:s.quiz.questions.length,deadline:s.deadline,allAnswered:s.allAnswered,question:q?{text:q.text,image:q.image,answers:s.status==='reading'?[]:q.answers.map(({text,image,tile,color,correct})=>({text,image,tile,color,...(revealed?{correct}:{})}))}:null,players:s.players.map(x=>({id:x.id,name:x.name,score:x.score})),ownScore:p?.score||0,roundPoints:p?.roundPoints||0,answered:s.answers.has(playerId)};
}
function broadcast(){if(!hostSession)return;for(const [id,c] of hostSession.connections)if(c.open)c.send(publicState(id));renderHost();}
function startGame(){if(!hostSession.players.length)return toast('Дочекайтеся хоча б одного гравця');hostSession.questionIndex=-1;nextQuestion();}
function nextQuestion(){
  clearTimeout(hostSession.timer);
  if(hostSession.questionIndex+1>=hostSession.quiz.questions.length){hostSession.status='final';hostSession.deadline=0;broadcast();launchConfetti();return;}
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
  hostSession.status='result';hostSession.allAnswered=allAnswered;hostSession.deadline=0;await Promise.all(hostSession.players.map(savePlayerRecord));broadcast();
}
function renderHost(){
  if(!hostSession||!location.hash.startsWith('#/host/'))return;clearInterval(clockTimer);const s=hostSession,qz=s.quiz;
  if(s.status==='lobby'){
    const joinUrl=new URL(location.href);joinUrl.hash='#/join/'+s.pin;
    app.innerHTML=`<div class="host"><header class="host-head"><div class="brand">${icon} Quizly P2P</div><div><span class="tag">PIN</span> <span class="pin">${s.pin}</span></div></header><main class="lobby"><div class="qr-card"><div id="qr"></div><b>Скануйте QR або введіть PIN</b><small>${html(joinUrl.href)}</small></div><section><span class="tag">ЛОБІ</span><h1>${html(qz.title)}</h1><h2>${s.players.length} гравців</h2><div class="players">${s.players.map(p=>`<span class="chip">${html(p.name)}</span>`).join('')||'<p>Очікую на учасників…</p>'}</div><button class="btn accent" id="startGame">Почати гру</button></section></main></div>`;
    new QRCode($('#qr'),{text:joinUrl.href,width:280,height:280,colorDark:'#11102c',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});$('#startGame').onclick=startGame;return;
  }
  if(s.status==='final')return renderFinal(publicState(),true);
  const q=qz.questions[s.questionIndex],count=`${s.questionIndex+1} / ${qz.questions.length}`;
  if(s.status==='reading'){
    app.innerHTML=`<div class="host host-screen reading-screen"><header class="host-head"><div class="brand">${icon} Quizly</div><div class="round-controls"><span class="tag">${count}</span>${s.deadline?'<span class="timer" data-clock></span>':'<span class="tag">ЧИТАННЯ</span>'}<button class="btn secondary fullscreen-toggle">⛶</button></div></header><main class="stage-question"><h1>${html(q.text)}</h1>${questionArt(q)}</main><footer class="stage-footer"><button class="btn accent" id="openAnswers">Показати відповіді →</button></footer></div>`;
    $('#openAnswers').onclick=openAnswers;$('.fullscreen-toggle').onclick=toggleFullscreen;startClock();return;
  }
  if(s.status==='question'){
    app.innerHTML=`<div class="host host-screen"><header class="host-head"><div class="brand">${icon} Quizly</div><div class="round-controls"><span class="tag">${count}</span><span class="tag">${s.answers.size}/${activePlayers().length} відповіли</span><span class="timer" data-clock></span><button class="btn secondary fullscreen-toggle">⛶</button></div></header><main class="live-q"><h1 class="live-title">${html(q.text)}</h1>${questionArt(q)}<div class="live-answers">${q.answers.map(a=>answerCard(a,a.text,'live-answer')).join('')}</div></main></div>`;
    $('.fullscreen-toggle').onclick=toggleFullscreen;startClock();return;
  }
  const sorted=[...s.players].sort((a,b)=>b.score-a.score);
  app.innerHTML=`<div class="host host-screen"><header class="host-head"><div class="brand">${icon} Quizly</div><span class="tag">${s.allAnswered?'УСІ ВІДПОВІЛИ':'ЧАС ВИЙШОВ'}</span></header><main class="live-q"><h1 class="live-title">${html(q.text)}</h1><div class="live-answers">${q.answers.map(a=>answerCard(a,a.text,'live-answer',undefined,false,a.correct)).join('')}</div><div class="leaderboard compact-board">${sorted.slice(0,5).map((p,i)=>`<div class="rank"><b>${i+1}</b><span>${html(p.name)}</span><b>${p.score}</b></div>`).join('')}</div></main><footer class="stage-footer"><button class="btn accent" id="nextQuestion">${s.questionIndex+1===qz.questions.length?'Показати фінал':'Наступне запитання'} →</button></footer></div>`;
  $('#nextQuestion').onclick=nextQuestion;
}
function toggleFullscreen(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();}
function startClock(){clearInterval(clockTimer);const update=()=>{const e=$('[data-clock]');if(e&&hostSession?.deadline)e.textContent=Math.max(0,Math.ceil((hostSession.deadline-Date.now())/1000));};update();clockTimer=setInterval(update,200);}

function joinPage(prefill=''){
  const saved=JSON.parse(localStorage.getItem('quizly-player-details')||'{}');
  app.innerHTML=`<div class="join"><form class="join-card" id="joinForm"><a class="brand" href="#/">${icon} Quizly</a><h1>Приєднатися</h1><label>PIN гри</label><input class="input" id="pin" inputmode="numeric" maxlength="6" required value="${html(prefill)}"><label>Ваше ім’я</label><input class="input" id="name" maxlength="28" autocomplete="name" required value="${html(saved.name||'')}"><label>Email або номер телефону</label><input class="input" id="contact" maxlength="80" required value="${html(saved.contact||'')}"><fieldset class="interest-field"><legend>Чим ви цікавитесь?</legend><div class="interest-grid">${[...defaultInterests,noInterest].map(o=>`<label class="interest-option"><input type="checkbox" name="interest" value="${html(o)}" ${(saved.interests||[]).includes(o)?'checked':''}><span>${html(o)}</span></label>`).join('')}</div></fieldset><p class="join-error" role="alert"></p><button class="btn accent" id="joinButton">Приєднатися →</button><small class="privacy-copy">Контакт передається через захищений P2P-канал і зберігається лише в зашифрованому архіві ведучого.</small></form></div>`;
  document.querySelectorAll('input[name="interest"]').forEach(input=>input.onchange=()=>{const inputs=[...document.querySelectorAll('input[name="interest"]')];if(input.value===noInterest&&input.checked)inputs.filter(x=>x!==input).forEach(x=>x.checked=false);if(input.value!==noInterest&&input.checked)inputs.find(x=>x.value===noInterest).checked=false;});
  $('#joinForm').onsubmit=event=>{event.preventDefault();const pin=$('#pin').value.trim(),name=validateName($('#name').value),contact=validateContact($('#contact').value),interests=[...document.querySelectorAll('input[name="interest"]:checked')].map(x=>x.value);if(!/^\d{6}$/.test(pin))return formError('Введіть шестизначний PIN гри','pin');if(!name)return formError('Введіть ім’я з літер, без цифр і нецензурних слів','name');if(!contact)return formError('Вкажіть коректний email або телефон','contact');if(!interests.length)return formError('Оберіть хоча б один інтерес');localStorage.setItem('quizly-player-details',JSON.stringify({name,contact,interests}));connectPlayer(pin,{name,contact,interests});};
}
function formError(message,field){$('.join-error').textContent=message;if(field)$('#'+field)?.focus();}
function connectPlayer(pin,registration){
  $('#joinButton').disabled=true;$('.join-error').textContent='З’єднуюся з браузером ведучого…';playerPeer?.destroy();const peer=new Peer(undefined,{debug:1});playerPeer=peer;
  const playerId=localStorage.getItem('quizly-player-id')||crypto.randomUUID();localStorage.setItem('quizly-player-id',playerId);
  peer.on('open',()=>{const c=peer.connect(peerPrefix+pin,{reliable:true,serialization:'json'});playerConnection=c;c.on('open',()=>c.send({type:'register',playerId,...registration}));c.on('data',m=>receivePlayerMessage(m,pin));c.on('close',()=>showPlayerConnectionLost(pin));c.on('error',()=>showPlayerConnectionLost(pin));});
  peer.on('error',error=>{if(error.type==='peer-unavailable'){if($('#joinButton'))$('#joinButton').disabled=false;return formError('Гру з таким PIN не знайдено. Перевірте PIN і вкладку ведучого.');}if($('#joinButton'))$('#joinButton').disabled=false;formError(peerError(error));});
}
function receivePlayerMessage(message,pin){
  if(message.type==='error'){if($('#joinButton'))$('#joinButton').disabled=false;if($('.join-error'))formError(message.message,message.field);else toast(message.message);return;}
  if(message.type==='registered')return;if(message.type==='answerAccepted')return showAccepted();if(message.type==='state')renderPlayer(message,pin);
}
function renderPlayer(state,pin){
  clearInterval(clockTimer);
  if(state.status==='lobby'){app.innerHTML=`<div class="join"><div class="join-card notice"><div class="big">✓</div><h1>Ви у грі</h1><p>Очікуємо, поки ведучий почне вікторину.</p></div></div>`;return;}
  if(state.status==='final')return renderFinal(state,false);
  const q=state.question;
  if(state.status==='reading'){app.innerHTML=`<div class="player-q compact-round"><div class="round-controls"><span class="tag">${state.questionIndex+1} / ${state.total}</span>${state.deadline?'<span class="timer" data-player-clock></span>':'<span class="tag">ВЕДУЧИЙ ЧИТАЄ</span>'}</div><main class="mobile-question"><h2>${html(q.text)}</h2>${questionArt(q)}<p class="round-caption">Варіанти з’являться після сигналу ведучого.</p></main></div>`;startPlayerClock(state.deadline);return;}
  if(state.status==='question'){app.innerHTML=`<div class="player-q compact-round"><div class="round-controls"><span class="tag">${state.questionIndex+1} / ${state.total}</span><span class="timer" data-player-clock></span><span class="tag">${state.ownScore} балів</span></div><h2>${html(q.text)}</h2>${questionArt(q)}<div class="player-answers">${q.answers.map((a,i)=>answerCard(a,a.text,'player-answer',i,state.answered)).join('')}</div><div class="accepted-overlay${state.answered?' visible':''}" id="accepted"><div>✓</div><b>Відповідь прийнято</b></div></div>`;document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-answer]').forEach(x=>x.disabled=true);playerConnection.send({type:'answer',answerIndex:Number(b.dataset.answer)});});startPlayerClock(state.deadline);return;}
  const ownId=localStorage.getItem('quizly-player-id'),sorted=[...state.players].sort((a,b)=>b.score-a.score),ownIndex=sorted.findIndex(p=>p.id===ownId);
  app.innerHTML=`<div class="player-q result-screen"><div class="notice"><div class="big">${state.roundPoints?'✓':'•'}</div><h1>${state.roundPoints?'+'+state.roundPoints+' балів':'Цього разу без балів'}</h1><p>Загальний рахунок: <b>${state.ownScore}</b></p><p>Поточне місце: <b>${ownIndex+1}</b></p></div><div class="player-result-answers">${q.answers.map(a=>answerCard(a,a.text,'player-answer',undefined,false,a.correct)).join('')}</div><p class="round-caption">Очікуємо наступне запитання…</p></div>`;
}
function showAccepted(){const e=$('#accepted');if(e)e.classList.add('visible');}
function startPlayerClock(deadline){const update=()=>{const e=$('[data-player-clock]');if(e&&deadline)e.textContent=Math.max(0,Math.ceil((deadline-Date.now())/1000));};update();clockTimer=setInterval(update,200);}
function showPlayerConnectionLost(pin){app.innerHTML=`<div class="join"><div class="join-card notice"><div class="big">⌁</div><h1>Зв’язок із ведучим втрачено</h1><p>Перевірте інтернет і переконайтеся, що вкладка ведучого відкрита.</p><a class="btn accent" href="#/join/${pin}">Спробувати знову</a></div></div>`;}
function renderFinal(state,hostMode){
  const ownId=hostMode?null:localStorage.getItem('quizly-player-id'),sorted=[...state.players].sort((a,b)=>b.score-a.score),ownIndex=sorted.findIndex(p=>p.id===ownId);
  app.innerHTML=`<div class="host"><header class="host-head"><div class="brand">${icon} Quizly</div>${hostMode?'<a class="btn secondary" href="#/dashboard">До кабінету</a>':''}</header><main class="leaderboard"><div class="notice"><div class="big">🏆</div><h1>Фінальний рейтинг</h1>${ownIndex>=0?`<p>Ваше місце — <b>${ownIndex+1}</b></p>`:''}${hostMode?'<button class="btn mint" id="finalExport">Завантажити приватний CSV</button>':''}</div>${sorted.map((p,i)=>`<div class="rank${i===ownIndex?' own-rank':''}"><b>${i+1}</b><span>${html(p.name)}${i===ownIndex?' <small>Ви</small>':''}</span><b>${p.score}</b></div>`).join('')}</main></div>`;
  if(hostMode)$('#finalExport').onclick=()=>askArchivePassword('export');if(hostMode||(ownIndex>=0&&ownIndex<3))launchConfetti();
}
function launchConfetti(){const layer=document.createElement('div');layer.className='confetti-layer';for(let i=0;i<90;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=colors[i%colors.length];p.style.animationDelay=Math.random()*1.8+'s';p.style.animationDuration=2.2+Math.random()*2+'s';layer.append(p);}document.body.append(layer);setTimeout(()=>layer.remove(),6000);}

const blockedName=/(?:ху[йяєюиеі]|п[іи]зд|бля(?:д|т)|[єеё]ба[тнл]|їба[тнл]|мудак|гандон|довбойоб|долбо[её]б|fuck|shit|bitch|nigg[ea]r)/u;
const lookalikes=['aа','bв','cс','eе','hн','iі','kк','mм','oо','pр','tт','yу','xх'],cyrillicLetters=new Map(lookalikes.map(([a,b])=>[a,b])),latinLetters=new Map(lookalikes.map(([a,b])=>[b,a]));
function validateName(value){if(typeof value!=='string')return;const name=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(name.length>28||!/^\p{L}\p{M}*(?:[ ’'ʼ-]?\p{L}\p{M}*)+$/u.test(name))return;const normalized=name.toLowerCase().replace(/[^\p{L}]/gu,''),cyrillic=[...normalized].map(c=>cyrillicLetters.get(c)??c).join(''),latin=[...normalized].map(c=>latinLetters.get(c)??c).join(''),whole=/(?:^|[ ’'ʼ-])(?:сука|суки|сучка|бля|хер)(?=$|[ ’'ʼ-])/u;if(whole.test(name.toLowerCase())||[normalized,cyrillic,latin].some(t=>blockedName.test(t)||whole.test(t)))return;return name;}
function validateContact(value){const c=String(value||'').trim(),phone=/^\+?[\d\s()\-]+$/.test(c)&&/^\d{9,15}$/.test(c.replace(/\D/g,'')),email=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);return c.length<=80&&(phone||email)?c:undefined;}
function normalizeInterests(values){const allowed=new Set([...defaultInterests,noInterest]),clean=[...new Set((Array.isArray(values)?values:[]).filter(v=>allowed.has(v)))];return clean.includes(noInterest)?[noInterest]:clean.slice(0,8);}
function peerError(error){return ({'browser-incompatible':'Цей браузер не підтримує WebRTC.','network':'Не вдалося зв’язатися із сервісом P2P.','server-error':'Сервіс P2P тимчасово недоступний.','ssl-unavailable':'Для P2P потрібне захищене HTTPS-з’єднання.'})[error?.type]||'Помилка P2P-з’єднання. Спробуйте ще раз.';}
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
async function savePlayerRecord(player){if(!archiveKey||!hostSession)return;const record={joinedAt:new Date().toISOString(),quiz:hostSession.quiz.title,pin:hostSession.pin,name:player.name,contact:player.contact,interests:player.interests,score:player.score},encrypted=await encryptValue(archiveKey,record);await idbPut('records',{id:hostSession.id+':'+player.id,...encrypted});}
async function downloadArchive(key){
  const encrypted=await idbAll('records'),records=await Promise.all(encrypted.map(x=>decryptValue(key,x)));records.sort((a,b)=>b.joinedAt.localeCompare(a.joinedAt));const rows=[['Дата','Вікторина','PIN','Ім’я','Контакт','Інтереси','Бали'],...records.map(r=>[r.joinedAt,r.quiz,r.pin,r.name,r.contact,r.interests.join('; '),r.score])],csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='quizly-private-contacts-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function csvCell(value){const text=String(value??''),safe=/^\s*[=+\-@\t\r\n]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';}

async function route(){
  const hash=location.hash||'#/';
  if(hash.startsWith('#/host/')){if(hostSession)renderHost();else showFatal('Сесію ведучого втрачено після перезавантаження вкладки. Створіть нову гру.');return;}
  if(hash.startsWith('#/join/'))return joinPage(hash.split('/')[2]||'');
  if(hash==='#/join')return joinPage();
  if(hash==='#/dashboard')return dashboard();
  home();
}
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',event=>{if(hostSession&&hostSession.status!=='final'){event.preventDefault();event.returnValue='';}});
loadQuizzes().then(route).catch(error=>showFatal(error.message));

