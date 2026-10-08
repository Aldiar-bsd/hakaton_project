/* Allur: перенос правой панели и «Панели жюри» в левое меню, вкладки «Ремонт и состояние» и «Прогноз»,
   мониторинг ключевых показателей на дашборде. Подключается после index.html / extra.js / line.js. */
(()=>{
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const jp=async(u,b,m='POST')=>{const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.detail)||('Ошибка '+r.status));return j};
const get=u=>fetch(u).then(r=>r.json());
const icons=()=>{try{ic()}catch(e){}};
const P=(v,d=0)=>(v*100).toFixed(d)+'%';

/* ------------------------------------------------------------ тексты */
Object.assign(T,{
 repair:'Ремонт и состояние|Жөндеу және күй|Repair & status',fc:'Прогноз и узкие места|Болжам және тар жерлер|Forecast & bottlenecks',node:'Данные станка|Станок деректері|Machine data',
 jury:'Панель жюри|Қазылар тақтасы|Jury panel',
 mon_h:'Мониторинг ключевых показателей|Негізгі көрсеткіштерді бақылау|Key indicators',
 m_perf:'Производительность|Өнімділік|Productivity',m_load:'Загрузка станков|Станоктар жүктемесі|Machine load',m_down:'Простои|Тоқтап тұру|Downtime',m_qual:'Качество|Сапа|Quality',m_oee:'OEE завода|Зауыт OEE|Plant OEE',
 m_cars:'Выпущено автомобилей|Шығарылған автокөлік|Cars produced',
 m_goal:'цель|мақсат|target',m_min:'мин|мин|min',m_fc:'Прогноз|Болжам|Forecast',
 r_ok:'Исправен|Дұрыс|OK',r_warn:'Внимание|Назар|Warning',r_crit:'АВАРИЯ|АПАТ|FAULT',r_stop:'Остановлен|Тоқтатылды|Stopped',r_slow:'Замедлен|Баяу|Slowed',
 r_fix:'Починить|Жөндеу|Repair',r_fixall:'Починить всё|Бәрін жөндеу|Repair all',r_stopb:'Остановить|Тоқтату|Stop',r_startb:'Запустить|Қосу|Start',r_order:'Выдать наряд|Наряд беру|Issue order',
 r_done:'Починено|Жөнделді|Repaired',r_log:'Журнал ремонтов|Жөндеу журналы|Repair log',r_none:'Пока ничего не чинили|Әзірге жөндеген жоқ|Nothing repaired yet',
 r_hint:'Здесь видно, что сломано и что уже починено. «Починить» снимает неисправность станка (в реальной системе — после выезда бригады).|Мұнда не бұзылғаны және не жөнделгені көрінеді.|See what is broken and what is already fixed.',
 f_bn:'Узкое место линии|Желінің тар жері|Line bottleneck',f_thr:'Пропускная способность|Өткізу қабілеті|Throughput',f_next:'Ожидаемый простой за смену|Ауысымдағы күтілетін тоқтап тұру|Expected downtime / shift',
 f_ai:'Анализ ИИ|ЖИ талдауы|AI analysis',f_risk:'Риск простоя по станкам|Станоктар бойынша тоқтап тұру тәуекелі|Downtime risk by machine',
  th_amber:'Янтарь и сланец|Янтарь және сланец|Amber & Slate',th_emerald:'Изумруд и бирюза|Изумруд және бирюза|Emerald & Teal',th_violet:'Сине-фиолетовая|Көк-күлгін|Modern Blue & Purple',th_cyan:'Циан и электрик|Циан және электрик|Tech Cyan / Electric Blue',
 k_hi:'Высокий|Жоғары|High',k_md:'Средний|Орташа|Medium',k_lo:'Низкий|Төмен|Low'});
const SNm=(st,d)=>d&&d.stopped?t('r_stop'):({OK:t('r_ok'),WARNING:t('r_warn'),CRITICAL:t('r_crit')}[st]||st);
const stCol=(st,d)=>d&&d.stopped?'var(--mut)':({OK:'var(--ac)',WARNING:'var(--warn)',CRITICAL:'var(--crit)'}[st]||'var(--mut)');

/* ------------------------------------------------------------ стили */
const css=document.createElement('style');
css.textContent=`
body,body.noR{grid-template-columns:220px minmax(0,1fr) 0!important}.rp,#rpt,#dtf{display:none!important}
@media(max-width:860px){body,body.noR{grid-template-columns:60px minmax(0,1fr) 0!important}}
.sb nav button{position:relative}.sb nav .nb{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10.5px;font-weight:700;min-width:18px;height:18px;border-radius:9px;background:var(--crit);color:#fff;display:none;align-items:center;justify-content:center;padding:0 5px}
.sb nav .nb.on{display:inline-flex}
#n-jury{display:flex;gap:10px;align-items:center;background:none;border:1px dashed var(--ln);color:var(--mut);padding:8px 10px;border-radius:9px;font:inherit;cursor:pointer;width:100%;margin-top:8px}
#n-jury:hover,#n-jury.on{background:var(--p2);color:var(--ink);border-color:var(--mut)}
.p-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;align-items:start}
.p-grid>.g,#p-node>.g{gap:10px}
#p-node section.g{display:flex;flex-direction:column}#p-node .rh{justify-content:flex-start;gap:10px}#p-node .rh h2{margin:0;font-size:14px}#p-node .rh .cnt{margin-left:auto}#p-node .grow{min-height:200px}
.p-mon{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.p-mon>.g{position:relative;overflow:hidden;gap:2px;padding:12px 14px}
.p-mon>.g::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c,var(--ac))}
.p-mon>.g[data-go]{cursor:pointer;transition:transform .15s,border-color .15s}.p-mon>.g[data-go]:hover{transform:translateY(-2px);border-color:var(--c,var(--ac))}
.p-mon small{color:var(--mut);font-size:11.5px}.p-mon b{font-size:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--c,var(--ink));line-height:1.15}
.p-mon em{font-style:normal;font-size:11px;color:var(--mut)}.p-mon .bar{margin-top:6px}
.p-mon>.g.bad{--c:var(--crit)}.p-mon>.g.wn{--c:var(--warn)}.p-mon>.g.ok{--c:var(--ac)}
.p-strip{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:10px 14px!important;flex-direction:row!important;cursor:pointer}
.p-strip .tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.p-strip .it{display:flex;gap:6px;align-items:center;font-size:12.5px}
.p-strip .go{margin-left:auto;color:var(--ac2);font-size:12.5px}
.chipx{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:99px;background:var(--p2);border:1px solid var(--ln);color:var(--c,var(--mut));white-space:nowrap}
.chipx::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c,var(--mut))}
.mc{gap:10px!important;border-left:3px solid var(--c,var(--ln))!important}
.mc .top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.mc h3{margin:0;font-size:14px;line-height:1.25}.mc .sub{color:var(--mut);font-size:11.5px}
.mc .nums{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.mc .nums div{background:var(--p2);border-radius:8px;padding:5px 8px}.mc .nums small{display:block;color:var(--mut);font-size:10.5px}.mc .nums b{font-size:14px;font-variant-numeric:tabular-nums}
.mc .why{font-size:12.5px;color:var(--ink);min-height:18px}.mc .fixed{font-size:11.5px;color:var(--ac)}
.mc .acts{display:flex;gap:6px;flex-wrap:wrap}.mc .acts .btn{flex:1;min-width:92px;padding:6px 8px;font-size:12px;justify-content:center}
.mc .btn.fix{background:var(--crit);border-color:var(--crit);color:#fff;font-weight:600}.mc .btn.fix:disabled{background:var(--p2);border-color:var(--ln);color:var(--mut);cursor:default;font-weight:400}
.p-sum{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.p-sum .chipx{font-size:12.5px;padding:4px 12px}
.p-log{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:12.5px}.p-log li{display:flex;gap:8px;align-items:flex-start}.p-log time{color:var(--mut);font-variant-numeric:tabular-nums;flex:none;min-width:78px}
.p-tb{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}.p-tb th{color:var(--mut);font-weight:500;text-align:left;padding:7px 10px;white-space:nowrap}.p-tb td{padding:8px 10px;border-top:1px solid var(--ln);vertical-align:middle}
.p-tb .num{text-align:right}.p-tb th.num{text-align:right}
.p-bar{display:inline-block;height:7px;border-radius:4px;background:var(--c,var(--ac));vertical-align:middle;min-width:2px}
.p-bg{display:inline-block;width:90px;height:7px;border-radius:4px;background:var(--p2);vertical-align:middle;margin-right:6px;overflow:hidden}.p-bg .p-bar{display:block;height:100%}
.p-bn{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.p-bn .big{font-size:20px;font-weight:600}.p-bn .m{color:var(--mut);font-size:12.5px}
.p-ai{white-space:pre-wrap;font-size:13px;line-height:1.55;background:var(--p2);border-radius:10px;padding:10px 12px;margin-top:8px}
.p-pg{display:flex;flex-direction:column;gap:14px;min-width:0}
@media(max-width:1280px){.p-mon{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:860px){.p-mon{grid-template-columns:1fr 1fr}.p-grid{grid-template-columns:1fr}}
`;
document.head.appendChild(css);

/* ------------------------------------------------------------ левое меню: вкладки и «Панель жюри» */
const nav=$('nav'),main=document.querySelector('main');
const addTab=(key,icon,id,before)=>{const b=document.createElement('button');b.dataset.tab=key;b.innerHTML=`<i data-lucide="${icon}"></i><span data-i="${key}"></span><b class="nb" id="nb-${key}"></b>`;
  nav.insertBefore(b,nav.querySelector(`[data-tab=${before}]`));const s=document.createElement('section');s.className='tab';s.id='t-'+key;s.innerHTML=`<div class="p-pg" id="${id}"></div>`;main.appendChild(s)};
addTab('repair','wrench','p-rep','master');addTab('fc','radar','p-fc','master');addTab('node','cpu','p-node-wrap','master');
// правая панель целиком -> вкладка «Данные станка»
const rp=document.querySelector('aside.rp');
const nodeBox=document.createElement('div');nodeBox.id='p-node';nodeBox.className='p-grid';$('p-node-wrap').appendChild(nodeBox);
rp.querySelectorAll(':scope>section').forEach(s=>{s.classList.add('g');nodeBox.appendChild(s)});
document.body.classList.add('noR');
// «ИИ-прогноз» и «Журнал» переезжают из «Данных станка» во вкладку «Прогноз и узкие места» (отдельный блок: drawFC перерисовывает только #p-fc)
const fcX=document.createElement('div');fcX.id='p-fc-x';fcX.className='p-grid';fcX.style.marginTop='14px';$('t-fc').appendChild(fcX);
['ai','log'].forEach(id=>{const s=$(id)&&$(id).closest('section');if(s){fcX.appendChild(s);s.style.gridColumn='1 / -1'}});
// кнопки шапки («Отчёт за смену», «Выдать наряд») — в левое меню, шапка на дашборде скрыта
const hc=document.querySelector('header .hc');if(hc)document.querySelector('.sb').insertBefore(hc,document.querySelector('.sb .ft'));
const setTabAttr=()=>{document.body.dataset.tab=tabK};setTabAttr();nav.addEventListener('click',()=>setTimeout(setTabAttr,0));
// палитры (цвета) теперь в themes.js: режим светлая/тёмная выбирается отдельно и палитрой не меняется
// «Панель жюри» отдельной кнопкой слева
const jb=document.createElement('button');jb.id='n-jury';jb.innerHTML='<i data-lucide="terminal"></i><span data-i="jury"></span>';
document.querySelector('.sb').insertBefore(jb,document.querySelector('.sb .ft'));
const jury=$('dt');
const syncJury=()=>jb.classList.toggle('on',!jury.hidden);
jb.onclick=()=>{if(jury.hidden)$('dtf').click();else $('dtx').click();syncJury()};
new MutationObserver(syncJury).observe(jury,{attributes:true,attributeFilter:['hidden']});syncJury();

/* ------------------------------------------------------------ данные */
let FC=null,RP=null;
const dev=id=>(CTL.state&&CTL.state.devices[id])||null;
const lastOf=id=>hist[id]&&hist[id].at(-1);
async function loadFC(){try{FC=await get('/api/forecast');drawStrip();drawFC();drawRepair()}catch(e){}}
async function loadRP(){try{RP=await get('/api/repairs');drawRepair();badge()}catch(e){}}

/* ------------------------------------------------------------ дашборд: мониторинг показателей */
const dashKp=document.querySelector('#t-dash .kpis');dashKp.style.display='none';
const mon=document.createElement('div');mon.id='p-mon';mon.className='p-mon';
const strip=document.createElement('div');strip.id='p-strip';strip.className='g p-strip';
dashKp.after(mon);
mon.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(!g)return;document.querySelector('[data-tab='+g.dataset.go+']').click();const sc=g.dataset.sc;if(sc)setTimeout(()=>{const el=document.getElementById(sc);el&&el.scrollIntoView({behavior:'smooth',block:'center'})},450)});
const GO={oee:['stats','an-c1'],perf:['fc',''],load:['node',''],down:['repair',''],cars:['stats','an-c4'],qual:['stats','an-cs']};
function tile(k,label,val,sub,cls,pct){const go=GO[k]||['stats',''];return `<div class="g ${cls}" data-go="${go[0]}" data-sc="${go[1]}" title="Открыть подробнее"><small>${t(label)}</small><b>${val}</b><em>${sub}</em>${pct==null?'':`<div class="bar"><i style="width:${Math.max(2,Math.min(100,pct))}%;background:var(--c)"></i></div>`}</div>`}
function drawMon(m){
  if(!m)return;const s=m.stats,D=m.devices;
  const load=D.reduce((a,d)=>a+d.load_percentage,0)/D.length,down=Object.values(s.downtime_min).reduce((a,b)=>a+b,0),maxd=Math.max(0,...Object.values(s.downtime_min));
  const defect=1-s.quality,fin=(D.find(d=>d.device_id=='quality_scan_06')||{}).units_produced||0,mx=window.CARMIX?CARMIX(fin):[],mixTxt=mx.map(m=>`<span style="color:${m.color}">●</span> ${m.name.split(' ').pop()} ${m.count}`).join(' · ');
  mon.innerHTML=
   tile('oee','m_oee',P(s.oee),`${t('m_goal')} ≥ 85% · ${t('av')} ${P(s.availability)}`,s.oee>=.85?'ok':s.oee>=.7?'wn':'bad',s.oee*100)+
   tile('perf','m_perf',P(s.performance),`${t('out')}: ${s.units} / ${s.plan}`,s.performance>=.9?'ok':s.performance>=.75?'wn':'bad',s.performance*100)+
   tile('load','m_load',Math.round(load)+'%',`${D.filter(d=>d.load_percentage>0).length} / ${D.length} ${t('unn')}`,load>=60?'ok':load>=30?'wn':'bad',load)+
   tile('down','m_down',down.toFixed(0)+' '+t('m_min'),`${t('m_goal')} ≤ 60 ${t('m_min')} · max ${maxd.toFixed(0)} ${t('m_min')}`,maxd>60?'bad':maxd>30?'wn':'ok',Math.min(100,maxd/60*100))+
   tile('cars','m_cars',fin,mixTxt,'ok',null)+
   tile('qual','m_qual',P(s.quality,1),`${t('m_goal')}: брак ≤ 2% · сейчас ${P(defect,1)}`,defect<=.02?'ok':defect<=.05?'wn':'bad',s.quality*100);
}
function drawStrip(){
  return;
  if(!FC){strip.innerHTML='';return}
  const b=FC.bottleneck,hi=FC.devices.filter(d=>d.risk=='high'),md=FC.devices.filter(d=>d.risk=='med');
  const risk=hi.length?`<span class="chipx" style="--c:var(--crit)">${t('k_hi')}: ${hi.map(d=>E(dn(d.id))).join(', ')}</span>`:md.length?`<span class="chipx" style="--c:var(--warn)">${t('k_md')}: ${md.map(d=>E(dn(d.id))).join(', ')}</span>`:`<span class="chipx" style="--c:var(--ac)">${t('k_lo')}</span>`;
  strip.innerHTML=`<span class="tag">${t('m_fc')}</span><span class="it"><i data-lucide="gauge" style="width:15px;height:15px"></i><b>${t('f_bn')}:</b> ${E(dn(b.id))}<span class="mut">— ${E(b.reason)}</span></span><span class="it">${risk}</span><span class="it mut">${t('f_next')}: <b style="color:var(--ink)">${FC.next_shift_downtime_min} ${t('m_min')}</b></span><span class="go">${t('f_risk')} →</span>`;icons();
}
const _r=render;render=function(m){_r(m);try{drawMon(m);drawRepair();badge();window.PANEL&&PANEL.onTick&&PANEL.onTick(m)}catch(e){}};

/* ------------------------------------------------------------ «Ремонт и состояние» */
const rep=$('p-rep');
const act=async(fn)=>{try{await fn()}catch(e){alert(e.message)}await Promise.all([CTL.refresh(),loadRP(),loadFC()]);drawRepair()};
rep.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||b.disabled)return;const id=b.dataset.id,a=b.dataset.a;
  if(a=='fix')act(()=>jp('/api/control/repair',{device_id:id}));
  else if(a=='fixall')act(async()=>{for(const i of (RP&&RP.faults)||[])await jp('/api/control/repair',{device_id:i})});
  else if(a=='stop')act(()=>jp('/api/control/stop',{target:id}));
  else if(a=='start')act(()=>jp('/api/control/start',{target:id}));
  else if(a=='order'){window.openOrder?openOrder(id):$('new').click()}});
function sick(id){if(RP&&RP.faults.includes(id))return true;const l=lastOf(id),lr=RP&&RP.last_repair[id];return !!(l&&l.status!='OK')&&!(lr&&Date.now()/1000-lr<900)}
function drawRepair(force){
  if(!L||!rep||(tabK!='repair'&&force!==true))return;
  const ids=L.devices.map(d=>d.id);
  const bad=ids.filter(i=>{const l=lastOf(i);return l&&l.status=='CRITICAL'}),warn=ids.filter(i=>{const l=lastOf(i);return l&&l.status=='WARNING'}),stopped=ids.filter(i=>{const d=dev(i);return d&&d.stopped});
  const today=RP?RP.repaired.filter(r=>Date.now()/1000-r.ts<86400).length:0;
  const cards=ids.map(id=>{const l=lastOf(id)||{status:'OK',temperature:0,vibration:0,load_percentage:0},d=dev(id)||{},f=FC&&FC.devices.find(x=>x.id==id);
    const c=stCol(l.status,d),lr=RP&&RP.last_repair[id],recent=lr&&Date.now()/1000-lr<900;
    const sk=sick(id);
    return `<div class="g mc" style="--c:${c}"><div class="top"><div><h3>${E(dn(id))}</h3><div class="sub">${E(shn(id))}</div></div><span class="chipx" style="--c:${c}">${SNm(l.status,d)}${d.eff<100&&!d.stopped?` · ${t('r_slow')} ${d.eff}%`:''}</span></div>
<div class="nums"><div><small>${t('temp')}</small><b>${tf(l.temperature)}</b></div><div><small>${t('vib')}</small><b>${l.vibration} g</b></div><div><small>${t('load')}</small><b>${l.load_percentage}%</b></div><div><small>${t('out')}</small><b>${l.units_produced??'–'}</b></div></div>
<div class="why">${f?E(f.why):''}</div>${recent?`<div class="fixed">✓ ${t('r_done')} ${new Date(lr*1000).toLocaleTimeString().slice(0,5)}${l.status!='OK'?' · остывает':''}</div>`:''}
<div class="acts"><button class="btn fix" data-a="fix" data-id="${id}" ${sk?'':'disabled'}><i data-lucide="wrench"></i>${t('r_fix')}</button>${d.stopped?`<button class="btn" data-a="start" data-id="${id}"><i data-lucide="play"></i>${t('r_startb')}</button>`:`<button class="btn" data-a="stop" data-id="${id}"><i data-lucide="square"></i>${t('r_stopb')}</button>`}<button class="btn" data-a="order" data-id="${id}"><i data-lucide="clipboard-plus"></i>${t('r_order')}</button></div></div>`}).join('');
  const log=RP&&RP.repaired.length?RP.repaired.map(r=>`<li><time>${E(r.time)}</time><span><b>${E(DN[r.device_id]?dn(r.device_id):r.name)}</b> — ${E(r.message.replace(/^.*?:\s*/,''))}</span></li>`).join(''):`<li><span class="mut">${t('r_none')}</span></li>`;
  rep.innerHTML=`<div class="g"><div class="p-sum"><span class="chipx" style="--c:var(--crit)">${t('r_crit')}: ${bad.length}</span><span class="chipx" style="--c:var(--warn)">${t('r_warn')}: ${warn.length}</span><span class="chipx" style="--c:var(--mut)">${t('r_stop')}: ${stopped.length}</span><span class="chipx" style="--c:var(--ac)">${t('r_done')} (24h): ${today}</span>
<button class="btn" data-a="fixall" style="margin-left:auto" ${(RP&&RP.faults.length)?'':'disabled'}><i data-lucide="wrench"></i>${t('r_fixall')}</button></div><div class="mut" style="margin-top:6px;font-size:12px">${t('r_hint')}</div></div>
<div class="p-grid">${cards}</div><div class="g"><div class="hd"><h2>${t('r_log')}</h2></div><ul class="p-log">${log}</ul></div>`;icons();
}
function badge(){const n=L?L.devices.filter(d=>{const l=lastOf(d.id);return l&&l.status=='CRITICAL'}).length:0,b=$('nb-repair');if(b){b.textContent=n;b.classList.toggle('on',n>0)}}

/* ------------------------------------------------------------ «Прогноз и узкие места» */
const fcEl=$('p-fc');let aiText='';
fcEl.addEventListener('click',async e=>{if(!e.target.closest('#f-ai'))return;const out=$('f-aiout');out.textContent='…';
  try{const j=await jp('/api/forecast/ai');aiText=j.text}catch(x){aiText='⚠ '+x.message}drawFC()});
function drawFC(force){
  if(tabK!='fc'&&force!==true)return;
  if(!FC){fcEl.innerHTML='<div class="g"><span class="mut">…</span></div>';return}
  const b=FC.bottleneck,dv=[...FC.devices].sort((a,c)=>({high:0,med:1,low:2}[a.risk]-{high:0,med:1,low:2}[c.risk])||(a.ttc_min??1e9)-(c.ttc_min??1e9));
  const rc={high:'var(--crit)',med:'var(--warn)',low:'var(--ac)'},rl={high:t('k_hi'),med:t('k_md'),low:t('k_lo')};
  const rows=dv.map(d=>{const pc=d.nominal?d.throughput/d.nominal*100:0,c=rc[d.risk];
    return `<tr><td><b>${E(dn(d.id))}</b></td><td><span class="chipx" style="--c:${c}">${rl[d.risk]}</span></td><td class="num">${tf(d.temp)}</td><td class="num" style="color:${d.slope_min>0.3?'var(--warn)':'inherit'}">${d.slope_min>0?'+':''}${d.slope_min}</td><td class="num">${d.ttc_min==null?'—':d.ttc_min.toFixed(0)+' '+t('m_min')}</td>
<td><span class="p-bg"><i class="p-bar" style="width:${pc}%;--c:${pc<50?'var(--crit)':pc<95?'var(--warn)':'var(--ac)'}"></i></span>${d.throughput}/${d.nominal}</td><td class="num">${d.down24_min}</td><td class="num">${d.exp_shift_min}</td><td>${E(d.why)}</td></tr>`}).join('');
  fcEl.innerHTML=`<div class="g"><div class="hd"><h2>${t('f_bn')}</h2><button class="btn" id="f-ai"><i data-lucide="sparkles"></i>${t('f_ai')}</button></div>
<div class="p-bn"><div><div class="m">${t('f_bn')}</div><div class="big" style="color:${b.reason.includes('авария')||b.reason.includes('остановлен')?'var(--crit)':'var(--warn)'}">${E(dn(b.id))}</div><div class="m">${E(b.reason)}</div></div>
<div><div class="m">${t('f_thr')}</div><div class="big">${FC.line_throughput} / ${FC.nominal_throughput}</div><div class="m">авто/ч · ${FC.loss_pct>0?'потеря '+FC.loss_pct+'%':'потерь нет'}</div></div>
<div><div class="m">${t('f_next')}</div><div class="big">${FC.next_shift_downtime_min} ${t('m_min')}</div><div class="m">по истории за 24 ч</div></div></div>
<div class="p-ai" id="f-aiout" style="display:${aiText?'block':'none'}">${E(aiText)}</div></div>
<div class="g"><div class="hd"><h2>${t('f_risk')}</h2></div><div style="overflow:auto"><table class="p-tb"><tr><th>Станок</th><th>Риск</th><th class="num">T</th><th class="num">°C/мин</th><th class="num">До аварии</th><th>Пропускная, авто/ч</th><th class="num">Простой 24ч, мин</th><th class="num">Ожид. за смену</th><th>Что происходит</th></tr>${rows}</table></div>
<div class="mut" style="margin-top:8px;font-size:12px">Риск считается по тренду температуры: «до аварии» — через сколько минут станок достигнет критической температуры, если нагрев продолжится. Узкое место — станок с наименьшей пропускной способностью: он ограничивает всю линию.</div></div>`;icons();
}

/* ------------------------------------------------------------ запуск */
window.PANEL={get FC(){return FC},get RP(){return RP}};
nav.addEventListener('click',()=>setTimeout(()=>{drawRepair(true);drawFC(true)},30));
const _lang=lang;lang=function(){_lang();drawMon(LM);drawStrip();drawFC();drawRepair()};
loadFC();loadRP();setInterval(loadFC,2500);setInterval(loadRP,3000);
try{tr()}catch(e){}icons();
})();
