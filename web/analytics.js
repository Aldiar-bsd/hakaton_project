/* Allur: переработанная вкладка «Аналитика» — читаемые карточки, графики с явными цветами, данные кейса и цели. */
(()=>{
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const P=(v,d=0)=>(v*100).toFixed(d)+'%';
Object.assign(T,{
 a_t1:'Ключевые показатели сейчас|Қазіргі негізгі көрсеткіштер|Key indicators now',a_oee:'OEE|OEE|OEE',a_av:'Доступность|Қолжетімділік|Availability',a_pf:'Производительность|Өнімділік|Productivity',a_ql:'Качество|Сапа|Quality',a_dt:'Простои, всего|Тоқтап тұру, барлығы|Total downtime',a_out:'Выпущено автомобилей|Шығарылған автокөлік|Cars produced',
 a_tr:'Динамика показателей, %|Көрсеткіштер динамикасы, %|Indicator trend, %',a_tmp:'Температура станков, °C|Станоктар температурасы, °C|Machine temperature, °C',a_down:'Простои по станкам, мин|Станоктар бойынша тоқтап тұру, мин|Downtime by machine, min',a_units:'Выпуск по станкам|Станоктар бойынша шығару|Output by machine',
 a_tb:'Станки сейчас|Станоктар қазір|Machines now',a_cs:'Данные завода: цели и качество|Зауыт деректері: мақсаттар мен сапа|Plant data: targets & quality',a_q:'Брак по участкам, %|Учаскелер бойынша ақау, %|Defects by section, %',
 a_d:'Простои оборудования|Жабдықтың тоқтап тұруы|Equipment downtime',a_p:'План выпуска на месяц|Айлық шығару жоспары|Monthly plan',a_l:'Выполнение плана по линиям|Желілер бойынша жоспар|Plan by line',a_al:'Отклонения и риски|Ауытқулар мен тәуекелдер|Deviations & risks',
 a_goal:'цель|мақсат|target',a_none:'Отклонений нет|Ауытқу жоқ|No deviations',a_note:'Прогноз выпуска: годные за смену × число смен × 23 рабочих дня. Данные подставляются из загруженного файла завода.|Болжам: ауысымдағы жарамды × ауысым × 23 күн.|Forecast: good units per shift × shifts × 23 working days.'});

const css=document.createElement('style');
css.textContent=`
#t-stats>.kpis,#t-stats>.agrid{display:none}
#p-an{display:flex;flex-direction:column;gap:14px;min-width:0}
#p-an h2{font-size:14px;margin:0}
#p-an .p-mon{grid-template-columns:repeat(6,minmax(0,1fr))}
.an2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.an-cv{position:relative;height:250px;width:100%}
.an3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.cs-t{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.cs-t>div{background:var(--p2);border:1px solid var(--ln);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.cs-t small{color:var(--mut);font-size:11.5px}.cs-t b{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ac)}.cs-t em{font-style:normal;font-size:11.5px;color:var(--mut)}
.cs-t .bad{border-color:var(--crit)}.cs-t .bad b{color:var(--crit)}
.cs-al{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:13px}.cs-al li{display:flex;gap:8px;align-items:flex-start}.cs-al .dot{margin-top:6px;flex:none}
.cs-n{color:var(--mut);font-size:11.5px;margin:8px 0 0}
.sch{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}.sch .st{padding:8px 12px;border-radius:12px;background:var(--p2);border:1px solid var(--ln);font-size:12.5px;display:flex;flex-direction:column;gap:2px;min-width:120px;border-left:3px solid var(--c,var(--ln))}
.sch .st small{color:var(--mut);font-size:11px}.sch i{color:var(--mut);font-style:normal;align-self:center}
.eff{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.eff>div{background:var(--p2);border:1px solid var(--ln);border-radius:12px;padding:10px 12px}.eff small{display:block;color:var(--mut);font-size:11.5px}.eff b{font-size:20px;font-variant-numeric:tabular-nums;color:var(--ac)}
.arch{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}.arch .bx{padding:9px 12px;border-radius:12px;border:1px solid var(--ln);background:var(--p2);font-size:12px;line-height:1.45;flex:1;min-width:150px}.arch .bx b{display:block;margin-bottom:2px;font-size:12.5px}.arch i{color:var(--mut);font-style:normal;align-self:center}
@media(max-width:860px){.eff{grid-template-columns:1fr}}
@media(max-width:1250px){#p-an .p-mon{grid-template-columns:repeat(3,minmax(0,1fr))}.an3{grid-template-columns:1fr 1fr}}
@media(max-width:860px){.an2,.an3{grid-template-columns:1fr}.cs-t{grid-template-columns:1fr 1fr}#p-an .p-mon{grid-template-columns:1fr 1fr}}`;
document.head.appendChild(css);

const root=document.createElement('div');root.id='p-an';$('t-stats').appendChild(root);
root.innerHTML=`<div class="p-mon" id="an-k"></div>
<div class="an2"><div class="g"><div class="hd"><h2 data-i="a_tr"></h2></div><div class="an-cv"><canvas id="an-c1"></canvas></div></div>
<div class="g"><div class="hd"><h2 data-i="a_tmp"></h2></div><div class="an-cv"><canvas id="an-c2"></canvas></div></div></div>
<div class="an2"><div class="g"><div class="hd"><h2 data-i="a_down"></h2></div><div class="an-cv"><canvas id="an-c3"></canvas></div></div>
<div class="g"><div class="hd"><h2 data-i="a_units"></h2></div><div class="an-cv"><canvas id="an-c4"></canvas></div></div></div>
<div class="g"><div class="hd"><h2 data-i="a_tb"></h2></div><div style="overflow:auto" id="an-tb"></div></div>
<div class="g"><div class="hd"><h2 data-i="a_cs"></h2><span id="an-src" style="display:flex;gap:8px;align-items:center"></span></div><div class="cs-t" id="an-cs"></div><p class="cs-n" data-i="a_note"></p></div>
<div class="an2"><div class="g"><div class="hd"><h2 data-i="a_q"></h2></div><div class="an-cv"><canvas id="an-c5"></canvas></div></div>
<div class="g"><div class="hd"><h2 data-i="a_d"></h2></div><div style="overflow:auto" id="an-dt"></div></div></div>
<div class="an2"><div class="g"><div class="hd"><h2 data-i="a_p"></h2></div><div id="an-pl"></div></div><div class="g"><div class="hd"><h2 data-i="a_l"></h2></div><div id="an-ln"></div></div></div>
<div class="g"><div class="hd"><h2>Схема производственных участков</h2></div><div id="an-sch" class="sch"></div></div>
<div class="g"><div class="hd"><h2 data-i="a_al"></h2></div><ul class="cs-al" id="an-al"></ul></div>
<div class="g"><div class="hd"><h2>Оценка потенциального эффекта для бизнеса</h2></div><div id="an-eff"></div></div>
<div class="g"><div class="hd"><h2>Архитектура решения</h2></div><div class="arch" id="an-arch"></div></div>`;

/* ---- цвета из темы ---- */
const C=()=>{const g=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();return{ink:g('--ink'),mut:g('--mut'),ln:g('--ln'),ac:g('--ac'),b:g('--ac2'),w:g('--warn'),x:g('--crit'),p:g('--p')}};
const base=(k,extra={})=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
  plugins:{legend:{display:true,position:'bottom',labels:{color:k.mut,boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'rectRounded',padding:12,font:{size:11}}},tooltip:{backgroundColor:k.p,titleColor:k.ink,bodyColor:k.ink,borderColor:k.ln,borderWidth:1,padding:10}},
  scales:{x:{ticks:{color:k.mut,font:{size:11},maxRotation:40,autoSkip:true,maxTicksLimit:8},grid:{display:false},border:{color:k.ln}},y:{ticks:{color:k.mut,font:{size:11}},grid:{color:k.ln},border:{display:false},beginAtZero:true}},...extra});
const charts={};
function chart(id,type,cfg){if(charts[id])return charts[id];const c=new Chart($(id),{type,data:{labels:[],datasets:[]},options:cfg});charts[id]=c;return c}
function setData(c,labels,sets){c.data.labels=labels;
  sets.forEach((s,i)=>{if(c.data.datasets[i])Object.assign(c.data.datasets[i],s);else c.data.datasets[i]=s});c.data.datasets.length=sets.length;c.update('none')}

/* ---- история для графика динамики ---- */
const AH=[];let lastPush=0;
function push(m){const n=Date.now();if(n-lastPush<3000)return;lastPush=n;const s=m.stats;AH.push({t:new Date().toLocaleTimeString().slice(0,8),o:s.oee*100,a:s.availability*100,p:s.performance*100,q:s.quality*100});if(AH.length>100)AH.shift()}

const stC={OK:'ac',WARNING:'w',CRITICAL:'x'};
function draw(m){
  if(!m||!L)return;const k=C(),s=m.stats,D=m.devices,names=L.devices.map(d=>dn(d.id).split(' ').slice(0,2).join(' '));
  const down=Object.values(s.downtime_min).reduce((a,b)=>a+b,0),pct=Math.round(s.units/Math.max(1,s.plan)*100);
  const tile=(lab,val,sub,cls,bar)=>`<div class="g ${cls}"><small>${t(lab)}</small><b>${val}</b><em>${sub}</em>${bar==null?'':`<div class="bar"><i style="width:${Math.min(100,bar)}%;background:var(--c)"></i></div>`}</div>`;
  $('an-k').innerHTML=tile('a_oee',P(s.oee),`${t('a_goal')} ≥ 85%`,s.oee>=.85?'ok':s.oee>=.7?'wn':'bad',s.oee*100)+tile('a_av',P(s.availability),'',s.availability>=.9?'ok':s.availability>=.75?'wn':'bad',s.availability*100)
    +tile('a_pf',P(s.performance),'',s.performance>=.9?'ok':s.performance>=.75?'wn':'bad',s.performance*100)+tile('a_ql',P(s.quality,1),`${t('a_goal')}: брак ≤ 2%`,1-s.quality<=.02?'ok':1-s.quality<=.05?'wn':'bad',s.quality*100)
    +tile('a_dt',down.toFixed(0)+' '+t('minu'),`${t('a_goal')}: ≤ 60 ${t('minu')} на станок`,Math.max(...Object.values(s.downtime_min))>60?'bad':'ok')+tile('a_out',`${(D.find(d=>d.device_id=='quality_scan_06')||{}).units_produced||0} авто`,(window.CARMIX?CARMIX((D.find(d=>d.device_id=='quality_scan_06')||{}).units_produced||0).map(m=>m.name.split(' ').pop()+' '+m.count).join(' · '):''),'ok');
  /* динамика */
  const c1=chart('an-c1','line',base(k,{scales:{x:base(k).scales.x,y:{...base(k).scales.y,min:0,max:100}}}));
  const ln=(label,key,c,fill)=>({label,data:AH.map(x=>x[key]),borderColor:c,backgroundColor:fill?c+'33':c,fill:!!fill,tension:.35,pointRadius:0,borderWidth:2.2});
  setData(c1,AH.map(x=>x.t),[ln('OEE','o',k.ac,1),ln(t('a_av'),'a',k.b),ln(t('a_pf'),'p',k.w),ln(t('a_ql'),'q','#A78BFA')]);
  /* температура с порогами */
  const c2=chart('an-c2','bar',base(k,{interaction:{mode:'nearest',intersect:true},scales:{x:base(k).scales.x,y:{...base(k).scales.y,min:0,suggestedMax:100}}}));
  setData(c2,names,[{type:'bar',label:t('temp'),data:D.map(d=>d.temperature),backgroundColor:D.map(d=>k[stC[d.status]]),borderRadius:6,maxBarThickness:34,order:2},
    {type:'line',label:'Внимание 70°C',data:names.map(()=>70),borderColor:k.w,borderDash:[6,4],pointRadius:0,borderWidth:1.5,order:1},
    {type:'line',label:'Авария 85°C',data:names.map(()=>85),borderColor:k.x,borderDash:[6,4],pointRadius:0,borderWidth:1.5,order:1}]);
  /* простои */
  const fc=window.PANEL&&PANEL.FC,d24=fc?Object.fromEntries(fc.devices.map(x=>[x.id,x.down24_min])):{};
  const c3=chart('an-c3','bar',base(k));
  setData(c3,names,[{label:'За 24 ч',data:L.devices.map(d=>d24[d.id]||0),backgroundColor:k.b,borderRadius:6,maxBarThickness:28},{label:'С запуска',data:L.devices.map(d=>s.downtime_min[d.id]||0),backgroundColor:k.x,borderRadius:6,maxBarThickness:28}]);
  /* выпуск */
  const c4=chart('an-c4','bar',base(k,{interaction:{mode:'nearest',intersect:true},hover:{mode:'nearest',intersect:true}}));
  setData(c4,names,[{label:t('out'),data:D.map(d=>d.units_produced),backgroundColor:k.ac,hoverBackgroundColor:k.b,borderRadius:6,maxBarThickness:34}]);
  /* таблица станков */
  $('an-tb').innerHTML=`<table class="p-tb"><tr><th>Станок</th><th>Статус</th><th class="num">T</th><th class="num">Вибр., g</th><th class="num">Загрузка</th><th class="num">Выпуск</th><th class="num">Простой, мин</th><th class="num">Скорость</th></tr>`+
    D.map(d=>{const c=CTL.state&&CTL.state.devices[d.device_id],col=`var(--${d.status=='OK'?'ac':d.status=='WARNING'?'warn':'crit'})`;
      return `<tr><td><b>${E(dn(d.device_id))}</b><div class="mut" style="font-size:11px">${E(shn(d.device_id))}</div></td><td><span class="chipx" style="--c:${c&&c.stopped?'var(--mut)':col}">${c&&c.stopped?'Остановлен':SN(d.status)}</span></td><td class="num">${tf(d.temperature)}</td><td class="num">${d.vibration}</td><td class="num">${d.load_percentage}%</td><td class="num">${d.units_produced}</td><td class="num">${(s.downtime_min[d.device_id]||0).toFixed(1)}</td><td class="num">${c?c.eff+'%':'–'}</td></tr>`}).join('')+'</table>';
}

/* ---- данные кейса ---- */
let CASE=null;
function drawCase(){
  const c=CASE;if(!c)return;$('an-src').innerHTML=upBtn();try{ic()}catch(e){}const k=C(),T0=c.targets,v=c.live,f=c.forecast;
  const tl=(lab,val,goal,ok,sub='')=>`<div class="${ok?'':'bad'}"><small>${lab}</small><b>${val}</b><em>${t('a_goal')}: ${goal}${sub?' · '+sub:''}</em></div>`;
  $('an-cs').innerHTML=v?tl('OEE',P(v.oee),'≥ '+P(T0.oee),v.oee_ok)+tl('Брак (оценка)',P(v.defect,1),'≤ '+P(T0.defect_max),v.defect_ok)+tl('Макс. простой за сутки',Math.round(v.downtime_max)+' '+t('minu'),'≤ '+T0.downtime_max_min,v.downtime_ok)+tl('Прогноз выпуска за месяц',f.month_good,'≥ '+T0.month_plan_min,f.month_good>=T0.month_plan_min,P(f.pct)):'';
  const secs=['Сварка','Окраска','Сборка'],dates=[...new Set(c.quality.map(x=>x.date))];
  const pal=[k.b,'#A78BFA'];
  const c5=chart('an-c5','bar',base(k,{scales:{x:base(k).scales.x,y:{...base(k).scales.y,suggestedMax:6}}}));
  setData(c5,secs,[...dates.map((d,i)=>({type:'bar',label:d.slice(0,5),data:secs.map(s=>{const r=c.quality.find(x=>x.date==d&&x.section==s);return r?+(r.pct*100).toFixed(2):0}),backgroundColor:pal[i%2],borderRadius:6,maxBarThickness:36,order:2})),
    {type:'line',label:'Допустимо 2%',data:secs.map(()=>T0.defect_max*100),borderColor:k.x,borderDash:[6,4],pointRadius:0,borderWidth:2,order:1}]);
  $('an-dt').innerHTML=`<table class="p-tb"><tr><th>Дата</th><th>Оборудование</th><th>Причина</th><th class="num">Простой</th><th>От лимита 60 мин</th></tr>`+c.downtime.map(x=>{const cc=x.state=='over'?'var(--crit)':x.state=='near'?'var(--warn)':'var(--ac)';
    return `<tr><td>${E(x.date.slice(0,5))}</td><td><b>${E(x.equipment)}</b></td><td>${E(x.reason)}${x.planned?' <span class="mut">(план.)</span>':''}</td><td class="num">${x.min} ${t('minu')}</td><td><span class="p-bg"><i class="p-bar" style="width:${Math.min(100,x.share*100)}%;--c:${cc}"></i></span>${P(x.share)}</td></tr>`}).join('')+'</table>';
  $('an-pl').innerHTML=`<table class="p-tb"><tr><th>Модель</th><th class="num">План, авто</th><th>Доля</th></tr>`+c.models.map(x=>`<tr><td><b>${E(x.model)}</b></td><td class="num">${x.plan}</td><td><span class="p-bg"><i class="p-bar" style="width:${x.share*100}%"></i></span>${P(x.share)}</td></tr>`).join('')
    +`<tr><td><b>Итого</b></td><td class="num"><b>${c.plan_sum}</b></td><td style="color:${c.plan_sum<T0.month_plan_min?'var(--warn)':'inherit'}">${c.plan_sum<T0.month_plan_min?'меньше цели '+T0.month_plan_min:''}</td></tr></table>`;
  $('an-ln').innerHTML=`<table class="p-tb"><tr><th>Линия</th><th class="num">Факт / План</th><th class="num">% плана</th><th class="num">Загрузка</th><th class="num">Время работы, ч/смена</th></tr>`+c.by_line.map(x=>{const r=c.lines.filter(y=>y.line==x.line),h=r.length?(r.reduce((a,y)=>a+y.hours,0)/r.length).toFixed(1):'–';return `<tr><td><b>${E(x.line)}</b></td><td class="num">${x.fact} / ${x.plan}</td><td class="num">${P(x.pct)}</td><td class="num">${x.load.toFixed(0)}%</td><td class="num">${h}</td></tr>`}).join('')+'</table>';
  const SD={'Сварка':'weld_robot_01','Окраска':'paint_spray_02','Сборка':'assembly_line_03','Контроль качества':'quality_scan_06'};
  $('an-sch').innerHTML=(c.scheme||[]).map((n,i)=>{const id=SD[n],h=id&&hist[id]&&hist[id].at(-1),col=h?(h.status=='OK'?'var(--ac)':h.status=='WARNING'?'var(--warn)':'var(--crit)'):'var(--mut)';
    return (i?'<i>→</i>':'')+`<div class="st" style="--c:${col}"><b>${E(n)}</b><small>${h?E(dn(id))+' · '+tf(h.temperature)+' · '+SN(h.status):'склад'}</small></div>`}).join('');
  const nn=$('an-cs').nextElementSibling;if(nn&&nn.classList.contains('cs-n'))nn.textContent=`Режим работы: ${T0.shifts} смены по ${T0.shift_hours} ч · `+t('a_note');
  const ef=c.effect||{};
  $('an-eff').innerHTML=`<div class="eff"><div><small>Внеплановые простои по данным</small><b>≈ ${ef.downtime_per_day} мин / сутки</b></div><div><small>Если прогноз и ИИ снизят их на ${ef.save_pct} %</small><b>+${ef.cars_downtime} авто / мес</b></div><div><small>Если брак окраски и сварки вернуть к норме</small><b>+${ef.cars_quality} годных авто / мес</b></div></div>
<p class="cs-n">Допущения: темп последней линии ${ef.per_hour} авто/ч, ${T0.shifts} смены × ${ef.work_days} рабочих дня; данные файла завода за ${c.quality.length?new Set(c.quality.map(x=>x.date)).size:0} дн. — оценка ориентировочная. Разрыв до цели выпуска (${T0.month_plan_min}): ${ef.shortfall} авто — эффект выше его покрывает.</p>`;
  $('an-arch').innerHTML=`<div class="bx"><b>Источники данных</b>Симулятор станков → OPC UA / MQTT (на заводе); файл завода (docx): план, простои, качество</div><i>→</i><div class="bx"><b>Сервер</b>FastAPI + SQLite, правила автоматики, наряды, прогноз по тренду</div><i>→</i><div class="bx"><b>Экраны</b>3D-двойник линии, дашборд, аналитика, панель мастера, ремонт, прогноз</div><i>→</i><div class="bx"><b>ИИ-агент</b>Gemini / Claude / Ollama: отвечает и управляет линией; отчёты PDF · Excel · Word; Telegram-бот (выкл.)</div>`;
  $('an-al').innerHTML=c.alerts.length?c.alerts.map(a=>`<li><i class="dot warning"></i><span>${E(a)}</span></li>`).join(''):`<li><i class="dot"></i><span class="mut">${t('a_none')}</span></li>`;
}
const upBtn=()=>`<span class="chip" title="Файл с данными завода">${CASE&&CASE.source&&CASE.source.loaded?'Источник: '+E(CASE.source.source):'Источник: встроенные данные'}</span><label class="btn" style="cursor:pointer"><i data-lucide="upload"></i><span>Загрузить данные (docx)</span><input type="file" accept=".docx" hidden class="up-file"></label>`;
async function upload(f){if(!f)return;try{const r=await fetch('/api/import',{method:'POST',headers:{'x-filename':encodeURIComponent(f.name)},body:f});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||('Ошибка '+r.status));await loadCase();try{toast('Данные завода','ok','загружено: '+f.name)}catch(e){}}catch(e){alert(e.message)}}
document.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('up-file')){upload(e.target.files[0]);e.target.value=''}});
async function loadCase(){try{CASE=await (await fetch('/api/case')).json();if(tabK=='stats')drawCase()}catch(e){}}

/* ---- подключение ---- */
window.PANEL=window.PANEL||{};
PANEL.onTick=m=>{push(m);if(tabK=='stats')draw(m)};
$('nav').addEventListener('click',e=>{if(e.target.closest('[data-tab=stats]'))setTimeout(()=>{draw(LM);drawCase();loadCase();Object.values(charts).forEach(c=>c.resize())},60)});
setInterval(()=>{if(tabK=='stats')loadCase()},5000);
const _l=lang;lang=function(){_l();if(tabK=='stats'){draw(LM);drawCase()}};
const g3=[...document.querySelectorAll('#t-set h2')].find(h=>h.dataset.i=='g3');
if(g3){const box=g3.nextElementSibling,row=document.createElement('div');row.className='sr';row.id='set-plant';box.appendChild(row)}
async function drawSet(){const row=$('set-plant');if(!row)return;let st={loaded:false};try{st=await (await fetch('/api/import')).json()}catch(e){}
  row.innerHTML=`<div class="sd"><span>Данные завода</span><small>${st.loaded?E(st.source)+' · '+new Date(st.ts*1000).toLocaleString().slice(0,16)+' · строк: '+Object.values(st.counts).reduce((a,b)=>a+b,0):'встроенные данные'}</small></div><label class="btn" style="cursor:pointer"><i data-lucide="upload"></i><span>Загрузить docx</span><input type="file" accept=".docx" hidden class="up-file"></label>`;try{ic()}catch(e){}}
$('nav').addEventListener('click',e=>{if(e.target.closest('[data-tab=set]'))drawSet()});
loadCase();try{tr()}catch(e){}
})();
