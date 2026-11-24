// 1. Renseigne ces deux valeurs (Supabase > Project Settings > API)
const SUPABASE_URL='https://ampsxovfcmobrixmydyh.supabase.co',SUPABASE_KEY='sb_publishable_8aY14_8zZ0ASUaDEquKGXw_TtsAe9tQ';

const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hue=s=>[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
let me,people=[],books=[],added=[],tab='lib',cur=null,flt='all',q='',scanning=false,stream,zx,tt;
const inv=new URLSearchParams(location.search).get('i');if(inv)localStorage.setItem('inv',inv);
const nm=id=>(id===me.id?me:people.find(p=>p.id===id))?.name||'un ami';
const mine=()=>books.filter(b=>b.owner===me.id);
function toast(x){const e=$('#toast');e.textContent=x;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),2500)}

/* ---------- Couvertures et infos livre ---------- */
async function lookup(isbn){
  const r={title:null,authors:'',cover:null,comic:false};
  try{ // Google Books : bon pour les BD et éditions françaises
    const j=await (await fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:'+isbn)).json();
    const v=j.items?.[0]?.volumeInfo;
    if(v){r.title=v.title+(v.subtitle?' : '+v.subtitle:'');r.authors=(v.authors||[]).join(', ');
      r.cover=v.imageLinks?.thumbnail?.replace('http:','https:').replace('zoom=1','zoom=2');
      r.comic=/comic|graphic|bande|manga/i.test((v.categories||[]).join(' '))}
  }catch{}
  if(!r.title)try{ // Open Library en secours
    const j=await (await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)).json();
    const v=j['ISBN:'+isbn];
    if(v){r.title=v.title;r.authors=(v.authors||[]).map(a=>a.name).join(', ');r.cover=v.cover?.medium}
  }catch{}
  if(!r.cover)r.cover=`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  return r;
}
// Couverture générée dessous : elle reste visible si l'image est absente ou invalide
const cover=(b,c='')=>`<div class="cv ${c}" style="--h:${hue(b.title)}"><span>${esc(b.title)}</span>${b.cover_url?`<img src="${esc(b.cover_url)}" alt="" loading="lazy" onerror="this.remove()" onload="if(this.naturalWidth<30)this.remove()">`:''}</div>`;

/* ---------- Connexion ---------- */
function login(){
  $('#m').innerHTML=`<h1>Biblio entre amis</h1><p class="sub">Entre ton e-mail, tu recevras un lien de connexion.</p>
  <input id="em" type="email" placeholder="toi@exemple.fr" autocomplete="email"><button class="btn" onclick="sendLink()">Recevoir le lien</button>`;
  $('#nav').innerHTML='';
}
async function sendLink(){
  const email=$('#em').value.trim();if(!email)return;
  const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  toast(error?error.message:'Lien envoyé, regarde tes e-mails');
}
async function start(user){
  if(me?.id===user.id)return;
  const code=localStorage.getItem('inv');
  if(code){const{data}=await sb.rpc('accept_invite',{c:code});localStorage.removeItem('inv');history.replaceState({},'',location.pathname);
    if(data)setTimeout(()=>toast('Tu es maintenant en contact avec '+data),600)}
  await load(user.id);render();
}
async function load(id){
  const[{data:p},{data:b}]=await Promise.all([sb.from('profiles').select('*'),sb.from('books').select('*').order('created_at',{ascending:false})]);
  me=p.find(x=>x.id===id);people=p.filter(x=>x.id!==id);books=b||[];
}
sb.auth.onAuthStateChange((_,s)=>{if(s)start(s.user);else{me=null;login()}});

/* ---------- Vues ---------- */
function gridHTML(){
  const L=mine().filter(b=>flt==='all'||(flt==='liv'&&!b.is_comic)||(flt==='bd'&&b.is_comic)||(flt==='out'&&b.lent_to))
    .filter(b=>(b.title+' '+b.authors).toLowerCase().includes(q.toLowerCase()));
  if(!L.length)return'<p class="empty">Aucun livre ici. Va dans Scanner pour en ajouter.</p>';
  return'<div class="grid">'+L.map(b=>`<button class="tile" onclick="sheet('${b.id}')">${cover(b)}${b.lent_to?`<div class="stamp">Prêté à ${esc(nm(b.lent_to))}</div>`:b.request_by?`<div class="stamp">Demandé par ${esc(nm(b.request_by))}</div>`:''}<small>${esc(b.title)}</small><em>${esc(b.authors)}</em></button>`).join('')+'</div>';
}
const views={
  lib:()=>`<h1>Ma bibliothèque</h1><p class="sub">${mine().length} livres et BD, ${mine().filter(b=>b.lent_to).length} prêtés</p>
    <input type="search" placeholder="Chercher un titre ou un auteur" value="${esc(q)}" oninput="q=this.value;$('#grid').innerHTML=gridHTML()">
    <div class="chips">${[['all','Tous'],['liv','Livres'],['bd','BD'],['out','Prêtés']].map(([k,v])=>`<button class="chip ${flt===k?'on':''}" onclick="flt='${k}';render()">${v}</button>`).join('')}</div><div id="grid">${gridHTML()}</div>`,
  scan:()=>`<h1>Scanner</h1><p class="sub">Vise le code-barres au dos du livre. Les ajouts s’enchaînent.</p>
    <div class="view"><video id="vid" playsinline muted></video><i></i></div>
    <button class="btn alt" onclick="manual()">Saisir un ISBN à la main</button>
    <h2>Ajoutés (<span id="n">${added.length}</span>)</h2><div id="added" class="card">${addedHTML()}</div>`,
  fr:()=>`<h1>Mes amis</h1><p class="sub">Ceux qui ouvrent ton lien voient ta bibliothèque, et toi la leur.</p>
    <div class="card"><div class="link">${esc(location.origin+location.pathname+'?i='+me.code)}</div>
    <button class="btn" onclick="share()">Partager mon lien</button><button class="btn alt" onclick="rename()" style="margin-bottom:10px">Je m’appelle ${esc(me.name)} (modifier)</button></div>
    <h2>${people.length} contacts</h2>${people.length?`<div class="card">${people.map(f=>`<button class="row" onclick="cur='${f.id}';render()"><div class="t"><b>${esc(f.name)}</b><span>${books.filter(b=>b.owner===f.id).length} livres</span></div></button>`).join('')}</div>`:'<p class="empty">Partage ton lien pour ajouter ton premier ami.</p>'}`,
  friend:()=>{const L=books.filter(b=>b.owner===cur);return`<button class="back" onclick="cur=null;render()">‹ Mes amis</button><h1>Chez ${esc(nm(cur))}</h1><p class="sub">${L.length} livres et BD</p>
    <div class="card">${L.map(b=>`<div class="row">${cover(b,'sm')}<div class="t"><b>${esc(b.title)}</b><span>${esc(b.authors)}</span></div>${b.lent_to?'<span class="am">Prêté</span>':b.request_by===me.id?'<span class="am">Demande envoyée</span>':b.request_by?'<span class="am">Déjà demandé</span>':`<button class="btn sm" onclick="ask('${b.id}')">Emprunter</button>`}</div>`).join('')||'<p class="empty">Rien pour l’instant.</p>'}</div>`},
  loans:()=>{const out=mine().filter(b=>b.lent_to||b.request_by),inn=books.filter(b=>b.owner!==me.id&&(b.lent_to===me.id||b.request_by===me.id));
    const list=(L,f)=>L.length?`<div class="card">${L.map(b=>`<div class="row">${cover(b,'sm')}<div class="t"><b>${esc(b.title)}</b><span>${f(b)}</span></div></div>`).join('')}</div>`:'<p class="empty">Rien pour l’instant.</p>';
    return`<h1>Prêts en cours</h1><h2>Mes livres chez mes amis</h2>${list(out,b=>b.lent_to?'Prêté à '+esc(nm(b.lent_to)):'Demandé par '+esc(nm(b.request_by)))}<h2>Mes emprunts</h2>${list(inn,b=>(b.lent_to?'Chez toi, de la part de ':'En attente de ')+esc(nm(b.owner)))}`}
};
const addedHTML=()=>added.length?added.map(b=>`<div class="row">${cover(b,'sm')}<div class="t"><b>${esc(b.title)}</b><span>${esc(b.authors)}</span></div><span class="ok">Ajouté</span></div>`).join(''):'<p class="empty">Chaque code scanné apparaît ici.</p>';
function render(){
  $('#m').innerHTML=(tab==='fr'&&cur?views.friend:views[tab])();
  $('#nav').innerHTML=[['lib','📚','Biblio'],['scan','📷','Scanner'],['fr','👥','Amis'],['loans','🔁','Prêts']].map(([k,e,l])=>`<button class="tab ${tab===k?'on':''}" onclick="go('${k}')"><b>${e}</b>${l}</button>`).join('');
}
async function go(t){stopScan();tab=t;cur=null;render();if(t==='scan')startScan();else{await load(me.id);if(tab===t)render()}}

/* ---------- Actions ---------- */
async function addBook(isbn){
  if(mine().some(b=>b.isbn===isbn))return toast('Déjà dans ta bibliothèque');
  toast('Recherche en cours…');
  const r=await lookup(isbn),title=r.title||prompt('Titre introuvable. Saisis-le :');if(!title)return;
  const{data,error}=await sb.from('books').insert({isbn,title,authors:r.authors,cover_url:r.cover,is_comic:r.comic}).select().single();
  if(error)return toast('Erreur : '+error.message);
  books.unshift(data);added.unshift(data);toast('Ajouté : '+title);
  if($('#added')){$('#added').innerHTML=addedHTML();$('#n').textContent=added.length}
}
function manual(){const c=(prompt('ISBN (13 chiffres) :')||'').replace(/\D/g,'');if(c.length===13)addBook(c);else if(c)toast('ISBN invalide')}
async function upd(id,patch){const{data,error}=await sb.from('books').update(patch).eq('id',id).select().single();if(error)return toast(error.message);Object.assign(books.find(b=>b.id===id),data);closeSheet();render()}
function sheet(id){
  const b=books.find(x=>x.id===id),s=document.createElement('div');s.className='sheet';s.id='sh';
  let h=`<b style="font:700 19px Georgia,serif">${esc(b.title)}</b><p class="sub">${esc(b.authors)}</p>`;
  if(b.lent_to)h+=`<button class="btn" onclick="upd('${id}',{lent_to:null})">${esc(nm(b.lent_to))} me l’a rendu</button>`;
  else{if(b.request_by)h+=`<button class="btn" onclick="upd('${id}',{lent_to:'${b.request_by}',request_by:null})">Prêter à ${esc(nm(b.request_by))} (il le demande)</button><button class="btn alt" onclick="upd('${id}',{request_by:null})">Refuser la demande</button>`;
    h+=people.filter(p=>p.id!==b.request_by).map(p=>`<button class="btn alt" onclick="upd('${id}',{lent_to:'${p.id}',request_by:null})">Prêter à ${esc(p.name)}</button>`).join('')}
  h+=`<button class="btn alt" onclick="upd('${id}',{is_comic:${!b.is_comic}})">Classer comme ${b.is_comic?'livre':'BD'}</button><button class="btn alt" onclick="del('${id}')">Supprimer</button><button class="btn" style="background:var(--ln);color:var(--ink)" onclick="closeSheet()">Fermer</button>`;
  s.innerHTML=`<div>${h}</div>`;s.onclick=e=>{if(e.target===s)closeSheet()};document.body.appendChild(s);
}
const closeSheet=()=>$('#sh')?.remove();
async function del(id){if(!confirm('Supprimer ce livre ?'))return;await sb.from('books').delete().eq('id',id);books=books.filter(b=>b.id!==id);closeSheet();render()}
async function ask(id){const{error}=await sb.rpc('request_book',{bid:id});if(error)return toast(error.message);toast('Demande envoyée');await load(me.id);render()}
async function rename(){const n=prompt('Ton prénom :',me.name);if(!n)return;await sb.from('profiles').update({name:n.trim()}).eq('id',me.id);me.name=n.trim();render()}
async function share(){const url=location.origin+location.pathname+'?i='+me.code,text='Rejoins-moi pour échanger nos livres et BD';
  try{navigator.share?await navigator.share({title:'Biblio entre amis',text,url}):(await navigator.clipboard.writeText(url),toast('Lien copié'))}catch{}}

/* ---------- Scan code-barres ---------- */
let last='',lastT=0;
const hit=c=>{if(!/^97[89]\d{10}$/.test(c)||(c===last&&Date.now()-lastT<4000))return;last=c;lastT=Date.now();try{navigator.vibrate(40)}catch{}addBook(c)};
async function startScan(){
  scanning=true;
  try{
    if('BarcodeDetector' in window){ // Android / Chrome
      const d=new BarcodeDetector({formats:['ean_13']}),v=$('#vid');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});v.srcObject=stream;await v.play();
      (async()=>{while(scanning){try{const r=await d.detect(v);if(r[0])hit(r[0].rawValue)}catch{}await new Promise(r=>setTimeout(r,250))}})();
    }else{ // iPhone / Safari : ZXing
      zx=new ZXing.BrowserMultiFormatReader();zx.decodeFromVideoDevice(null,'vid',r=>{if(r)hit(r.getText())});
    }
  }catch{toast('Caméra inaccessible : autorise-la ou saisis l’ISBN à la main')}
}
function stopScan(){scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;try{zx?.reset()}catch{}zx=null}
