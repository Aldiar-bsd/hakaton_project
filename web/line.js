/* Allur: 3D-линия завода (одна линия: ЧПУ → пресс → лазерная шлифовка → сварка → окраска → сборка → контроль),
   панель управления линией и аварийная плашка со ссылкой на станок. Подключается в конце index.html.
   Лёгкая графика для обычного офисного ПК: простые формы, общие геометрии, без теней в режиме «Линия». */
(()=>{
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=k=>k*k*(3-2*k);
const back=k=>{const c=1.4;return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2)};
const jp=async(u,b,m='POST')=>{const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.detail)||('Ошибка '+r.status));return j};

/* ------------------------------------------------------------ тексты (RU | KK | EN) */
Object.assign(T,{
 m_line:'Линия|Желі|Line',m_det:'Станок|Станок|Machine',stopall:'Остановить всё|Бәрін тоқтату|Stop all',resume:'Запустить линию|Желіні қосу|Start line',
 lspeed:'Скорость линии|Желі жылдамдығы|Line speed',gostn:'К станку|Станокқа|Go to machine',tline:'К линии|Желіге|Back to line',tdet:'Станок в деталях|Станок егжей-тегжейлі|Machine details',
 st_stop:'СТОП|ТОҚТАДЫ|STOP',st_lim:'замедлен|баяу|slowed',rule_h:'Автоматика|Автоматика|Automation',rule_on:'сработала|іске қосылды|active',
 stopped_ok:'Вся линия остановлена|Бүкіл желі тоқтатылды|Whole line stopped',resumed_ok:'Линия запущена|Желі қосылды|Line started',
 sk_in:'Склад комплектующих|Жинақтаушылар қоймасы|Parts warehouse',sk_out:'Склад готовой продукции|Дайын өнім қоймасы|Finished goods',
 line_t:'Производственная линия|Өндіріс желісі|Production line',line_s:'7 станков · нажмите на станок|7 станок · станокты басыңыз|7 machines · click a machine'});
const t2=k=>t(k);

/* ------------------------------------------------------------ управление линией (состояние с сервера) */
const CTL=window.CTL={state:null,
  async refresh(){try{this.state=await (await fetch('/api/control')).json();ui()}catch(e){}},
  async stopAll(){try{this.state=await jp('/api/control/stop',{target:'all'});toast(t('stopall'),'warn',t('stopped_ok'))}catch(e){alert(e.message)}ui()},
  async resume(){try{this.state=await jp('/api/control/start',{target:'all'});toast(t('resume'),'ok',t('resumed_ok'))}catch(e){alert(e.message)}ui()},
  async speed(p){try{this.state=await jp('/api/control/speed',{target:'line',percent:p})}catch(e){}ui()},
  async rmRule(id){try{this.state=await fetch('/api/control/rules/'+id,{method:'DELETE'}).then(r=>r.json())}catch(e){}ui()}};
window.CTLF=id=>{const d=CTL.state&&CTL.state.devices[id];return d?d.eff/100:1};
const statusOf=id=>(hist[id]&&hist[id].at(-1)&&hist[id].at(-1).status)||'OK';

/* ------------------------------------------------------------ стили */
const css=document.createElement('style');
css.textContent=`
#ctl{position:absolute;z-index:3;top:12px;left:250px;right:330px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
#ctl .btn,#ctl .seg,#ctl .chip{background:var(--ov);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#ctl .seg button.on{background:var(--p)}
#ctl .btn.dng{border-color:var(--crit);color:var(--crit);font-weight:600}#ctl .btn.dng:hover{background:var(--crit);color:#fff}
#ctl .btn.pri{background:var(--ac);border-color:var(--ac);color:var(--on);font-weight:600}#ctl .btn.pri:hover{filter:brightness(1.08);background:var(--ac)}
.spd{display:flex;gap:7px;align-items:center;font-size:12px;padding:3px 11px;border-radius:99px;border:1px solid var(--ln);background:var(--ov);backdrop-filter:blur(10px);color:var(--mut)}
.spd input{width:96px;padding:0;accent-color:var(--ac);border:0;background:none}.spd b{color:var(--ink);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
.rlc{display:inline-flex;gap:6px;align-items:center;font-size:11.5px;padding:3px 6px 3px 10px;border-radius:99px;border:1px solid var(--ln);background:var(--ov);backdrop-filter:blur(10px);color:var(--mut);max-width:330px}
.rlc.on{border-color:var(--warn);color:var(--warn)}.rlc span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rlc button{border:0;background:none;color:inherit;cursor:pointer;padding:0 2px;font-size:13px}
#ll{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2}
.ll{position:absolute;left:0;top:0;display:flex;gap:6px;align-items:center;white-space:nowrap;font-size:11.5px;padding:3px 9px 3px 8px;border-radius:99px;background:var(--ov);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--ln);cursor:pointer;pointer-events:auto;transition:border-color .2s,box-shadow .2s;will-change:transform}
.ll:hover,.ll.sel{border-color:var(--ac)}.ll.sel{box-shadow:0 0 0 1px var(--ac)}
.ll .dot{width:8px;height:8px;border-radius:50%;background:var(--ac);flex:none}.ll.warning .dot{background:var(--warn)}.ll.critical{border-color:var(--crit)}.ll.critical .dot{background:var(--crit);animation:llp 1s infinite}
.ll b{font-weight:600}.ll small{color:var(--mut);font-variant-numeric:tabular-nums}.ll em{font-style:normal;font-size:10.5px;padding:0 6px;border-radius:99px;background:var(--p2);color:var(--warn)}.ll em:empty{display:none}.ll.critical em{color:var(--crit)}
@keyframes llp{50%{opacity:.35}}
.ll.far{opacity:.55}
#alarm a.al{color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}#alarm a.al:hover{opacity:.8}
#alarm .btn{border:1px solid var(--crit);background:var(--crit);color:#fff;padding:5px 12px;font-size:12.5px;font-weight:600;white-space:nowrap;border-radius:8px}
#alarm .btn.go{background:var(--p);color:var(--crit)}#alarm .btn.go:hover,#alarm .btn.dng:hover{filter:brightness(1.08)}
#alarm{flex-wrap:wrap}
#lnk-det,#lnk-line{background:var(--ov);backdrop-filter:blur(10px)}
@media(min-width:861px){.tiles{grid-template-columns:repeat(7,1fr)}}
@media(max-width:1250px){#ctl{left:14px;right:14px;top:58px}.spd input{width:70px}}
`;
document.head.appendChild(css);

/* ------------------------------------------------------------ панель управления над сценой */
const stage=document.querySelector('.stage');
const ctl=document.createElement('div');ctl.id='ctl';
ctl.innerHTML=`<div class="seg" id="vmode"><button data-m="line" class="on"></button><button data-m="det"></button></div>
<button class="btn dng" id="c-stop"><i data-lucide="octagon"></i><span></span></button>
<div class="spd"><span data-k="lspeed"></span><input type="range" id="c-spd" min="10" max="100" step="5" value="100"><b id="c-spdv">100%</b></div><span id="c-rules" style="display:contents"></span>`;
stage.appendChild(ctl);
const LL=document.createElement('div');LL.id='ll';stage.appendChild(LL);
const tr=document.querySelector('.ov.tr');
const lnkDet=document.createElement('button');lnkDet.className='btn';lnkDet.id='lnk-det';lnkDet.innerHTML='<i data-lucide="scan-search"></i><span></span>';
const lnkLine=document.createElement('button');lnkLine.className='btn';lnkLine.id='lnk-line';lnkLine.innerHTML='<i data-lucide="route"></i><span></span>';lnkLine.style.display='none';
tr.prepend(lnkDet,lnkLine);
const icons=()=>{try{ic()}catch(e){}};
function ui(){
  const s=CTL.state;
  document.querySelectorAll('#vmode button').forEach(b=>b.textContent=t(b.dataset.m=='line'?'m_line':'m_det'));
  ctl.querySelector('[data-k=lspeed]').textContent=t('lspeed');
  const st=$('c-stop');st.querySelector('span').textContent=t(s&&s.e_stop?'resume':'stopall');st.className='btn '+(s&&s.e_stop?'pri':'dng');
  lnkDet.querySelector('span').textContent=t('tdet');lnkLine.querySelector('span').textContent=t('tline');
  if(s){
    const v=Object.values(s.devices),avg=Math.round(v.reduce((a,d)=>a+d.speed,0)/v.length);
    if(document.activeElement!==$('c-spd'))$('c-spd').value=avg;$('c-spdv').textContent=(s.e_stop?'0':avg)+'%';
    $('c-rules').innerHTML=s.rules.map(r=>`<span class="rlc ${r.active?'on':''}" title="${E(r.text)}"><i data-lucide="zap" style="width:12px;height:12px"></i><span>${t('rule_h')} #${r.id}: &gt;${r.above}°C → ${r.slow_to}% → ${r.below}°C${r.active?' · '+t('rule_on'):''}</span><button data-rm="${r.id}" aria-label="×">×</button></span>`).join('');
    const b=$('a-stop');if(b){b.querySelector('span').textContent=t(s.e_stop?'resume':'stopall');b.className='btn '+(s.e_stop?'go':'dng')}
  }
  icons();
}
$('c-stop').onclick=()=>CTL.state&&CTL.state.e_stop?CTL.resume():CTL.stopAll();
$('c-spd').oninput=e=>$('c-spdv').textContent=e.target.value+'%';
$('c-spd').onchange=e=>CTL.speed(+e.target.value);
$('c-rules').onclick=e=>{const b=e.target.closest('[data-rm]');if(b)CTL.rmRule(b.dataset.rm)};
const _lang=lang;lang=function(){_lang();ui();relabelAll();try{TW&&TW.setFocus&&TW.setFocus(TW.focus())}catch(e){}};

/* ------------------------------------------------------------ аварийная плашка: ссылка на станок + «Остановить всё» */
const al=$('alarm'),adBtn=$('ad');
const abtn=document.createElement('button');abtn.id='a-stop';abtn.className='btn dng';abtn.innerHTML='<i data-lucide="octagon"></i><span></span>';al.insertBefore(abtn,adBtn);
const goBtn=document.createElement('button');goBtn.id='a-go';goBtn.className='btn go';goBtn.innerHTML='<i data-lucide="map-pin"></i><span></span>';al.insertBefore(goBtn,abtn);
let alarmIds=[];
abtn.onclick=()=>CTL.state&&CTL.state.e_stop?CTL.resume():CTL.stopAll();
goBtn.onclick=()=>alarmIds.length&&goStation(alarmIds[0]);
al.addEventListener('click',e=>{const a=e.target.closest('a.al');if(a){e.preventDefault();goStation(a.dataset.go)}});
const _render=render;render=function(m){_render(m);try{
  alarmIds=m.devices.filter(d=>d.status=='CRITICAL').map(d=>d.device_id);
  $('alt').innerHTML=E(t('alat'))+' '+alarmIds.map(i=>`<a href="#" class="al" data-go="${i}">${E(dn(i))}</a>`).join(', ');
  goBtn.querySelector('span').textContent=t('gostn');abtn.querySelector('span').textContent=t(CTL.state&&CTL.state.e_stop?'resume':'stopall');icons();
  labelData();
}catch(e){}};

/* ------------------------------------------------------------ сцена */
let TW=null,built=false;
const waitTW=setInterval(()=>{if(window.TW&&window.TW.sc){clearInterval(waitTW);TW=window.TW;try{build();built=true}catch(e){console.error('line build failed',e);TW.lineOn=false;ctl.style.display='none';lnkDet.style.display='none'}}},40);

const SHORT={cnc_milling_05:'ЧПУ-центр|ЧПУ орталығы|CNC centre',stamp_press_04:'Пресс|Прес|Press',laser_grind_07:'Лазерная шлифовка|Лазерлік егеу|Laser grinding',weld_robot_01:'Сварка|Дәнекерлеу|Welding',paint_spray_02:'Окраска|Бояу|Painting',assembly_line_03:'Сборка|Құрастыру|Assembly',quality_scan_06:'Контроль|Бақылау|Inspection'};
const sn=id=>(SHORT[id]||id).split('|')[C.lg]||id;
const ids=['cnc_milling_05','stamp_press_04','laser_grind_07','weld_robot_01','paint_spray_02','assembly_line_03','quality_scan_06'];
const ST={};let relabelAll=()=>{},labelData=()=>{},goStation=id=>{try{pick(id)}catch(e){}};
// модели и их доля — по плану на месяц; последовательность выпуска рассчитана так, чтобы доли сходились
const MODELS=[{n:'Chevrolet Onix',c:0xd3202a,s:[1,1,1],sh:2500},{n:'Chevrolet Cobalt',c:0x1456ff,s:[1.1,.97,1],sh:1800},{n:'JAC J7',c:0xe8ecef,s:[1.02,1.16,1.1],sh:500}];
const SEQ=(()=>{const tot=MODELS.reduce((a,m)=>a+m.sh,0),cnt=[0,0,0],out=[];for(let i=0;i<48;i++){let b=0,bd=-1e9;MODELS.forEach((m,k)=>{const d=m.sh/tot*(i+1)-cnt[k];if(d>bd){bd=d;b=k}});cnt[b]++;out.push(b)}return out})();
window.CARMIX=n=>{const full=Math.floor(n/48),rest=n%48,c=[0,0,0];SEQ.forEach((m,i)=>{c[m]+=full+(i<rest?1:0)});return MODELS.map((m,k)=>({name:m.n,count:c[k],color:'#'+m.c.toString(16).padStart(6,'0')}))};
// линия — конвейер: стоит один станок (или авария) — стоит всё производство
window.LINEFLOW=()=>{let f=1;ids.forEach(id=>{f=Math.min(f,statusOf(id)=='CRITICAL'?0:CTLF(id))});return f};

function build(){
  const {THREE,sc,cam,oc,r,el}=TW,V=THREE.Vector3;
  const G=new THREE.Group();G.name='line';sc.add(G);

  /* ---- материалы и простые фигуры (геометрии общие — экономим память) ---- */
  const std=(c,m=.4,ro=.5)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:ro});
  const MM={dark:std(0x222b34,.5,.45),steel:std(0x9aa6b2,.8,.35),body:std(0xc8d1d8,.3,.5),rub:std(0x14181d,.1,.6),
    blu:std(0x2f6bff,.3,.4),grn:std(0x12b76a,.3,.4),ora:std(0xff7a1a,.3,.4),
    glass:new THREE.MeshStandardMaterial({color:0xaed0ff,transparent:true,opacity:.16,roughness:0,metalness:0,depthWrite:false,side:THREE.DoubleSide}),
    laser:new THREE.MeshBasicMaterial({color:0x3ddc97,transparent:true,opacity:.5}),
    spark:new THREE.MeshBasicMaterial({color:0xfff2c2}),
    cglass:std(0x1a2a3c,.6,.15),hood:std(0xb6c0c9,.7,.4),frame:std(0x56616c,.7,.45)};
  const GC={};const bg=(w,h,d)=>GC[w+'_'+h+'_'+d]??=new THREE.BoxGeometry(w,h,d);
  const cg=(a,b,h,n=14)=>GC['c'+a+'_'+b+'_'+h+'_'+n]??=new THREE.CylinderGeometry(a,b,h,n);
  const box=(p,w,h,d,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(bg(w,h,d),m);o.position.set(x,y,z);p.add(o);return o};
  const cyl=(p,a,b,h,m,x=0,y=0,z=0,n=14)=>{const o=new THREE.Mesh(cg(a,b,h,n),m);o.position.set(x,y,z);p.add(o);return o};
  const grp=(p,x=0,y=0,z=0)=>{const o=new THREE.Group();o.position.set(x,y,z);p.add(o);return o};

  /* ---- пол ---- */
  const floorM=new THREE.MeshStandardMaterial({color:0xdfe5e2,roughness:1,metalness:0,envMapIntensity:0});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,140),floorM);floor.rotation.x=-Math.PI/2;floor.position.y=-.01;G.add(floor);
  const grid=new THREE.GridHelper(48,48,0x7f8c88,0x7f8c88);grid.material.transparent=true;grid.material.opacity=.1;grid.position.y=.003;G.add(grid);

  /* ---- траектория: ряд A (вправо) → разворот → ряд B (влево) ---- */
  const ZA=-4.8,ZB=4.8,XL=-18,XR=16,R=4.8,lenA=XR-XL,lenArc=Math.PI*R,L=lenA*2+lenArc;
  const pathAt=s=>{s=((s%L)+L)%L;
    if(s<lenA)return{x:XL+s,z:ZA,a:0};
    if(s<lenA+lenArc){const a=(s-lenA)/R;return{x:XR+R*Math.sin(a),z:-R*Math.cos(a),a}}
    return{x:XR-(s-lenA-lenArc),z:ZB,a:Math.PI}};
  const sOf=(x,row)=>row=='A'?x-XL:lenA+lenArc+(XR-x);

  /* ---- ленты конвейера ---- */
  const beltTex=()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#1a2027';x.fillRect(0,0,64,64);x.strokeStyle='#2c3640';x.lineWidth=5;x.beginPath();x.moveTo(0,0);x.lineTo(32,32);x.lineTo(0,64);x.moveTo(32,0);x.lineTo(64,32);x.lineTo(32,64);x.stroke();
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(lenA/.9,1.6/.9);return t};
  const tA=beltTex(),tB=beltTex();
  const mkBelt=(z,tex)=>{const m=new THREE.Mesh(bg(lenA,.12,1.7),new THREE.MeshStandardMaterial({map:tex,roughness:.8}));m.position.set((XL+XR)/2,.19,z);G.add(m);
    [-1,1].forEach(s=>box(G,lenA,.28,.1,MM.steel,(XL+XR)/2,.2,z+s*.9))};
  mkBelt(ZA,tA);mkBelt(ZB,tB);
  const arc=new THREE.Mesh(new THREE.RingGeometry(R-.85,R+.85,48,1,-Math.PI/2,Math.PI),new THREE.MeshStandardMaterial({color:0x1d242c,roughness:.8,side:THREE.DoubleSide}));
  arc.rotation.x=-Math.PI/2;arc.position.set(XR,.2,0);G.add(arc);
  [R-.9,R+.9].forEach(rr=>{const rim=new THREE.Mesh(new THREE.RingGeometry(rr-.05,rr+.05,48,1,-Math.PI/2,Math.PI),new THREE.MeshStandardMaterial({color:0x9aa6b2,metalness:.8,roughness:.35,side:THREE.DoubleSide}));rim.rotation.x=-Math.PI/2;rim.position.set(XR,.3,0);G.add(rim)});
  // склад комплектующих (старт) и готовой продукции (финиш)
  const pad=(x,z,col)=>{const p=new THREE.Mesh(bg(2.6,.08,3.6),new THREE.MeshStandardMaterial({color:col,roughness:.7}));p.position.set(x,.04,z);G.add(p);return p};
  pad(XL-1.7,ZA,0x6b7886);pad(XL-1.7,ZB,0x3a8f68);
  for(let i=0;i<3;i++)box(G,.9,.7,.9,std(0x8a6a44,.1,.8),XL-2.4+i*.7,.4,ZA-1.1+(i%2)*.6);

  /* ---- общее для станков ---- */
  const portal=(g,{w=4.4,d=3.2,h=3,acc})=>{box(g,w+.6,.1,d+.4,MM.dark,0,.05,0);
    [-1,1].forEach(sx=>[-1,1].forEach(sz=>box(g,.24,h,.24,acc,sx*w/2,h/2,sz*d/2)));
    [-1,1].forEach(s=>{box(g,w+.22,.22,.22,acc,0,h,s*d/2);box(g,.22,.22,d+.22,acc,s*w/2,h,0)})};
  const lampG=new THREE.SphereGeometry(.1,12,12);
  const tower=g=>{cyl(g,.04,.04,2.2,MM.steel,-2.5,1.1,1.8,8);return [0x16c47f,0xffb020,0xff3b30].map((c,i)=>{const m=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.1,roughness:.3}),o=new THREE.Mesh(lampG,m);o.position.set(-2.5,2.0+i*.2,1.8);g.add(o);return m})};
  const mkStation=(id,x,z,build)=>{
    const g=grp(G,x,0,z);const sd={id,g,x,z,t:Math.random()*5,run:1,sel:0};
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4),new THREE.MeshBasicMaterial({color:0x12b76a,transparent:true,opacity:.0,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.02;g.add(glow);sd.glow=glow;
    const hit=new THREE.Mesh(bg(5.2,3.8,4.2),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=1.9;hit.userData.sid=id;g.add(hit);sd.hit=hit;
    sd.lamps=tower(g);sd.anim=build(g)||(()=>{});ST[id]=sd;return sd};

  /* ---- ЧПУ-центр ---- */
  mkStation('cnc_milling_05',-12.6,ZA,g=>{portal(g,{acc:MM.blu});
    [-1,1].forEach(s=>box(g,4.6,.2,.2,MM.steel,0,2.75,s*1.2));
    const car=grp(g,0,2.55,0);box(car,.3,.3,2.6,MM.steel,0,.2,0);const hd=grp(car,0,0,0);box(hd,.7,.5,.6,MM.dark,0,0,0);const sp=cyl(hd,.13,.13,.8,MM.steel,0,-.55,0);const tool=cyl(hd,.03,.03,.5,MM.steel,0,-1.1,0,8);
    box(g,.9,1.6,.6,MM.body,-2.1,.9,-1.9);const scr=box(g,.6,.4,.04,new THREE.MeshBasicMaterial({color:0x3dff9a}),-2.1,1.3,-1.58);
    return(t,e)=>{car.position.z=Math.sin(t*.9)*.5;hd.position.x=Math.sin(t*1.3)*1.2;tool.rotation.y=t*30;scr.material.color.setHex(e>0?0x3dff9a:0x335544)}});

  /* ---- Пресс штамповки: цикл 6 с, из них 2 с пауза внизу ---- */
  mkStation('stamp_press_04',-4.2,ZA,g=>{const P=grp(g,0,0,-2.9);
    box(P,3.2,.6,2.4,MM.dark,0,.3,0);box(P,1.9,.25,1.3,MM.steel,0,.72,0);
    const blank=box(P,1.4,.05,.9,MM.hood,0,.88,0);
    [[-1.4,-.9],[1.4,-.9],[-1.4,.9],[1.4,.9]].forEach(([x,z])=>cyl(P,.1,.1,3.6,MM.steel,x,2.4,z,12));
    box(P,3.5,.8,2.6,MM.grn,0,4.2,0);
    const ram=grp(P,0,2.9,0);box(ram,2.5,.5,1.7,MM.body,0,0,0);box(ram,1.5,.3,1,MM.steel,0,-.4,0);cyl(ram,.12,.12,1,MM.steel,0,.7,0,10);
    const fw=new THREE.Mesh(new THREE.TorusGeometry(.7,.1,10,28),MM.dark);fw.rotation.y=Math.PI/2;fw.position.set(2.1,4.1,0);P.add(fw);
    // подача: штамп → лента (панель уезжает на кузов)
    const feed=box(g,1.2,.1,1.4,MM.dark,0,.55,-1.3);
    return(t,e)=>{const ph=t%6,k=ph<2?ph/2:ph<4?1:1-(ph-4)/2,v=smooth(k);
      ram.position.y=2.9-1.45*v;fw.rotation.x=t*1.2;
      if(ph<2){blank.position.set(0,.88,0);blank.scale.set(1,1,1)}
      else if(ph<4){blank.position.set(0,.88,0);blank.scale.set(1,3,1)}                       // отштампована
      else{const m=smooth((ph-4)/2);blank.position.set(0,.88+.15*m,m*1.9);blank.scale.set(1,3,1)} // уезжает к ленте
    }});

  /* ---- Лазерная шлифовка: луч бьёт только по кузову, когда он под головкой ---- */
  mkStation('laser_grind_07',4.2,ZA,g=>{portal(g,{acc:MM.grn});
    box(g,.3,.3,3.2,MM.steel,0,2.8,0);
    const hd=grp(g,0,2.4,0);box(hd,.6,.6,.6,MM.dark,0,0,0);box(hd,.64,.12,.64,MM.grn,0,.22,0);
    const bm=new THREE.Mesh(cg(.03,.03,1.1,8),MM.laser);bm.position.y=-.55;hd.add(bm);
    const sp=new THREE.Mesh(new THREE.SphereGeometry(.09,10,10),MM.spark);sp.position.y=-1.1;hd.add(sp);
    const pts=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffe9a0,size:.07}));const pp=new Float32Array(30*3);pts.geometry.setAttribute('position',new THREE.BufferAttribute(pp,3));pts.position.y=-1.1;hd.add(pts);
    box(g,.9,1.5,.6,MM.grn,2.1,.8,-1.9);box(g,.94,.1,.64,MM.dark,2.1,1.58,-1.9);
    return(t,e,on,rel)=>{const w=e>.02&&on;hd.position.z=on?Math.sin(t*1.3)*.3:0;hd.position.x=on?Math.max(-1.2,Math.min(1.2,rel))+Math.sin(t*1.7)*.4:0;MM.laser.opacity=.35+Math.random()*.3;bm.visible=sp.visible=pts.visible=w;
      if(w){sp.scale.setScalar(.3+e*(.8+Math.random()));for(let i=0;i<30;i++){pp[i*3]=(Math.random()-.5)*.5;pp[i*3+1]=Math.random()*.3;pp[i*3+2]=(Math.random()-.5)*.5}pts.geometry.attributes.position.needsUpdate=true}}});

  /* ---- Сварка: четыре горелки (по две с каждой стороны) над кузовом, искры только пока кузов на посту ---- */
  mkStation('weld_robot_01',12.6,ZA,g=>{portal(g,{acc:MM.ora,h:2.6});
    /* Шарнирные руки: основание → стойка → круглый шарнир (поворот в плане) → стрела → локоть → предплечье → горелка.
       Все звенья соединены: горелка ходит по дуге вдоль шва, а не «ездит» отдельно от стойки. */
    const REACH=1.2;
    const arms=[-1,1].flatMap(sd=>[-.95,.95].map(px=>{const b=grp(g,px,0,sd*1.5);cyl(b,.3,.38,.5,MM.dark,0,.25,0,18);cyl(b,.14,.14,1.4,MM.ora,0,1.2,0,14);
      const sh=grp(b,0,1.75,0);cyl(sh,.2,.2,.3,MM.dark,0,0,0,16);                                  // круглый плечевой шарнир
      const boom=grp(sh,0,0,0);box(boom,.2,.2,REACH,MM.ora,0,0,-sd*REACH/2);                       // стрела к кузову
      const el=grp(boom,0,0,-sd*REACH);cyl(el,.11,.11,.3,MM.dark,0,0,0,14).rotation.z=Math.PI/2;   // локоть (горизонтальная ось)
      const fa=grp(el,0,0,0);cyl(fa,.07,.07,.3,MM.ora,0,-.15,0,10);                               // предплечье вниз
      const torch=grp(fa,0,-.3,0);cyl(torch,.06,.035,.3,MM.steel,0,-.15,0,10);                     // горелка
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.09,10,10),new THREE.MeshBasicMaterial({color:0xcfe8ff}));tip.position.y=-.35;torch.add(tip);
      return{sd,px,sh,fa,tip}}));
    return(t,e,on,rel)=>arms.forEach(a=>{
      const xo=on?Math.max(-.7,Math.min(.7,rel-.4*a.px+Math.sin(t*1.6+a.sd+a.px*2.2)*.22)):0;   // куда нужно сместить горелку вдоль кузова
      a.sh.rotation.y=-a.sd*Math.asin(xo/REACH);                                                 // поворот всей стрелы в шарнире — конец идёт по дуге
      a.fa.rotation.x=on?Math.sin(t*3.2+a.px)*.1:0;                                              // лёгкое покачивание предплечья
      a.tip.visible=e>.02&&on;a.tip.scale.setScalar(.3+e*(.7+Math.random()*1.1))})});

  /* ---- Окраска: факелы только когда кузов в камере ---- */
  mkStation('paint_spray_02',12.6,ZB,g=>{box(g,5.2,.1,3.8,MM.dark,0,.05,0);
    box(g,4.8,2.8,3.2,MM.glass,0,1.5,0);
    box(g,5,.2,3.4,MM.blu,0,3,0);[-1,1].forEach(sx=>[-1,1].forEach(sz=>box(g,.2,3,.2,MM.blu,sx*2.4,1.5,sz*1.6)));
    box(g,4.8,.1,.1,MM.steel,0,2.8,-.7);box(g,4.8,.1,.1,MM.steel,0,2.8,.7);
    const cone=new THREE.MeshBasicMaterial({color:0x2f6bff,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide});
    const sprayers=[-.7,.7].map(z=>{const s=grp(g,0,2.6,z);box(s,.5,.3,.4,MM.dark,0,0,0);cyl(s,.05,.03,.4,MM.steel,0,-.3,0,8);const c=new THREE.Mesh(new THREE.ConeGeometry(.5,1.1,14,1,true),cone);c.position.y=-.95;s.add(c);return{s,c}});
    const fan=grp(g,1.6,3.5,-1);[0,1,2].forEach(i=>{const b=box(fan,.9,.05,.18,MM.dark,0,0,0);b.rotation.y=i*1.05});cyl(g,.4,.4,.5,MM.steel,1.6,3.25,-1,18);
    return(t,e,on,rel)=>{sprayers.forEach((q,i)=>{q.s.position.x=on?Math.max(-1.3,Math.min(1.3,rel))+Math.sin(t*1.5+i*2)*.5:0;q.c.visible=e>.02&&on});cone.opacity=.14+Math.random()*.1;fan.rotation.y=t*6}});

  /* ---- Сборочный конвейер: оранжевые подъёмники ставят колёса, стеллаж колёс ---- */
  mkStation('assembly_line_03',3.2,ZB,g=>{portal(g,{acc:MM.ora,h:3.2});
    box(g,4.8,.06,.9,MM.ora,0,.12,-1.9);
    const hoists=[-.9,.9].map((x,i)=>{const h=grp(g,x,3.1,0);box(h,.5,.25,.5,MM.ora,0,0,0);const cab=cyl(h,.02,.02,1,MM.steel,0,-.5,0,6);const gr=grp(h,0,-1,0);box(gr,.5,.1,.6,MM.ora,0,0,0);const wh=cyl(gr,.3,.3,.18,MM.rub,0,-.2,0,18);wh.rotation.x=Math.PI/2;return{h,cab,gr,i}});
    for(let i=0;i<4;i++){const w=cyl(g,.3,.3,.2,MM.rub,-2.1,.3+i*.22,-1.7,18);w.rotation.x=Math.PI/2;cyl(g,.16,.16,.22,MM.steel,-2.1,.3+i*.22,-1.7,12).rotation.x=Math.PI/2}
    box(g,.12,1.2,.12,MM.ora,-2.4,.6,-1.7);box(g,.12,1.2,.12,MM.ora,-1.8,.6,-1.7);
    return(t,e,on)=>{hoists.forEach(q=>{const k=.5+.5*Math.sin(t*1.5+q.i*2);q.h.position.x=(q.i?.9:-.9)+Math.sin(t*.8+q.i)*.5;q.gr.position.y=-.9-k*.6;q.cab.scale.y=1+k*.6;q.cab.position.y=-.5-k*.3});
    }});

  /* ---- Контроль качества: зелёная арка, камеры, сканирующая плоскость ---- */
  mkStation('quality_scan_06',-6.2,ZB,g=>{box(g,5.2,.1,3.8,MM.dark,0,.05,0);box(g,4.8,.06,.9,MM.grn,0,.12,1.9);
    [-1,1].forEach(s=>box(g,.3,2.8,.3,MM.grn,0,1.4,s*1.25));box(g,.45,.32,2.8,MM.grn,0,2.85,0);
    [-.7,0,.7].forEach(z=>{box(g,.3,.25,.3,MM.dark,0,2.55,z);cyl(g,.08,.1,.25,MM.dark,0,2.3,z,12)});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.7),new THREE.MeshBasicMaterial({color:0x3ddc97,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));plane.rotation.y=Math.PI/2;plane.position.set(0,1.5,0);g.add(plane);
    box(g,.9,1.5,.5,MM.grn,2.1,.8,1.9);const scr=box(g,.62,.42,.04,new THREE.MeshBasicMaterial({color:0x3dff9a}),2.1,1.3,1.64);
    return(t,e,on)=>{plane.visible=e>.02&&on;plane.position.x=Math.sin(t*1.5)*1.3;plane.material.opacity=.2+Math.sin(t*3)*.08;scr.material.color.setHex(e>0?0x3dff9a:0x335544)}});

  const SPOS={};ids.forEach(id=>{const s=ST[id];SPOS[id]=s.z<0?sOf(s.x,'A'):sOf(s.x,'B')});

  /* ---- автомобили: рама → детали → готовая машина ---- */
  const profile=pts=>{const s=new THREE.Shape();s.moveTo(...pts[0]);pts.slice(1).forEach(p=>s.lineTo(...p));return s};
  const ext=(sh,d,z0)=>{const g=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:false,curveSegments:6});g.translate(0,0,z0);return g};
  const lowerG=ext(profile([[-2.05,.3],[-2.05,.8],[-1.8,1.02],[-1.25,1.04],[1.2,1.04],[1.8,.98],[2.1,.7],[2.1,.3]]),1.6,-.8);
  const roofS=new THREE.Shape();roofS.moveTo(-1.3,1.04);roofS.quadraticCurveTo(-1.1,1.52,-.6,1.52);roofS.lineTo(.45,1.52);roofS.quadraticCurveTo(.95,1.5,1.15,1.06);roofS.lineTo(-1.3,1.04);
  const roofG=ext(roofS,1.6,-.8);
  const glassS=new THREE.Shape();glassS.moveTo(-1.12,1.1);glassS.quadraticCurveTo(-.95,1.43,-.6,1.43);glassS.lineTo(.4,1.43);glassS.quadraticCurveTo(.8,1.4,.98,1.1);glassS.lineTo(-1.12,1.1);
  const glassG=ext(glassS,1.74,-.87);
  const STEEL=new THREE.Color(0x98a3ad);
  const cars=[];const N=Math.round(L/6.7),SPC=L/N;
  const part=(p,x,y,z)=>{const g=grp(p,x,y,z);g.visible=false;return g};
  for(let k=0;k<N;k++){
    const c=grp(G);c.visible=false;const body=new THREE.MeshStandardMaterial({color:0x98a3ad,metalness:.65,roughness:.35});
    const inner=grp(c,0,.35,0);
    box(inner,4.5,.1,1.95,MM.dark,0,.05,0);                                              // поддон-носитель
    [-1,1].forEach(s=>box(inner,4.1,.1,.12,MM.frame,0,.4,s*.6));                         // лонжероны рамы
    [-1.6,-.4,.8,1.8].forEach(x=>box(inner,.12,.1,1.3,MM.frame,x,.4,0));                 // поперечины
    const eng=part(inner,1.2,.62,0);box(eng,1.1,.5,.7,MM.steel,0,0,0);[-.3,0,.3].forEach(x=>cyl(eng,.12,.12,.15,MM.dark,x,.3,0,12));
    const axl=part(inner,0,.4,0);[-1.3,1.3].forEach(x=>{const a=cyl(axl,.05,.05,1.9,MM.steel,x,0,0,8);a.rotation.x=Math.PI/2});
    const floorP=part(inner,0,.47,0);box(floorP,3.9,.06,1.5,MM.hood,0,0,0);
    const lower=part(inner,0,0,0);lower.add(new THREE.Mesh(lowerG,body));
    const cab=part(inner,0,0,0);cab.add(new THREE.Mesh(roofG,body));
    const gl=part(inner,0,0,0);gl.add(new THREE.Mesh(glassG,MM.cglass));
    const wheels=part(inner,0,.38,0);[[-1.3,.8],[1.3,.8],[-1.3,-.8],[1.3,-.8]].forEach(([x,z])=>{const w=cyl(wheels,.38,.38,.26,MM.rub,x,0,z,16);w.rotation.x=Math.PI/2;const h=cyl(wheels,.22,.22,.28,MM.steel,x,0,z,12);h.rotation.x=Math.PI/2});
    const lights=part(inner,0,0,0);[-.55,.55].forEach(z=>{box(lights,.06,.1,.3,new THREE.MeshBasicMaterial({color:0xfff3d0}),2.16,.82,z);box(lights,.06,.1,.3,new THREE.MeshBasicMaterial({color:0xff3b30}),-2.12,.85,z)});
    const trim=part(inner,0,0,0);
    box(trim,.2,.18,1.6,MM.dark,2.18,.5,0);box(trim,.2,.18,1.6,MM.dark,-2.14,.5,0);box(trim,.05,.2,.8,MM.dark,2.2,.76,0);
    [-1,1].forEach(z=>{box(trim,.2,.08,.1,MM.dark,.85,1.08,z*.93);[-.55,.45].forEach(x=>box(trim,.02,.5,.02,MM.dark,x,.78,z*.81));[-.2,.8].forEach(x=>box(trim,.18,.03,.03,MM.steel,x,.86,z*.82))});
    box(trim,.04,.14,.5,new THREE.MeshBasicMaterial({color:0xf2f2f2}),-2.2,.66,0);
    const ok=part(inner,0,1.75,0);box(ok,.5,.12,.5,new THREE.MeshBasicMaterial({color:0x3dff9a}),0,0,0);
    cars.push({k,g:c,inner,model:0,body,col:new THREE.Color(),serial:-1,parts:{eng,axl,floorP,lower,cab,gl,wheels,lights,trim,ok},cabCol:new THREE.Color()});
  }
  const SCALE=.62;
  const stg=(c,name,sk,len=1.6)=>{const k=clamp((c.s-(sk-1.2))/len),p=c.parts[name];p.visible=k>0;if(k>0&&k<1)p.scale.setScalar(Math.max(.01,back(k)));else if(k>=1)p.scale.setScalar(1);return k};

  /* ---- камера и переходы ---- */
  const CX=(XL+XR+R)/2,HW=(XR+R-XL)/2+1.8,HD=8;
  const fitD=()=>{const asp=el.clientWidth/Math.max(1,el.clientHeight),tf=Math.tan(cam.fov*Math.PI/360);return Math.max(HW/(tf*asp),HD/tf)*1.02};
  const overview=()=>{const d=fitD();return{pos:new V(CX,d*.6,d*.8-1.6),tgt:new V(CX,0,-1.6)}};
  let fly=null;
  const flyTo=(pos,tgt,ms=1100)=>{fly={t0:performance.now(),ms,p0:cam.position.clone(),g0:oc.target.clone(),p1:pos,g1:tgt}};
  let userMoved=false;oc.addEventListener('start',()=>{fly=null;userMoved=true});
  const lineMode=()=>{oc.minDistance=4;oc.maxDistance=70;oc.enablePan=true;oc.autoRotate=false;oc.maxPolarAngle=Math.PI*.49};
  const showDetailObjs=on=>{TW.detail.forEach(o=>o.visible=on);const g=TW.getGrp();if(g)g.visible=on;$('lbs').style.display=on?'':'none';$('lsv').style.display=on?'':'none'};
  let focused=false;
  const setFocus=f=>{focused=f;const on=TW.lineOn,hud=document.querySelector('.ov.hud'),chip=$('mst'),tl=document.querySelector('.ov.tl');if(tl)tl.style.display=on&&!f?'none':'';
    if(on&&!f){$('mn').textContent=t('line_t');$('ms').textContent=t('line_s');if(hud)hud.style.display='none';if(chip)chip.style.visibility='hidden'}
    else{if(on){$('mn').textContent=dn(cur);$('ms').textContent=shn(cur)}if(hud)hud.style.display='';if(chip)chip.style.visibility=''}};
  TW.setFocus=setFocus;
  const fade=fn=>{const c=r.domElement;c.style.transition='opacity .24s';c.style.opacity='0';setTimeout(()=>{fn();c.style.opacity='1'},250)};
  const setBtns=()=>{const ln=TW.lineOn;document.querySelectorAll('#vmode button').forEach(b=>b.classList.toggle('on',(b.dataset.m=='line')==ln));lnkDet.style.display=ln?'':'none';lnkLine.style.display=ln?'none':'';const lg=document.querySelector('.tl .lgd');if(lg)lg.style.display=ln?'none':'';$('exp').style.display=ln?'none':'';LL.style.display=ln?'':'none'};
  const realSet=()=>setModel;
  function openDetail(id){if(!TW.lineOn)return;fade(()=>{TW.lineOn=false;G.visible=false;showDetailObjs(true);setModel(MK[id||cur]);
      cam.position.set(7.5,4.4,9);oc.target.set(0,1.4,0);oc.minDistance=5;oc.maxDistance=20;oc.enablePan=false;oc.autoRotate=!!C.rot;oc.maxPolarAngle=Math.PI*.49;
      r.setPixelRatio(Math.min(devicePixelRatio,2));TW.r.toneMappingExposure=1.05;fx();setFocus(true);setBtns();LM&&render(LM)})}
  function openLine(after){if(TW.lineOn){after&&after();return}fade(()=>{TW.lineOn=true;G.visible=true;showDetailObjs(false);lineMode();const o=overview();cam.position.copy(o.pos);oc.target.copy(o.tgt);r.setPixelRatio(Math.min(devicePixelRatio,1.5));TW.dl.castShadow=false;setBtns();if(after)after();else focus(cur,true)})}
  function focus(id,keep){const s=ST[id];if(!s||!TW.lineOn)return;Object.values(ST).forEach(q=>q.sel=q.id==id?1:0);
    if(keep){const o=overview();flyTo(o.pos,o.tgt,900);setFocus(false);return}
    flyTo(new V(s.x+4,9,s.z+17),new V(s.x,.8,s.z-.5),1100);setFocus(true)}
  const home=()=>{userMoved=false;const o=overview();flyTo(o.pos,o.tgt,1000);Object.values(ST).forEach(q=>q.sel=0);setFocus(false)};
  document.querySelectorAll('#vmode button').forEach(b=>b.onclick=()=>b.dataset.m=='line'?openLine():openDetail(cur));
  lnkDet.onclick=()=>openDetail(cur);lnkLine.onclick=()=>openLine();

  /* pick: в режиме «Линия» не пересобираем детальную модель, а подлетаем к станку */
  const _pick=pick;
  pick=function(id){
    if(TW.lineOn&&TW.ready){const sm=setModel;setModel=()=>{};try{_pick(id)}finally{setModel=sm}Object.values(ST).forEach(q=>q.sel=q.id==id?1:0);flyTo(new V(ST[id].x+4,9,ST[id].z+17),new V(ST[id].x,.8,ST[id].z-.5),1100);setFocus(true);return}
    _pick(id)};
  goStation=id=>{try{document.querySelector('[data-tab=dash]').click()}catch(e){}
    if(!TW.lineOn)openLine(()=>pick(id));else pick(id)};
  // клик по станку на сцене
  let down=null;const cv=r.domElement,ray=new THREE.Raycaster(),m2=new THREE.Vector2();
  const hits=ids.map(i=>ST[i].hit);
  const pickAt=e=>{const b=cv.getBoundingClientRect();m2.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(m2,cam);const h=ray.intersectObjects(hits,false);return h.length?h[0].object.userData.sid:null};
  cv.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
  cv.addEventListener('pointerup',e=>{if(!TW.lineOn||!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>5)return;const id=pickAt(e);if(id)pick(id)});
  cv.addEventListener('dblclick',e=>{if(!TW.lineOn)return;const id=pickAt(e);if(id){pick(id);openDetail(id)}});
  /* наведение на станок: камера плавно приближается (на полпути к виду «клик»), курсор ушёл — возвращается к общему плану.
     Не мешает ручному управлению: работает только когда камера у общего плана, не во время перетаскивания и не после клика по станку. */
  let hovId=null,hovT=0,hovFlew=false;
  const hoverZoom=id=>{if(!id||focused||!TW.lineOn)return;const o=overview();if(!hovFlew&&cam.position.distanceTo(o.pos)>3)return;
    const s=ST[id];flyTo(o.pos.clone().lerp(new V(s.x+4,9,s.z+17),.5),o.tgt.clone().lerp(new V(s.x,.8,s.z-.5),.6),750);hovFlew=true};
  const hoverOut=()=>{if(!hovFlew)return;hovFlew=false;if(focused||!TW.lineOn)return;const o=overview();flyTo(o.pos,o.tgt,750)};
  cv.addEventListener('pointermove',e=>{if(!TW.lineOn||e.buttons)return;const id=pickAt(e);cv.style.cursor=id?'pointer':'grab';
    if(id!==hovId){hovId=id;clearTimeout(hovT);hovT=setTimeout(()=>id?hoverZoom(id):hoverOut(),id?200:500)}});
  cv.addEventListener('pointerleave',()=>{hovId=null;clearTimeout(hovT);hovT=setTimeout(hoverOut,300)});
  cv.addEventListener('pointerdown',()=>{clearTimeout(hovT);hovFlew=false});     // начали тянуть камеру или кликнули — наведение не вмешивается

  /* ---- подписи над станками ---- */
  const labs={};
  ids.forEach(id=>{const e=document.createElement('div');e.className='ll';e.innerHTML='<i class="dot"></i><b></b><small></small><em></em>';e.onclick=()=>pick(id);e.ondblclick=()=>{pick(id);openDetail(id)};LL.appendChild(e);labs[id]={e,v:new V(ST[id].x,3.9,ST[id].z)}});
  const whs=[['sk_in',XL-1.7,ZA],['sk_out',XL-1.7,ZB]].map(([k,x,z])=>{const e=document.createElement('div');e.className='ll wh';e.style.pointerEvents='none';e.style.cursor='default';LL.appendChild(e);return{k,e,v:new V(x,1.9,z)}});
  const reWh=()=>whs.forEach(w=>w.e.innerHTML='<small>'+t(w.k)+'</small>');reWh();
  relabelAll=()=>{ids.forEach(id=>labs[id].e.querySelector('b').textContent=sn(id));reWh()};
  labelData=()=>{const s=CTL.state;ids.forEach(id=>{const e=labs[id].e,h=hist[id]&&hist[id].at(-1);if(!h)return;e.className='ll '+h.status.toLowerCase()+(id==cur?' sel':'');
    e.querySelector('small').textContent=`${tf(h.temperature)}`;const d=s&&s.devices[id];
    const blocked=s&&s.flow<5&&d&&d.eff>0&&h.status!='CRITICAL';e.querySelector('em').textContent=d?(d.stopped?t('st_stop'):blocked?'ждёт':d.eff<100?'▼'+d.eff+'%':''):'';e.querySelector('b').textContent=sn(id)});
    try{const q=hist.quality_scan_06&&hist.quality_scan_06.at(-1);if(q){const mx=CARMIX(q.units_produced).map(m=>m.name.split(' ').pop()+' '+m.count).join(' · ');whs[1].e.innerHTML='<small>'+t('sk_out')+' · <b>'+q.units_produced+' авто</b> ('+mx+')</small>'}}catch(x){}};
  relabelAll();
  const proj=new V();
  const place=()=>{const w=el.clientWidth,h=el.clientHeight;
    whs.forEach(q=>{proj.copy(q.v).project(cam);if(proj.z>1){q.e.style.display='none';return}q.e.style.display='';q.e.style.transform=`translate(${(proj.x+1)/2*w-q.e.offsetWidth/2}px,${(1-proj.y)/2*h-q.e.offsetHeight}px)`});
    ids.forEach(id=>{const l=labs[id];proj.copy(l.v).project(cam);const e=l.e;if(proj.z>1){e.style.display='none';return}e.style.display='';const x=(proj.x+1)/2*w,y=(1-proj.y)/2*h;e.style.transform=`translate(${x-e.offsetWidth/2}px,${y-e.offsetHeight}px)`;e.classList.toggle('far',cam.position.distanceTo(oc.target)>30)})};

  /* ---- кадр ---- */
  let last=performance.now(),flow=1,base=0,themeT=0;const V0=SPC/6;                      // takt 6 с: машина на выходе каждые 6 с
  const col=new THREE.Color();
  const cssv=v=>getComputedStyle(document.querySelector('.stage')||document.documentElement).getPropertyValue(v).trim();   // цвета сцены (она тёмная в любой теме)
  const themeApply=()=>{const th=document.documentElement.dataset.theme,light=false;      // сцена всегда тёмная
    const ac=new THREE.Color(cssv('--ac')),a2=new THREE.Color(cssv('--ac2')),wn=new THREE.Color(cssv('--warn')),bg=new THREE.Color(cssv('--bg'));
    MM.grn.color.copy(ac);MM.blu.color.copy(a2);MM.ora.color.copy(wn);
    if(TW.mat){['grn','blu','ora'].forEach((k,i)=>TW.mat[k]&&TW.mat[k].color.copy([ac,a2,wn][i]))}
    TW.r.toneMappingExposure=TW.lineOn?(light?.95:.8):TW.r.toneMappingExposure;floorM.envMapIntensity=0;if(light)floorM.color.setHex(0xdfe5e2);else floorM.color.copy(bg).multiplyScalar(.5);
    if(TW.rim)TW.rim.color.copy(ac);grid.visible=document.documentElement.dataset.pal!='graphite'};
  TW.tick=now=>{
    const dt=Math.min(.1,(now-last)/1000);last=now;
    let fl=1;
    ids.forEach(id=>{const s=ST[id],run=statusOf(id)=='CRITICAL'?0:CTLF(id);s.run+=(run-s.run)*Math.min(1,dt*4);fl=Math.min(fl,run)});
    flow+=(fl-flow)*Math.min(1,dt*2.5);base+=V0*flow*dt;
    ids.forEach(id=>{const s=ST[id],pc=cars.find(c=>c.g.visible&&Math.abs(c.s-SPOS[id])<1.7),on=!!pc,er=Math.min(s.run,flow),rel=pc?pathAt(pc.s).x-s.x:0;s.t+=dt*er;s.anim(s.t,er,on,rel);
      const st=statusOf(id),lm=s.lamps;lm[0].emissiveIntensity=st=='OK'?1.3:.05;lm[1].emissiveIntensity=st=='WARNING'?1.3+.6*Math.sin(now/180):.05;lm[2].emissiveIntensity=st=='CRITICAL'?1.4+.8*Math.sin(now/110):.05;
      const gm=s.glow.material;if(st=='CRITICAL'){gm.color.setHex(0xff3b30);gm.opacity=.28+.18*Math.sin(now/160)}else if(st=='WARNING'){gm.color.setHex(0xffb020);gm.opacity=.2}else if(s.sel){gm.color.setHex(0x3ddc97);gm.opacity=.22}else gm.opacity=0});
    // машины
    cars.forEach(c=>{const u=base+c.k*SPC,s=((u%L)+L)%L,lap=Math.floor(u/L),serial=c.k+N*lap;c.s=s;
      if(serial!==c.serial){c.serial=serial;const m=SEQ[serial%SEQ.length];c.model=m;c.col.setHex(MODELS[m].c);c.inner.scale.set(...MODELS[m].s)}
      const pa=pathAt(s);c.g.position.set(pa.x,0,pa.z);c.g.rotation.y=-pa.a;
      const k=Math.min(clamp(s/1.2),clamp((L-s)/1.8));c.g.visible=k>.01;c.g.scale.setScalar(SCALE*Math.max(.01,smooth(k)));
      stg(c,'eng',SPOS.cnc_milling_05);stg(c,'axl',SPOS.cnc_milling_05+.4);stg(c,'floorP',SPOS.stamp_press_04);
      stg(c,'lower',SPOS.laser_grind_07);stg(c,'cab',SPOS.weld_robot_01);
      const pk=clamp((s-(SPOS.paint_spray_02-2.4))/4.8);col.copy(STEEL).lerp(c.col,pk);c.body.color.copy(col);
      stg(c,'gl',SPOS.assembly_line_03-.6);stg(c,'wheels',SPOS.assembly_line_03);stg(c,'lights',SPOS.assembly_line_03+.6);stg(c,'trim',SPOS.assembly_line_03+.3);
      const p=c.parts;p.floorP.visible=p.floorP.visible&&!p.lower.visible;stg(c,'ok',SPOS.quality_scan_06+.8,.8)});
    // лента
    const sp=flow*V0*dt/.9;tA.offset.x-=sp;tB.offset.x+=sp;
    // камера
    if(fly){const k=clamp((now-fly.t0)/fly.ms),e=smooth(k);cam.position.lerpVectors(fly.p0,fly.p1,e);oc.target.lerpVectors(fly.g0,fly.g1,e);if(k>=1)fly=null}
    // тема пола
    if(now-themeT>500){themeT=now;themeApply()}
    place();
  };

  // первый кадр: линия + общий план
  showDetailObjs(false);lineMode();const o=overview();cam.position.copy(o.pos);oc.target.copy(o.tgt);
  new ResizeObserver(()=>{if(TW.lineOn&&!focused&&!userMoved){fly=null;const o=overview();cam.position.copy(o.pos);oc.target.copy(o.tgt)}}).observe(el);
  TW.dl.castShadow=false;const _fx=fx;fx=function(){_fx();if(TW.lineOn)TW.dl.castShadow=false};
  const dlOn=TW.openDetail=openDetail;TW.openLine=openLine;TW.home=home;TW.focus=()=>focused;
  r.setPixelRatio(Math.min(devicePixelRatio,1.5));
  setBtns();setFocus(false);TW.ready=true;ui();labelData();
}

/* ------------------------------------------------------------ запуск */
CTL.refresh();setInterval(()=>CTL.refresh(),1200);
setInterval(()=>{try{labelData()}catch(e){}},500);
ui();
})();
