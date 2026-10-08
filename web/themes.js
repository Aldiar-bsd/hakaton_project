/* Allur: палитры. Тема = РЕЖИМ (светлая / тёмная / авто, C.th) + ПАЛИТРА (цвета, C.pal).
   Палитра никогда не переключает режим: выбрали «Океан» в светлой теме — получили светлый «Океан».
   Каждая палитра описана для обоих режимов. Применяется через :root[data-theme=light|dark][data-pal=<id>]. */
(()=>{
/* цвета — только в hex: 3D-движок (THREE.Color) и графики (Chart.js) не понимают современную запись hsl(215 42% 7.5%) */
const hsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('').toUpperCase()};
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`};

/* h/s — оттенок и насыщенность нейтралей; d/l — акценты в тёмном и светлом режимах: [основной, второй] */
const PALS=[
 {id:'allur',   n:'Классика|Классика|Classic',                          h:160,s:12,d:['#4CCB9B','#78A2F2'],l:['#0F8F6B','#3E63D6'],base:true},
 {id:'amber',   n:'Industrial Amber|Industrial Amber|Industrial Amber',   h:215,s:12,d:['#F5902C','#7FA9D8'],l:['#D4690A','#3A6EA5'],
  dark:{bg:'#14171C',p:'#1B1F26',p2:'#232831',ink:'#EEEAE3',mut:'#9CA3AD',ln:'#2D333D',s1:'#2B313C',s2:'#101318'}},
 {id:'emerald', n:'Emerald Mint|Emerald Mint|Emerald Mint', h:185,s:20,d:['#3FCFA0','#2DB6C6'],l:['#0B9B73','#1590A0'],
  dark:{bg:'#0D1517',p:'#121D20',p2:'#19272B',ink:'#E4F1EE',mut:'#8BA8A7',ln:'#213539',s1:'#1D3A3F',s2:'#0A1113'}},
 {id:'violet',  n:'Сине-фиолетовая|Көк-күлгін|Blue & Purple',  h:235,s:22,d:['#7F8FFF','#B583FF'],l:['#5565E8','#8B4FE0'],
  dark:{bg:'#11121C',p:'#181A28',p2:'#20233A',ink:'#E9EAF6',mut:'#9598B6',ln:'#2B2F4B',s1:'#2C3057',s2:'#0E0F19'}},
 {id:'cyan',    n:'Циан и электрик|Циан және электрик|Cyan & Electric', h:203,s:28,d:['#27D3EE','#4B8BFF'],l:['#0A8DB0','#2F66D9'],
  dark:{bg:'#0A1118',p:'#0F1A24',p2:'#15232F',ink:'#E4F2FB',mut:'#87A4B9',ln:'#1C3143',s1:'#173549',s2:'#070D13'}},
 {id:'graphite',n:'Graphite|Graphite|Graphite',                      h:240,s:2, d:['#4ADE80','#8AB4FF'],l:['#1E9A4C','#3B6BDB'],
  dark:{bg:'#111112',p:'#1A1A1C',p2:'#242427',ink:'#ECECEE',mut:'#9C9CA4',ln:'#37373D',s1:'#2A2A2D',s2:'#0F0F10'}},
 /* новые */
 {id:'ocean',   n:'Океан|Мұхит|Ocean',                           h:215,s:42,d:['#4DA3FF','#7AD7F0'],l:['#1D6FD6','#0E9AB5']},
 {id:'rose',    n:'Роза|Раушан|Rose',                            h:335,s:26,d:['#FF5C8A','#C58BFF'],l:['#D6336C','#8E44C9']},
 {id:'sunset',  n:'Закат|Күн батуы|Sunset',                      h:14, s:28,d:['#FF7A4D','#FFC24D'],l:['#E0522A','#B97A00']},
 {id:'forest',  n:'Лес|Орман|Forest',                            h:130,s:20,d:['#8BCB5A','#4DB6A0'],l:['#3F8F1F','#1E8C7A']},
 {id:'sand',    n:'Песок и бирюза|Құм және көгілдір|Sand & Teal', h:38, s:14,d:['#2CC4B0','#E3B05B'],l:['#0E8F85','#B8791B']},
 /* тематические: у каждой есть тёмный и светлый вариант */
 {id:'navy',    n:'Тёмно-синяя|Қою көк|Deep Navy',               h:218,s:45,d:['#4DA3FF','#5EEAD4'],l:['#1D5FD0','#0E8F8A'],
  dark:{bg:'#0A1628',p:'#0F2038',p2:'#162B49',ink:'#E6EEF9',mut:'#8CA3C2',ln:'#223B5E',s1:'#1B3A63',s2:'#07111F'}},
 {id:'cyber',   n:'Neon Cyberpunk|Neon Cyberpunk|Neon Cyberpunk', h:285,s:30,d:['#FF2BD6','#00F0FF'],l:['#C2189E','#0A8FB0'],
  dark:{bg:'#0D0221',p:'#150533',p2:'#1F0A48',ink:'#F4E9FF',mut:'#A88BD0',ln:'#3A1670',s1:'#2D0F5E',s2:'#080118'},
  light:{bg:'#F3EDFB',p:'#FFFFFF',p2:'#EBE1F8',ink:'#24093F',mut:'#6B4C93',ln:'#D6C3EE',s1:'#F8F3FD',s2:'#CDBBE6'}},
 {id:'contrast',n:'Контрастная|Контрасты|High Contrast',          h:0,  s:0, d:['#FFD60A','#4DD0FF'],l:['#0040C8','#7A1FA2'],
  dark:{bg:'#000000',p:'#0B0B0B',p2:'#161616',ink:'#FFFFFF',mut:'#C8C8C8',ln:'#6B6B6B',s1:'#1F1F1F',s2:'#000000'},
  light:{bg:'#FFFFFF',p:'#FFFFFF',p2:'#F0F0F0',ink:'#000000',mut:'#3A3A3A',ln:'#6B6B6B',s1:'#F2F2F2',s2:'#BDBDBD'}},
 {id:'blueprint',n:'Blueprint / CAD|Blueprint / CAD|Blueprint / CAD', h:210,s:60,d:['#7CC4FF','#FFFFFF'],l:['#0B5CAD','#0B3A6E'],
  dark:{bg:'#0B2A4A',p:'#0F3560',p2:'#144175',ink:'#DCEBFF',mut:'#8FB4E3',ln:'#2C5C97',s1:'#18508F',s2:'#071D36'},
  light:{bg:'#EAF2FB',p:'#F7FBFF',p2:'#DCEAF8',ink:'#0B3A6E',mut:'#4A6F9C',ln:'#9BBBE0',s1:'#F2F8FF',s2:'#C5D9F0'}},
 {id:'nordic',  n:'Nordic Slate|Nordic Slate|Nordic Slate',       h:220,s:16,d:['#88C0D0','#A3BE8C'],l:['#4C7A99','#6B8F4E'],
  dark:{bg:'#2E3440',p:'#3B4252',p2:'#434C5E',ink:'#ECEFF4',mut:'#A3ABBA',ln:'#4C566A',s1:'#4C566A',s2:'#242933'},
  light:{bg:'#ECEFF4',p:'#FFFFFF',p2:'#E5E9F0',ink:'#2E3440',mut:'#5E6A80',ln:'#D8DEE9',s1:'#F2F4F8',s2:'#CBD3E1'}},
 {id:'retro',   n:'Retro Terminal|Retro Terminal|Retro Terminal', h:120,s:30,d:['#33FF66','#FFB000'],l:['#13802B','#9A6A00'],
  dark:{bg:'#030A03',p:'#071207',p2:'#0C1C0C',ink:'#7CFF8A',mut:'#3FAE4D',ln:'#145214',s1:'#0F2A0F',s2:'#010401'},
  light:{bg:'#E8F0E4',p:'#F4F9F1',p2:'#DCE8D6',ink:'#0E3B14',mut:'#3F6B45',ln:'#B5CCB0',s1:'#EEF5EA',s2:'#C3D4BD'}},
 {id:'solar',   n:'Solarized|Solarized|Solarized',               h:192,s:60,d:['#B58900','#268BD2'],l:['#A67C00','#1F78B4'],
  dark:{bg:'#002B36',p:'#073642',p2:'#0B4350',ink:'#EEE8D5',mut:'#93A1A1',ln:'#1C5461',s1:'#124B58',s2:'#001F27'},
  light:{bg:'#FDF6E3',p:'#FFFBEE',p2:'#EEE8D5',ink:'#073642',mut:'#657B83',ln:'#DDD6C1',s1:'#FBF3DC',s2:'#D9D2BC'}},
 {id:'titan',   n:'Carbon Titanium|Carbon Titanium|Carbon Titanium', h:210,s:6, d:['#B8C4D0','#6FA8DC'],l:['#4A5866','#2F6BA8'],
  dark:{bg:'#101214',p:'#181B1F',p2:'#21262B',ink:'#E9ECEF',mut:'#9AA3AD',ln:'#30363D',s1:'#2B3138',s2:'#0B0D0F'},
  light:{bg:'#E9ECEF',p:'#FFFFFF',p2:'#F1F3F5',ink:'#1B1F24',mut:'#5C6670',ln:'#D3D8DD',s1:'#F6F7F9',s2:'#C9CFD6'}},
];

const dark=p=>p.dark||{bg:hsl(p.h,p.s,7.5),p:hsl(p.h,p.s,10.5),p2:hsl(p.h,p.s,14),ink:hsl(p.h,18,92),mut:hsl(p.h,12,64),ln:hsl(p.h,p.s*.9,19),s1:hsl(p.h,p.s*1.1,20),s2:hsl(p.h,p.s,5.5)};
const light=p=>p.light||({bg:hsl(p.h,p.id=='sand'?24:18,94),p:'#FFFFFF',p2:hsl(p.h,20,97),ink:hsl(p.h,30,13),mut:hsl(p.h,9,40),ln:hsl(p.h,14,86),s1:hsl(p.h,25,97),s2:hsl(p.h,18,85)});

const vars=(v,ac,mode)=>`--bg:${v.bg};--p:${v.p};--p2:${v.p2};--ink:${v.ink};--mut:${v.mut};--ln:${v.ln};--s1:${v.s1};--s2:${v.s2};`+
  `--ac:${ac[0]};--ac2:${ac[1]};`+(mode=='dark'
   ?`--acs:${rgba(ac[0],.15)};--on:#0B0D10;--ov:${rgba(v.p,.74)};--sh:none`
   :`--acs:${rgba(ac[0],.11)};--on:#FFFFFF;--ov:rgba(255,255,255,.76);--sh:0 1px 2px rgba(20,30,40,.07)`);

let css='';
PALS.forEach(p=>{
  if(p.base)return;                                   // «Allur» — базовые переменные из index.html / themes.css
  css+=`:root[data-theme=dark][data-pal=${p.id}]{${vars(dark(p),p.d,'dark')}}\n`;
  css+=`:root[data-theme=light][data-pal=${p.id}]{${vars(light(p),p.l,'light')}}\n`;
});
/* 3D-сцена остаётся тёмной и в светлой теме: цвета тёмного режима выбранной палитры только внутри .stage */
PALS.forEach(p=>{
  if(p.base)return;
  css+=`:root[data-theme=light][data-pal=${p.id}] .stage{${vars(dark(p),p.d,'dark')};--warn:#EDB95A;--crit:#F27D72;color:var(--ink)}\n`;
});
/* особый вид отдельных тем: моноширинный шрифт, сетка «чертежа», свечение неона */
const MONO='ui-monospace,"JetBrains Mono",Consolas,"Courier New",monospace';
css+=`:root[data-pal=blueprint] body,:root[data-pal=retro] body{font-family:${MONO}}
:root[data-pal=blueprint] button,:root[data-pal=blueprint] input,:root[data-pal=blueprint] select,:root[data-pal=blueprint] textarea,
:root[data-pal=retro] button,:root[data-pal=retro] input,:root[data-pal=retro] select,:root[data-pal=retro] textarea{font-family:inherit}
:root[data-pal=blueprint] body{background-image:linear-gradient(color-mix(in srgb,var(--ac) 9%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--ac) 9%,transparent) 1px,transparent 1px);background-size:28px 28px;background-attachment:fixed}
:root[data-theme=dark][data-pal=retro] body{text-shadow:0 0 6px rgba(51,255,102,.28)}
:root[data-theme=dark][data-pal=retro] .stage,:root[data-theme=light][data-pal=retro] .stage{text-shadow:none}
:root[data-theme=dark][data-pal=cyber] .btn.pri,:root[data-theme=dark][data-pal=cyber] .sb nav button.on{box-shadow:0 0 14px rgba(255,43,214,.45)}
:root[data-theme=dark][data-pal=cyber] .g,:root[data-theme=dark][data-pal=cyber] .kpi{box-shadow:0 0 0 1px rgba(255,43,214,.18)}
`;
/* выбор палитры в «Настройках» */
css+=`.pal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;width:100%}
.pal-grid button{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--ln);border-radius:10px;background:var(--p2);color:var(--ink);cursor:pointer;font:inherit;font-size:12px;text-align:left;line-height:1.2;transition:border-color .15s,transform .15s}
.pal-grid button:hover{transform:translateY(-1px);border-color:var(--mut)}
.pal-grid button.on{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac) inset;background:var(--acs)}
.pal-grid .dot{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--p);box-shadow:0 0 0 1px var(--ln)}
.sr.pal{flex-direction:column;align-items:stretch;gap:10px}
`;
const st=document.createElement('style');st.id='pal-css';st.textContent=css;document.head.appendChild(st);

/* названия — через общий словарь переводов (RU|KK|EN) */
const dict={palette:'Палитра|Палитра|Palette'};
PALS.forEach(p=>dict['pal_'+p.id]=p.n);
if(typeof T!=='undefined')Object.assign(T,dict);

/* строка «Палитра» под выбором режима */
const mode=document.querySelector('#t-set [data-th=light]');
const row=mode&&mode.closest('.sr');
if(row){
  const sr=document.createElement('div');sr.className='sr pal';
  sr.innerHTML=`<span data-i="palette"></span><div class="pal-grid" role="group" aria-label="Палитра"></div>`;
  const grid=sr.querySelector('.pal-grid');
  PALS.forEach(p=>{
    const b=document.createElement('button');b.type='button';b.dataset.pal=p.id;
    b.innerHTML=`<span class="dot" style="background:linear-gradient(135deg,${p.d[0]} 50%,${p.d[1]} 50%)"></span><span data-i="pal_${p.id}"></span>`;
    b.onclick=()=>{C.pal=p.id;sv();theme()};
    grid.appendChild(b);
  });
  row.after(sr);
}
/* быстрая смена режима из левого меню уже есть (data-th); палитру они не трогают */
try{typeof lang==='function'&&lang();typeof seg==='function'&&seg();typeof theme==='function'&&theme()}catch(e){}
})();
