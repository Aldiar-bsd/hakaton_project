/* Allur: кнопка «Отчёт за смену», ИИ-чат, получатели Telegram. Подключается в конце index.html */
(()=>{
const G=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const api=async(u,o)=>{const r=await fetch(u,o);let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.detail)||('Ошибка '+r.status));return j};
const jp=(u,b,m='POST')=>api(u,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const icons=()=>{try{ic()}catch(e){try{lucide.createIcons()}catch(_){}}};

/* --- стили --- */
const css=document.createElement('style');
css.textContent=`
#rep-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;place-items:center;z-index:1000;padding:16px}
#rep-ov.on{display:grid}
#rep-box{background:var(--p);color:var(--ink);border:1px solid var(--ln);border-radius:16px;padding:20px;width:min(500px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
#rep-box h3{margin:0;font-size:16px}#rep-box h4{margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:600}
.xo{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--ln);border-radius:10px;cursor:pointer;margin-bottom:6px;background:var(--p2)}
.xo input{accent-color:var(--ac);margin:0}.xo small{color:var(--mut);margin-left:auto}
.xrow{display:flex;gap:8px;flex-wrap:wrap}.xrow .btn{flex:1;justify-content:center}
.xmsg{font-size:12px;min-height:16px}.xmsg.ok{color:var(--ac)}.xmsg.er{color:var(--crit)}
.xhint{font-size:12px;color:var(--mut);line-height:1.5}.xhint a{color:var(--ac2)}
#t-chat{flex-direction:column;min-height:0}#t-chat.on{display:flex}
.cw{display:flex;flex-direction:column;height:calc(100vh - 120px);max-width:820px;width:100%;margin:0 auto;gap:10px}
#cl{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:4px}
.cm{max-width:82%;padding:10px 13px;border-radius:14px;line-height:1.5;white-space:normal;word-break:break-word}
.cm.u{align-self:flex-end;background:var(--ac);color:var(--on);border-bottom-right-radius:4px}
.cm.a{align-self:flex-start;background:var(--p);border:1px solid var(--ln);border-bottom-left-radius:4px}
.cm.e{align-self:center;color:var(--crit);font-size:12px}
.ca{align-self:flex-start;display:flex;gap:6px;align-items:flex-start;max-width:82%;font-size:12px;color:var(--ac);background:var(--acs);border:1px solid var(--ln);border-radius:10px;padding:5px 10px}
.cc{display:flex;gap:6px;flex-wrap:wrap}.cc button{background:var(--p);border:1px solid var(--ln);color:var(--ink);border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:12px}
.cc button:hover{border-color:var(--ac);color:var(--ac)}
.ci{display:flex;gap:8px}.ci input{flex:1}
.sub{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--ln);flex-wrap:wrap}.sub:last-child{border:0}
.sub .nm{flex:1;min-width:140px}.sub .nm small{display:block;color:var(--mut)}
.bd{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--p2);color:var(--mut)}.bd.approved{background:var(--acs);color:var(--ac)}.bd.pending{color:var(--warn)}.bd.blocked{color:var(--crit)}
.sub .btn{padding:4px 10px;font-size:12px}
`;
document.head.appendChild(css);
try{Object.assign(T,{chat:'ИИ-ассистент|ЖИ-көмекші|AI assistant',subs_h:'Получатели отчётов (Telegram)|Есепті алушылар (Telegram)|Report recipients (Telegram)'})}catch(e){}

/* --- вкладка ИИ-чат --- */
const nav=G('nav'),setBtn=nav.querySelector('[data-tab=set]');
const nb=document.createElement('button');nb.dataset.tab='chat';nb.innerHTML='<i data-lucide="message-square"></i><span data-i="chat"></span>';
nav.insertBefore(nb,setBtn);
const sec=document.createElement('section');sec.className='tab';sec.id='t-chat';
sec.innerHTML=`<div class="cw"><div id="cl"></div>
<div class="cc" id="cq"><button>Как дела на заводе?</button><button>Что с качеством и браком?</button><button>Если станок горячее 70°C — притормози линию до остывания до 60°C</button><button>Останови пресс</button></div>
<div class="ci"><input id="cin" placeholder="Спросите про завод…" autocomplete="off"><button class="btn pri" id="csd">Отправить</button></div></div>`;
document.querySelector('main').appendChild(sec);
const hist=[];
const fmtMsg=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
function addAct(a){const d=document.createElement('div');d.className='ca';d.innerHTML='<i data-lucide="zap"></i><span>'+esc(a.result)+'</span>';G('cl').appendChild(d);icons()}
function addMsg(cls,text){const d=document.createElement('div');d.className='cm '+cls;d.innerHTML=fmtMsg(text);G('cl').appendChild(d);G('cl').scrollTop=1e9;return d}
addMsg('a','Привет! Я ИИ-агент завода: отвечаю по данным и могу управлять линией. Например: «если станок горячее 70°C — притормози линию, пока не остынет до 60», «останови пресс», «поставь окраску на 80%».');
let busy=false;
async function ask(q){
  q=(q||'').trim();if(!q||busy)return;busy=true;G('cin').value='';
  addMsg('u',q);hist.push({role:'user',content:q});const w=addMsg('a','…');
  try{const j=await jp('/api/chat',{messages:hist});hist.push({role:'assistant',content:j.reply});(j.actions||[]).forEach(addAct);w.remove();addMsg('a',j.reply);try{window.CTL&&CTL.refresh()}catch(e){}}
  catch(e){hist.pop();w.className='cm e';w.textContent='⚠ '+e.message}
  busy=false;G('cl').scrollTop=1e9;
}
G('csd').onclick=()=>ask(G('cin').value);
G('cin').onkeydown=e=>{if(e.key==='Enter')ask(G('cin').value)};
G('cq').onclick=e=>{if(e.target.tagName==='BUTTON')ask(e.target.textContent)};

/* --- модалка «Отчёт за смену» --- */
const hb=document.createElement('button');hb.className='btn';hb.id='rep-open';
hb.innerHTML='<i data-lucide="file-text"></i><span>Отчёт за смену</span>';
document.querySelector('.hc').prepend(hb);
const ov=document.createElement('div');ov.id='rep-ov';ov.innerHTML='<div id="rep-box"></div>';document.body.appendChild(ov);
ov.onclick=e=>{if(e.target===ov)ov.classList.remove('on')};
let SUBS=[],STAT={};
const who=s=>esc(s.name)+(s.kind==='group'?' <small>группа</small>':s.username?' <small>@'+esc(s.username)+'</small>':'');
async function openRep(){
  const box=G('rep-box');box.innerHTML='<h3>Загрузка…</h3>';ov.classList.add('on');
  try{
    const [sh,subs,st]=await Promise.all([api('/api/report/shifts'),api('/api/subscribers'),api('/api/status')]);
    SUBS=subs.filter(s=>s.status==='approved');STAT=st;
    const link=st.bot_username?`<a href="https://t.me/${esc(st.bot_username)}" target="_blank">@${esc(st.bot_username)}</a>`:'';
    box.innerHTML=`<h3>Отчёт за смену</h3>
<div><h4>Смена</h4>
<label class="xo"><input type="radio" name="rs" value="cur" checked><span>${esc(sh.cur.name)}</span><small>${esc(sh.cur.start)} → сейчас</small></label>
<label class="xo"><input type="radio" name="rs" value="prev"><span>${esc(sh.prev.name)}</span><small>${esc(sh.prev.start)} — ${esc(sh.prev.end.slice(-5))}</small></label></div>
<div><h4>Формат</h4><div class="xrow">
<label class="xo"><input type="checkbox" name="rf" value="pdf" checked>PDF</label>
<label class="xo"><input type="checkbox" name="rf" value="xlsx">Excel</label>
<label class="xo"><input type="checkbox" name="rf" value="docx">Word</label></div>
<label class="xo"><input type="checkbox" id="rai" ${st.ai?'checked':'disabled'}><span>Добавить резюме ИИ</span><small>${st.ai?'':'ИИ не настроен'}</small></label></div>
${st.bot_enabled===false?'':`<div><h4>Кому отправить в Telegram</h4>${SUBS.length?SUBS.map(s=>`<label class="xo"><input type="checkbox" name="rc" value="${s.chat_id}" checked><span>${who(s)}</span></label>`).join(''):
`<div class="xhint">${!st.token_set?'Токен бота не задан в файле .env.':!st.bot?'Бот не запущен — проверьте токен и интернет.':'Пока нет подтверждённых получателей.'}
${link?' Пусть человек напишет боту '+link+' команду /start, затем подтвердите его в Настройках (или в самом боте).':''}</div>`}</div>`}
<div class="xmsg" id="rmsg"></div>
<div class="xrow"><button class="btn" id="rdl"><i data-lucide="download"></i><span>Скачать</span></button>
${st.bot_enabled===false?'':`<button class="btn pri" id="rsd" ${SUBS.length&&st.bot?'':'disabled'}><i data-lucide="send"></i><span>Отправить</span></button>`}
<button class="btn" id="rcl">Закрыть</button></div>`;
    icons();
    const vals=n=>[...box.querySelectorAll(`[name=${n}]:checked`)].map(x=>x.value);
    const msg=(t,k)=>{const m=G('rmsg');m.textContent=t;m.className='xmsg '+(k||'')};
    G('rcl').onclick=()=>ov.classList.remove('on');
    G('rdl').onclick=()=>{const w=vals('rs')[0],f=vals('rf'),a=G('rai').checked?1:0;if(!f.length)return msg('Выберите формат','er');
      f.forEach((x,i)=>setTimeout(()=>{const l=document.createElement('a');l.href=`/api/report/download?shift=${w}&fmt=${x}&ai_summary=${a}`;l.download='';document.body.appendChild(l);l.click();l.remove()},i*500));
      msg('Файл формируется, загрузка начнётся автоматически…','ok')};
    if(G('rsd'))G('rsd').onclick=async()=>{const w=vals('rs')[0],f=vals('rf'),c=vals('rc').map(Number);
      if(!f.length)return msg('Выберите формат','er');if(!c.length)return msg('Выберите получателей','er');
      G('rsd').disabled=true;msg('Формирую и отправляю…');
      try{const j=await jp('/api/report/send',{shift:w,formats:f,chat_ids:c,ai:G('rai').checked});
        msg(`Отправлено получателям: ${j.sent}`+(j.errors.length?` · ошибки: ${j.errors.map(e=>e.error).join('; ')}`:''),j.errors.length?'er':'ok')}
      catch(e){msg(e.message,'er')}G('rsd').disabled=false};
  }catch(e){box.innerHTML=`<h3>Не удалось загрузить</h3><div class="xmsg er">${esc(e.message)}</div><button class="btn" id="rcl">Закрыть</button>`;G('rcl').onclick=()=>ov.classList.remove('on')}
}
hb.onclick=openRep;

/* --- настройки: получатели отчётов --- */
const rsBtn=G('rs');
const blk=document.createElement('div');
blk.innerHTML=`<h2 data-i="subs_h"></h2><div class="g" style="padding:6px 16px"><div class="xhint" id="sinfo" style="padding:10px 0;border-bottom:1px solid var(--ln)"></div><div id="slist"></div></div>`;
rsBtn.parentNode.insertBefore(blk,rsBtn);
const lab={approved:'подтверждён',pending:'ожидает',blocked:'заблокирован'};
async function loadSubs(){
  try{
    const [subs,st]=await Promise.all([api('/api/subscribers'),api('/api/status')]);
    blk.style.display=st.bot_enabled===false?'none':'';
    const bl=st.bot?`Бот: <b>@${esc(st.bot_username)}</b> работает`:st.token_set?'Бот: <b>не запущен</b> (проверьте токен и интернет)':'Бот: <b>токен не задан</b> (файл .env)';
    G('sinfo').innerHTML=`${bl} · ИИ: <b>${st.ai?esc(st.provider):'не настроен'}</b><br>Получатель пишет боту <b>/start</b> и ждёт подтверждения здесь или в боте. Администратор: команда <b>/admin ПИН</b> в боте. Группа: добавьте бота и в группе напишите <b>/subscribe</b>.`;
    G('slist').innerHTML=subs.length?subs.map(s=>`<div class="sub" data-id="${s.chat_id}"><div class="nm">${who(s)}${s.is_admin?' <small>админ</small>':''}</div>
<span class="bd ${s.status}">${lab[s.status]||s.status}</span>
${s.status!=='approved'?'<button class="btn" data-a="ok">Подтвердить</button>':'<button class="btn" data-a="block">Заблокировать</button>'}
<button class="btn" data-a="al">${s.alerts?'🔔 тревоги':'🔕 тревоги'}</button><button class="btn" data-a="del">Удалить</button></div>`).join(''):'<div class="xhint" style="padding:12px 0">Получателей пока нет.</div>';
    G('slist').dataset.s=JSON.stringify(subs);
  }catch(e){G('sinfo').textContent='Не удалось загрузить: '+e.message}
}
G('slist').onclick=async e=>{
  const b=e.target.closest('button[data-a]');if(!b)return;const id=b.closest('.sub').dataset.id,a=b.dataset.a;
  const s=JSON.parse(G('slist').dataset.s).find(x=>x.chat_id==id);
  try{
    if(a==='ok')await jp('/api/subscribers/'+id,{status:'approved'},'PATCH');
    if(a==='block')await jp('/api/subscribers/'+id,{status:'blocked'},'PATCH');
    if(a==='al')await jp('/api/subscribers/'+id,{alerts:s.alerts?0:1},'PATCH');
    if(a==='del'&&confirm('Удалить получателя?'))await api('/api/subscribers/'+id,{method:'DELETE'});
  }catch(err){alert(err.message)}
  loadSubs();
};
nav.addEventListener('click',e=>{if(e.target.closest('[data-tab=set]'))loadSubs()});
setInterval(()=>{if(G('t-set').classList.contains('on'))loadSubs()},8000);
try{tr()}catch(e){}icons();
})();
