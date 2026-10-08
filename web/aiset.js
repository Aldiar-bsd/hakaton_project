/* Allur: подключение ИИ-агента в «Настройках» (провайдер, ключ, модель, проверка) и индикатор режима в чате.
   Ключ сохраняется на сервере в файле .env и больше никуда не отправляется; в интерфейсе виден только его конец. */
(()=>{
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const css=document.createElement('style');
css.textContent=`
.ai-box{display:flex;flex-direction:column;gap:10px;padding:6px 0}.ai-row{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center}
.ai-row label{color:var(--mut);font-size:12.5px}.ai-row input,.ai-row select{width:100%}
.ai-st{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ai-msg{font-size:12.5px;min-height:18px;line-height:1.5}.ai-msg.ok{color:var(--ac)}.ai-msg.er{color:var(--crit)}
.ai-hint{font-size:12px;color:var(--mut);line-height:1.55}.ai-hint a{color:var(--ac2)}
#ai-mode{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;padding:8px 12px;border:1px solid var(--ln);border-radius:10px;background:var(--p2)}
#ai-mode b{font-weight:600}#ai-mode .dot{flex:none}
.jq-chips{display:flex;flex-wrap:wrap;gap:5px}.jq-chips .btn{padding:4px 8px;font-size:11px}.jq-in{display:flex;gap:6px}.jq-in input{flex:1;min-width:0;font-size:12px;padding:6px 8px}
.jq-o{font-size:11.5px;line-height:1.45;color:var(--ink);background:var(--p2);border-radius:10px;padding:7px 9px;display:none;white-space:pre-wrap}
@media(max-width:700px){.ai-row{grid-template-columns:1fr}}`;
document.head.appendChild(css);

const NAMES={anthropic:'Claude (Anthropic)',gemini:'Gemini (Google)',ollama:'Ollama (локально)',none:'Без ИИ'};
let CFG=null;

/* ---- блок в настройках ---- */
const rs=$('rs');
const wrap=document.createElement('div');
wrap.innerHTML=`<h2>ИИ-агент</h2><div class="g"><div class="ai-box">
<div class="ai-st"><span class="chip" id="ai-chip">…</span><span class="mut" id="ai-sub" style="font-size:12px"></span></div>
<div class="ai-row"><label>Сервис</label><select id="ai-prov"><option value="anthropic">Claude (Anthropic)</option><option value="gemini">Gemini (Google, есть бесплатный)</option><option value="ollama">Ollama (на этом компьютере, без ключа)</option><option value="none">Без ИИ-сервиса (демо-режим)</option></select></div>
<div class="ai-row" id="ai-keyrow"><label>Ключ API</label><input type="password" id="ai-key" autocomplete="off" placeholder="вставьте ключ"></div>
<div class="ai-row"><label>Модель</label><input id="ai-model" placeholder="по умолчанию" autocomplete="off"></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="ai-save"><i data-lucide="plug-zap"></i><span>Сохранить и проверить</span></button><button class="btn" id="ai-clear"><i data-lucide="trash-2"></i><span>Удалить ключ</span></button></div>
<div class="ai-msg" id="ai-msg"></div>
<div class="ai-hint">Без ключа агент работает в демо-режиме: понимает команды и вопросы по ключевым словам («останови пресс», «как дела?»). С ключом подключается настоящий ИИ: он сам рассуждает и вызывает инструменты.
Ключ: Claude — <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>, Gemini (бесплатный тариф) — <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.
Ключ хранится только в файле .env на этом компьютере. Инструкцию агенту можно править в файле server/prompt.txt.</div></div></div>`;
rs.parentNode.insertBefore(wrap,rs);
const msg=(t,k)=>{const m=$('ai-msg');m.textContent=t;m.className='ai-msg '+(k||'')};

function paint(){
  if(!CFG)return;
  const live=CFG.configured;
  $('ai-chip').innerHTML=`<i class="dot ${live?'':'warning'}"></i>${live?'ИИ подключён: '+E(NAMES[CFG.provider]):'Демо-режим (ключ не подключён)'}`;
  $('ai-sub').textContent=live?`модель ${CFG.model}`:'агент работает по ключевым словам';
  if(document.activeElement!==$('ai-prov'))$('ai-prov').value=CFG.provider==='none'&&!CFG.configured?'anthropic':CFG.provider;
  $('ai-keyrow').style.display=$('ai-prov').value==='ollama'||$('ai-prov').value==='none'?'none':'';
  $('ai-key').placeholder=CFG.key_set?CFG.key_mask+' (сохранён, оставьте пустым чтобы не менять)':'вставьте ключ';
  if(document.activeElement!==$('ai-model'))$('ai-model').value=CFG.model&&CFG.model!==(CFG.defaults[CFG.provider]||'')?CFG.model:'';
  $('ai-model').placeholder=CFG.defaults[$('ai-prov').value]||'по умолчанию';
  const m=$('ai-mode');if(m){m.innerHTML=live?`<i class="dot"></i><b>ИИ-агент:</b> ${E(NAMES[CFG.provider])} · ${E(CFG.model)}`:`<i class="dot warning"></i><b>Демо-режим:</b> агент понимает команды по ключевым словам. <a href="#" id="ai-go" style="color:var(--ac2)">Подключить ИИ</a>`}
}
async function load(){try{CFG=await (await fetch('/api/ai/config')).json();paint()}catch(e){}}
$('ai-prov').onchange=()=>{$('ai-model').value='';paint()};
$('ai-save').onclick=async()=>{
  const prov=$('ai-prov').value;msg('Проверяю подключение…');
  try{const r=await fetch('/api/ai/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:prov,api_key:$('ai-key').value,model:$('ai-model').value})});
    const j=await r.json();if(!r.ok)throw new Error(j.detail||('Ошибка '+r.status));
    $('ai-key').value='';CFG=j;paint();
    if(j.ok)msg(prov==='none'?'Сохранено: демо-режим.':'✓ Подключено. Ответ ИИ: «'+(j.reply||'ok')+'»','ok');else msg('Не удалось подключиться: '+(j.error||'ошибка')+' Проверьте ключ.','er')}
  catch(e){msg(e.message,'er')}};
$('ai-clear').onclick=async()=>{
  try{const r=await fetch('/api/ai/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'none',clear_key:true,model:''})});CFG=await r.json();paint();msg('Ключ удалён, включён демо-режим.','ok')}catch(e){msg(e.message,'er')}};

/* ---- Панель жюри: ИИ-ассистент, который симулирует проблемы ---- */
const dtb=document.querySelector('#dt .dtb');
if(dtb){const jq=document.createElement('div');jq.id='jq';jq.style.cssText='display:flex;flex-direction:column;gap:7px';
  jq.innerHTML=`<h2>ИИ-ассистент жюри</h2><div class="jq-chips">${[['Перегрев сварки','создай перегрев на сварке'],['Вибрация пресса','вибрация на прессе создай'],['Поломка конвейера','сломай сборочный конвейер'],['Случайная авария','случайная авария'],['Убрать проблемы','убери все проблемы']].map(([l,q])=>`<button class="btn" data-q="${E(q)}">${l}</button>`).join('')}</div>
<div class="jq-in"><input id="jq-i" placeholder="Например: создай аварию на сварке" autocomplete="off"><button class="btn pri" id="jq-s" aria-label="Отправить">→</button></div><div class="jq-o" id="jq-o"></div>`;
  dtb.appendChild(jq);
  const out=$('jq-o');
  const ask=async q=>{q=(q||'').trim();if(!q)return;out.style.display='block';out.textContent='…';$('jq-i').value='';
    try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:q}]})});const j=await r.json();
      if(!r.ok)throw new Error(j.detail||('Ошибка '+r.status));out.textContent=((j.actions||[]).map(a=>'⚡ '+a.result).join('\n')||j.reply).replace(/\n\n\(демо-режим[\s\S]*$/,'');
      try{CTL.refresh()}catch(e){}}catch(e){out.textContent='⚠ '+e.message}};
  jq.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(b)ask(b.dataset.q);if(e.target.closest('#jq-s'))ask($('jq-i').value)});
  $('jq-i').addEventListener('keydown',e=>{if(e.key==='Enter')ask($('jq-i').value)});
}

/* ---- индикатор режима в чате ---- */
const cw=document.querySelector('#t-chat .cw');
if(cw){const m=document.createElement('div');m.id='ai-mode';cw.insertBefore(m,cw.firstChild)}
document.addEventListener('click',e=>{if(e.target.id==='ai-go'){e.preventDefault();document.querySelector('[data-tab=set]').click();setTimeout(()=>$('ai-prov').scrollIntoView({block:'center'}),150)}});
$('nav').addEventListener('click',e=>{if(e.target.closest('[data-tab=chat],[data-tab=set]'))load()});
load();try{ic()}catch(e){}
})();
