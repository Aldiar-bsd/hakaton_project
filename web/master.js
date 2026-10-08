/* Allur: «Панель мастера» — наряды с таймером и прогрессом, инциденты и отклонения, окно выдачи наряда с вариантами работ.
   Задачи из документа с данными завода появляются здесь сами (метка «Из документа»). Выполнение наряда реально влияет на станок. */
(()=>{
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const jp=async(u,b,m='POST')=>{const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.detail)||('Ошибка '+r.status));return j};
const icons=()=>{try{ic()}catch(e){}};
const hhmm=ts=>new Date(ts*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const dm=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString([], {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};

let LIVE={now:Date.now()/1000,scale:60,orders:[]},SKEW=0,TPL=null,sig='',flt='all',grp='st',ALERTS=[],DOWN=[],showDone=true,LOADED=false;
const PRI={high:'Срочный',med:'Обычный',low:'Низкий'},KIND={repair:'Ремонт',maintenance:'Обслуживание',quality:'Качество',plan:'План',other:'Работа'};
const SRC={docx:'Из документа',auto:'Авария (авто)',manual:''};
const nowS=()=>Date.now()/1000+SKEW;
const progOf=o=>o.status=='done'?1:o.status=='work'&&o.started_ts?Math.min(1,((nowS()-o.started_ts)/60*LIVE.scale)/o.est_min):0;
const late=o=>o.status!='done'&&o.due&&new Date(o.due)<new Date();

/* ------------------------------------------------------------ стили */
const css=document.createElement('style');
css.textContent=`
#t-master>*:not(#mst-root){display:none!important}
#mst-root{display:flex;flex-direction:column;gap:14px;min-width:0}
.mst-top{flex-direction:row!important;align-items:center;gap:10px;flex-wrap:wrap}.mst-top .chipx{font-size:12.5px;padding:4px 12px}.mst-top .sp{flex:1}
.mst-note{font-size:12px;color:var(--mut)}
.mst-lay{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px;align-items:start}
.mst-inc{gap:8px!important}.mst-inc h2{font-size:14px;margin:0}.mst-inc ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mst-inc li{padding:9px 10px;border:1px solid var(--ln);border-radius:10px;background:var(--p2);font-size:12.5px;display:flex;flex-direction:column;gap:6px}
.mst-inc li.crit{border-color:var(--crit)}.mst-inc li .t{display:flex;gap:6px;align-items:center}.mst-inc li .btn{padding:4px 10px;font-size:12px;align-self:flex-start}
.mst-inc .sub{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
.mst-fl{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.mst-fl .chips{display:flex;gap:6px;flex-wrap:wrap}
.mst-fl .chips button{border:1px solid var(--ln);background:var(--p);color:var(--mut);border-radius:99px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer}.mst-fl .chips button.on{border-color:var(--ac);color:var(--ac);background:var(--acs)}
.mst-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}.mst-board.two{grid-template-columns:repeat(2,minmax(0,1fr))}.mst-top button.chipx{cursor:pointer;font:inherit;font-size:12.5px}
.mst-col{background:var(--p2);border:1px solid var(--ln);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px;min-height:120px}
.mst-col h3{margin:0 0 2px;font-size:13px;display:flex;justify-content:space-between;align-items:center}.mst-col h3 em{font-style:normal;color:var(--mut);font-weight:500}
.oc{background:var(--p);border:1px solid var(--ln);border-left:3px solid var(--c,var(--ln));border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:7px}
.oc.high{--c:var(--crit)}.oc.med{--c:var(--ac2)}.oc.low{--c:var(--mut)}.oc.late{box-shadow:0 0 0 1px var(--crit)}
.oc .h{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--mut)}.oc .h .id{margin-left:auto}
.oc b{font-size:13px;line-height:1.35;font-weight:600}.oc .m{font-size:12px;color:var(--mut)}.oc .m.doc{color:var(--ac2)}
.oc .tag{font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:99px;background:var(--p2);border:1px solid var(--ln);color:var(--mut)}
.oc .tag.doc{color:var(--ac2);border-color:var(--ac2)}.oc .tag.auto{color:var(--crit);border-color:var(--crit)}.oc .tag.pri{color:var(--c)}.oc .tag.lt{color:var(--crit);border-color:var(--crit)}
.oc .bar{height:8px;border-radius:5px;background:var(--p2);overflow:hidden}.oc .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:5px;transition:width .9s linear}
.oc .pr{display:flex;justify-content:space-between;font-size:12px;font-variant-numeric:tabular-nums}.oc .pr b{font-size:12.5px;color:var(--ac)}
.oc .stp{font-size:11.5px;color:var(--warn)}
.oc .acts{display:flex;gap:6px;flex-wrap:wrap}.oc .acts .btn{padding:5px 10px;font-size:12px;flex:1;justify-content:center;min-width:90px}
.oc .acts .btn.go{background:var(--ac);border-color:var(--ac);color:var(--on);font-weight:600}
.mst-empty{color:var(--mut);font-size:12.5px;padding:8px 4px}
#ord2{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;place-items:center;z-index:1000;padding:16px}#ord2.on{display:grid}
#ord2 .box{background:var(--p);color:var(--ink);border:1px solid var(--ln);border-radius:16px;padding:20px;width:min(560px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
#ord2 h3{margin:0;font-size:16px}#ord2 label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--mut)}#ord2 label input,#ord2 label select{width:100%;color:var(--ink)}
#ord2 .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}#ord2 .chk{flex-direction:row!important;align-items:center;gap:8px!important;color:var(--ink)!important;font-size:12.5px!important}#ord2 .chk input{width:auto}
#ord2 .hint{font-size:12px;color:var(--mut);line-height:1.5;background:var(--p2);border-radius:10px;padding:8px 10px}#ord2 .msg{font-size:12.5px;min-height:16px;color:var(--crit)}
@media(max-width:1100px){.mst-lay{grid-template-columns:1fr}.mst-board{grid-template-columns:1fr}}`;
document.head.appendChild(css);

const root=document.createElement('div');root.id='mst-root';$('t-master').appendChild(root);
root.innerHTML=`<div class="g mst-top" id="mst-sum"></div><div class="mst-lay"><div class="g mst-inc" id="mst-inc"></div><div style="display:flex;flex-direction:column;gap:10px;min-width:0"><div class="mst-fl" id="mst-fl"></div><div class="mst-board" id="mst-board"></div></div></div>`;

/* ------------------------------------------------------------ данные */
async function load(){
  try{const t0=Date.now()/1000,j=await (await fetch('/api/orders/live')).json();SKEW=j.now-(t0+Date.now()/1000)/2;LIVE=j;LOADED=true;draw()}catch(e){}
}
async function loadTpl(){try{TPL=await (await fetch('/api/order-templates')).json()}catch(e){}}
async function loadAlerts(){try{const c=await (await fetch('/api/case')).json();ALERTS=c.alerts||[];DOWN=c.downtime||[]}catch(e){}}

/* ------------------------------------------------------------ отрисовка */
function card(o){
  const p=progOf(o),pc=Math.round(p*100),dev=o.device_id?(typeof dn=='function'&&DN[o.device_id]?dn(o.device_id):o.device_id):'без станка';
  const lt=late(o),src=SRC[o.source]||'';
  let mid='',acts='';
  if(o.status=='work'){
    const el=p*o.est_min,rem=Math.max(0,o.est_min-el);
    mid=`<div class="bar"><i style="width:${pc}%"></i></div><div class="pr"><b data-pc>${pc}%</b><span data-rem>идёт ${el.toFixed(0)} мин · осталось ~${rem.toFixed(0)} мин</span></div>${o.stops?'<div class="stp">⏸ станок остановлен на время работ</div>':''}`;
    acts=`<button class="btn" data-a="done">✓ Завершить</button><button class="btn" data-a="new">↺ В очередь</button>`;
  }else if(o.status=='new'){
    mid=`<div class="m">План: ${o.est_min} мин · срок до ${E(dm(o.due))}${o.stops?' · станок остановится':''}${o.fixes?' · устранит неисправность':''}</div>`;
    acts=`<button class="btn go" data-a="work">▶ Взять в работу</button><button class="btn" data-a="del" title="Удалить">✕</button>`;
  }else{
    mid=`<div class="m">✓ Выполнен за ${o.est_min} мин${o.done_ts?' · '+hhmm(o.done_ts):''}</div><div class="bar"><i style="width:100%"></i></div>`;
    acts=`<button class="btn" data-a="new" title="Вернуть наряд в колонку «Новые»">↺ Вернуть в новые</button>`;
  }
  return `<div class="oc ${o.priority} ${lt?'late':''}" data-id="${o.id}"><div class="h"><span class="tag pri">${PRI[o.priority]||''}</span><span class="tag">${KIND[o.kind]||'Работа'}</span>${src?`<span class="tag ${o.source=='docx'?'doc':'auto'}">${src}</span>`:''}${lt?'<span class="tag lt">Просрочен</span>':''}<span class="id">#${o.id}</span></div>
<b>${E(o.title)}</b>${o.note?`<div class="m doc">${E(o.note)}</div>`:''}<div class="m">Станок: ${E(dev)} · ${E(o.assignee||'')}</div>${mid}${acts?`<div class="acts">${acts}</div>`:''}</div>`;
}
const pass=o=>flt=='all'||(flt=='high'&&o.priority=='high'&&o.status!='done')||(flt=='late'&&late(o))||(flt=='docx'&&o.source=='docx');
function draw(){
  if(!L)return;
  const O=LIVE.orders,n=s=>O.filter(o=>o.status==s).length,docx=O.filter(o=>o.source=='docx').length;
  const s=JSON.stringify([O.map(o=>[o.id,o.status,o.assignee,o.priority,o.title]),flt,grp,tabK=='master',showDone]);
  $('mst-sum').innerHTML=`<span class="chipx" style="--c:var(--ac2)">Новые: ${n('new')}</span><span class="chipx" style="--c:var(--warn)">В работе: ${n('work')}</span><button class="chipx" style="--c:var(--ac)" data-sd title="Показать / скрыть выполненные">Выполнено: ${n('done')} ${showDone?'▴':'▾'}</button>${n('done')?'<button class="btn" data-clr style="padding:4px 10px;font-size:12px">Очистить выполненные</button>':''}<span class="chipx" style="--c:var(--crit)">Просрочено: ${O.filter(late).length}</span><span class="chipx" style="--c:var(--ac2)">Из документа: ${docx}</span><span class="sp"></span>
<span class="mst-note">Время работ ускорено ×${LIVE.scale}: 30 мин работ ≈ ${(30/LIVE.scale*60).toFixed(0)} сек</span><button class="btn pri" id="mst-new"><i data-lucide="plus"></i>Выдать наряд</button>`;
  $('mst-fl').innerHTML=`<div class="chips">${[['all','Все'],['high','Срочные'],['late','Просроченные'],['docx','Из документа']].map(([k,l])=>`<button data-f="${k}" class="${flt==k?'on':''}">${l}</button>`).join('')}</div><div class="chips" style="margin-left:auto">${[['st','По статусу'],['cr','По бригадам']].map(([k,l])=>`<button data-g="${k}" class="${grp==k?'on':''}">${l}</button>`).join('')}</div>`;
  drawInc(O);
  if(s!==sig){sig=s;
    const list=O.filter(pass).sort((a,b)=>({high:0,med:1,low:2}[a.priority]-{high:0,med:1,low:2}[b.priority])||a.id-b.id);
    const vis=showDone?list:list.filter(o=>o.status!='done');
    const cols=grp=='st'?[['Новые',vis.filter(o=>o.status=='new')],['В работе',vis.filter(o=>o.status=='work')],...(showDone?[['Выполнено',vis.filter(o=>o.status=='done').slice(-12)]]:[])]
      :(TPL?TPL.crews:[...new Set(O.map(o=>o.assignee))]).map(c=>[c,vis.filter(o=>o.assignee==c)]);
    $('mst-board').className='mst-board'+(grp=='st'&&!showDone?' two':'');
    if(!O.length){      // доска пуста: не оставляем пустой экран — объясняем и предлагаем действия
      $('mst-board').className='mst-board two';
      $('mst-board').innerHTML=`<div class="mst-col" style="grid-column:1/-1;align-items:flex-start"><h3>${LOADED?'Нарядов пока нет':'Загрузка нарядов…'}</h3>${LOADED?`<div class="mst-empty">Наряды появляются из документа с данными завода (простои, брак, план), создаются автоматически при аварии или вручную.</div><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-sync>Загрузить задачи из документа</button><button class="btn" id="mst-new2">Выдать наряд</button></div>`:''}</div>`;
    }else
    $('mst-board').innerHTML=cols.map(([t,c])=>`<div class="mst-col"><h3>${E(t)}<span style="display:flex;gap:8px;align-items:center">${t=='Выполнено'&&c.length?'<button class="btn" data-allnew style="padding:2px 9px;font-size:11.5px" title="Вернуть все выполненные наряды в «Новые»">↺ Все в новые</button>':''}<em>${c.length}</em></span></h3>${c.map(card).join('')||'<div class="mst-empty">Пусто</div>'}</div>`).join('');
  }
  const b=$('nb-master');if(b){const k=n('new')+n('work');b.textContent=k;b.classList.toggle('on',k>0)}
  icons();
}
function drawInc(O){
  const devs=(LM&&LM.devices)||[],bad=devs.filter(d=>d.status!='OK');
  const li=bad.map(d=>{const open=O.find(o=>o.device_id==d.device_id&&o.status!='done'&&(o.kind=='repair'||o.source=='auto'));
    return `<li class="${d.status=='CRITICAL'?'crit':''}"><div class="t"><i class="dot ${d.status.toLowerCase()}"></i><b>${E(dn(d.device_id))}</b></div><span>${d.status=='CRITICAL'?'Авария':'Предупреждение'} · ${tf(d.temperature)} · вибр. ${d.vibration} g</span>${open?`<span class="mst-note">Наряд #${open.id}: ${open.status=='work'?'в работе '+Math.round(progOf(open)*100)+'%':'ждёт, взять в работу'}</span>`:`<button class="btn" data-inc="${d.device_id}">Создать наряд</button>`}</li>`}).join('');
  $('mst-inc').innerHTML=`<h2>Инциденты и отклонения</h2><div class="sub">Сейчас на линии</div><ul>${li||'<li><span class="mut">Аварий и предупреждений нет</span></li>'}</ul><div class="sub">Простои из документа → наряды</div><ul>${DOWN.map(x=>{const o=O.find(q=>q.source=='docx'&&q.title.includes(x.equipment)&&q.title.includes(x.reason));
      const st=!o?'':o.status=='work'?`в работе ${Math.round(progOf(o)*100)}%`:o.status=='done'?'выполнен':'ждёт';return `<li><span><b>${E(x.equipment)}</b> · ${E(x.reason)}</span><span class="mst-note">${E(x.date)} · ${x.min} мин${o?` · наряд #${o.id}: ${st}`:''}</span></li>`}).join('')||'<li><span class="mut">Нет данных</span></li>'}</ul>
<div class="sub">Отклонения по данным завода</div><ul>${ALERTS.map(a=>`<li><span>${E(a)}</span></li>`).join('')||'<li><span class="mut">Отклонений нет</span></li>'}</ul>`;
}
function tickProg(){      // каждую секунду двигаем полосы прогресса, не перерисовывая карточки
  if(tabK!='master')return;
  LIVE.orders.filter(o=>o.status=='work').forEach(o=>{const c=document.querySelector(`.oc[data-id="${o.id}"]`);if(!c)return;const p=progOf(o),el=p*o.est_min;
    c.querySelector('.bar i').style.width=(p*100)+'%';c.querySelector('[data-pc]').textContent=Math.round(p*100)+'%';c.querySelector('[data-rem]').textContent=`идёт ${el.toFixed(0)} мин · осталось ~${Math.max(0,o.est_min-el).toFixed(0)} мин`});
}

/* ------------------------------------------------------------ действия */
root.addEventListener('click',async e=>{
  const f=e.target.closest('[data-f]');if(f){flt=f.dataset.f;sig='';draw();return}
  const g=e.target.closest('[data-g]');if(g){grp=g.dataset.g;sig='';draw();return}
  if(e.target.closest('#mst-new')||e.target.closest('#mst-new2')){openOrder();return}
  if(e.target.closest('[data-allnew]')){const ids=LIVE.orders.filter(o=>o.status=='done').map(o=>o.id);
    try{for(const id of ids)await jp('/api/orders/'+id,{status:'new'},'PATCH')}catch(x){alert(x.message)}
    try{CTL.refresh()}catch(x){}sig='';load();return}
  if(e.target.closest('[data-sync]')){try{await jp('/api/orders/sync',{})}catch(x){alert(x.message)}sig='';load();return}
  if(e.target.closest('[data-sd]')){showDone=!showDone;sig='';draw();return}
  if(e.target.closest('[data-clr]')){if(confirm('Убрать все выполненные наряды из доски?')){try{await fetch('/api/orders?status=done',{method:'DELETE'})}catch(x){}sig='';load()}return}
  const inc=e.target.closest('[data-inc]');if(inc){openOrder(inc.dataset.inc,'repair');return}
  const a=e.target.closest('[data-a]');if(!a)return;const id=+a.closest('.oc').dataset.id,act=a.dataset.a;
  try{if(act=='del'){if(!confirm('Удалить наряд #'+id+'?'))return;await fetch('/api/orders/'+id,{method:'DELETE'})}else await jp('/api/orders/'+id,{status:act},'PATCH');
    try{CTL.refresh()}catch(x){}}catch(x){alert(x.message)}
  sig='';load();
});

/* ------------------------------------------------------------ окно «Выдать наряд» */
const ov=document.createElement('div');ov.id='ord2';ov.innerHTML='<div class="box" id="ord2-box"></div>';document.body.appendChild(ov);
ov.onclick=e=>{if(e.target===ov)ov.classList.remove('on')};
function tplFor(dev){return (TPL?TPL.templates:[]).filter(t=>t.devices=='*'||(dev&&t.devices.includes(dev)))}
async function openOrder(dev,tplId){
  if(!TPL)await loadTpl();if(!TPL)return alert('Не удалось загрузить варианты работ');
  const box=$('ord2-box'),devs=L.devices.map(d=>d.id);
  box.innerHTML=`<h3>Выдать наряд</h3>
<label>Станок<select id="o-dev"><option value="">— общий наряд (без станка) —</option>${devs.map(d=>`<option value="${d}">${E(dn(d))}</option>`).join('')}</select></label>
<label>Что нужно сделать<select id="o-tpl"></select></label>
<label id="o-ctw" style="display:none">Описание работы (своё)<input id="o-title" placeholder="Например: заменить прокладку на гидроцилиндре" autocomplete="off"></label>
<div class="row"><label>Плановое время, мин<input id="o-est" type="number" min="1" value="30"></label><label>Срок выполнения, часов<input id="o-due" type="number" min="1" value="8"></label></div>
<div class="row"><label>Бригада<select id="o-crew">${TPL.crews.map(c=>`<option>${E(c)}</option>`).join('')}</select></label><label>Приоритет<select id="o-pri"><option value="high">Срочный</option><option value="med" selected>Обычный</option><option value="low">Низкий</option></select></label></div>
<label class="chk"><input type="checkbox" id="o-stops"> Остановить станок на время работ</label><label class="chk"><input type="checkbox" id="o-fixes"> После работ станок считается исправным (устранить неисправность)</label>
<div class="hint">Время работ ускорено ×${TPL.scale} для демонстрации: после «Взять в работу» появится таймер и прогресс. Когда наряд дойдёт до 100 %, он завершится сам: станок запустится${''} (а неисправность будет устранена, если отмечено).</div>
<div class="msg" id="o-msg"></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" id="o-cancel">Отмена</button><button class="btn" id="o-save">Выдать</button><button class="btn pri" id="o-start">Выдать и сразу начать</button></div>`;
  const sel=$('o-dev'),ts=$('o-tpl');
  const fillTpl=()=>{const d=sel.value,list=tplFor(d),own=list.filter(t=>t.devices!='*'),gen=list.filter(t=>t.devices=='*');
    ts.innerHTML=(own.length?`<optgroup label="Для этого станка">${own.map(t=>`<option value="${t.id}">${E(t.title)} · ${t.est} мин</option>`).join('')}</optgroup>`:'')+`<optgroup label="Общие работы">${gen.map(t=>`<option value="${t.id}">${E(t.title)} · ${t.est} мин</option>`).join('')}</optgroup><optgroup label="Другое"><option value="custom">✎ Своё описание…</option></optgroup>`;applyTpl()};
  const applyTpl=()=>{const t=(TPL.templates.find(x=>x.id==ts.value));$('o-ctw').style.display=ts.value=='custom'?'':'none';
    if(t){$('o-est').value=t.est;$('o-stops').checked=!!t.stops;$('o-fixes').checked=!!t.fixes}else{$('o-stops').checked=false;$('o-fixes').checked=false}
    const d=sel.value;if(d&&TPL.crews.length){const i={cnc_milling_05:0,stamp_press_04:1,laser_grind_07:0,weld_robot_01:0,paint_spray_02:2,assembly_line_03:1,quality_scan_06:2}[d];if(i!=null)$('o-crew').selectedIndex=i}};
  sel.onchange=fillTpl;ts.onchange=applyTpl;
  if(dev)sel.value=dev;fillTpl();if(tplId&&[...ts.options].some(o=>o.value==tplId)){ts.value=tplId;applyTpl()}
  const go=async start=>{const custom=ts.value=='custom',t=TPL.templates.find(x=>x.id==ts.value),title=custom?$('o-title').value.trim():t.title+(sel.value?'':'');
    if(!title){$('o-msg').textContent='Опишите, что нужно сделать';return}
    try{await jp('/api/orders',{title,device_id:sel.value||null,assignee:$('o-crew').value,priority:$('o-pri').value,due_hours:+$('o-due').value||8,est_min:+$('o-est').value||30,kind:custom?'other':t.kind,stops:$('o-stops').checked,fixes:$('o-fixes').checked,start});
      ov.classList.remove('on');sig='';await load();try{CTL.refresh()}catch(x){}
      if(tabK!='master'){try{document.querySelector('[data-tab=master]').click()}catch(x){}}}catch(x){$('o-msg').textContent=x.message}};
  $('o-cancel').onclick=()=>ov.classList.remove('on');$('o-save').onclick=()=>go(false);$('o-start').onclick=()=>go(true);
  ov.classList.add('on');
}
window.openOrder=openOrder;
// кнопка «Выдать наряд» в левом меню открывает это окно вместо старой формы
document.addEventListener('click',e=>{if(e.target.closest('#new')){e.stopImmediatePropagation();e.preventDefault();openOrder()}},true);

/* ------------------------------------------------------------ запуск */
const mb=document.querySelector('#nav [data-tab=master]');if(mb){const b=document.createElement('b');b.className='nb';b.id='nb-master';b.style.background='var(--ac2)';mb.appendChild(b)}
$('nav').addEventListener('click',e=>{if(e.target.closest('[data-tab=master]')){sig='';load();loadAlerts()}});
const _r=render;render=function(m){_r(m);try{if(tabK=='master')drawInc(LIVE.orders)}catch(e){}};
load();loadTpl();loadAlerts();setInterval(load,2000);setInterval(tickProg,1000);setInterval(loadAlerts,10000);
})();
