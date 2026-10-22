const $ = id => document.getElementById(id);
const app = window.businessApp;
let client, user, revision=0, dirty=false, busy=false, blocked=false, ready=false;
let draftKey='', timer, lastSaved='';
const status = text => { $('cloudStatus').textContent=text; };
const message = text => { $('authMessage').textContent=text; };
const lock = value => { $('appPanel').inert=value; };

window.validateBusinessData = function(data){
  if(!data || !Array.isArray(data.units) || !Array.isArray(data.cash)) throw Error('Format backup tidak valid.');
  const date = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const money = v => typeof v==='number' && Number.isFinite(v) && v>=0;
  for(const [kind,rows] of Object.entries({units:data.units,cash:data.cash})){
    const ids=new Set();
    for(const r of rows){
      if(!r || !/^[\w-]{1,100}$/.test(String(r.id)) || ids.has(String(r.id))) throw Error('ID data tidak valid atau duplikat.');
      ids.add(String(r.id));
      if(kind==='units'){
        if(typeof r.model!=='string' || !money(r.buyPrice) || !date(r.buyDate) ||
          (r.sellPrice!=null && (!money(r.sellPrice) || !date(r.sellDate)))) throw Error('Data unit tidak valid.');
      }else if(typeof r.desc!=='string' || typeof r.category!=='string' || !money(r.amount) || !date(r.date) || !['in','out'].includes(r.type)) throw Error('Data kas tidak valid.');
    }
  }
  return JSON.parse(JSON.stringify(data));
};
function persist(){
  try{ localStorage.setItem(draftKey,JSON.stringify({revision,dirty,payload:app.get()})); return true; }
  catch{ status('Penyimpanan browser penuh/diblokir. Download backup dan coba sinkronkan.');return false; }
}
function conflict(){
  blocked=true;lock(true);$('conflictPanel').hidden=false;
  status('Perubahan dari perangkat lain terdeteksi — pilih penyelesaian di bawah.');
}
async function readCloud(){
  const {data,error}=await client.from('iphone_business').select('payload,revision').eq('user_id',user.id).maybeSingle();
  if(error) throw error;
  if(data) window.validateBusinessData(data.payload);
  return data;
}
window.cloudQueue = ()=>{
  if(!ready || blocked) return;
  dirty=true;persist();status('Perubahan belum tersinkron…');
  clearTimeout(timer);timer=setTimeout(sync,500);
};
async function sync(){
  if(!ready || busy || blocked) return;
  busy=true;
  try{
    if(dirty){
      const snapshot=window.validateBusinessData(app.get());
      const serialized=JSON.stringify(snapshot);
      const {data,error}=await client.rpc('save_iphone_business',{p_payload:snapshot,p_revision:revision});
      if(error){if(error.code==='40001' || error.message?.includes('VERSION_CONFLICT')){conflict();return;}throw error;}
      revision=data;lastSaved=serialized;
      dirty=JSON.stringify(app.get())!==serialized;
      persist();
    }else{
      const row=await readCloud();
      // A local edit may have happened while this read was in flight.
      if(dirty) return;
      if(row && row.revision!==revision){revision=row.revision;app.set(row.payload);lastSaved=JSON.stringify(app.get());persist();}
    }
    status(dirty?'Masih ada perubahan menunggu…':'Tersinkron • '+new Date().toLocaleTimeString('id-ID'));
  }catch(e){status('Belum tersinkron. Periksa internet/login, lalu klik Sinkronkan. Perubahan tetap di browser ini.');}
  finally{busy=false;if(dirty && !blocked && JSON.stringify(app.get())!==lastSaved) { /* retry on button/online/periodic tick */ }}
}
async function openAccount(session){
  user=session.user;draftKey='iphone-cloud-draft:'+new URL(window.APP_CONFIG.supabaseUrl).host+':'+user.id;
  const row=await readCloud();
  let draft;
  try{draft=JSON.parse(localStorage.getItem(draftKey)||'null');if(draft) window.validateBusinessData(draft.payload);}catch{throw Error('Salinan lokal rusak. Jangan hapus data browser; pulihkan dari backup.');}
  revision=row?.revision||0;blocked=false;
  if(draft?.dirty){
    app.set(draft.payload);dirty=true;
    if(draft.revision!==revision) conflict();
  }else{
    app.set(row?.payload||{units:[],cash:[]});dirty=false;
  }
  ready=true;lock(blocked);$('authPanel').hidden=true;$('appPanel').hidden=false;$('cloudBar').hidden=false;
  if(!blocked){persist();await sync();}
}
$('loginForm').onsubmit=async e=>{
  e.preventDefault();if(!client) return;
  $('loginButton').disabled=true;message('Masuk…');
  try{
    const {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    $('password').value='';if(error) throw error;await openAccount(data.session);
  }catch{message('Gagal membuka akun. Periksa email/password, internet, dan setup database.');}
  finally{$('loginButton').disabled=false;}
};
$('syncButton').onclick=sync;
$('conflictBackup').onclick=()=>document.getElementById('exportLink').click();
$('useCloud').onclick=async()=>{
  if(!confirm('Sudah download perubahan lokal? Versi online akan mengganti tampilan lokal.')) return;
  try{const row=await readCloud();app.set(row?.payload||{units:[],cash:[]});revision=row?.revision||0;dirty=false;blocked=false;persist();$('conflictPanel').hidden=true;lock(false);status('Versi online berhasil dimuat.');}
  catch{status('Gagal mengambil versi online. Coba lagi.');}
};
$('logoutButton').onclick=async()=>{
  if(busy){status('Tunggu proses sinkron selesai sebelum keluar.');return;}
  if(dirty){status('Masih ada perubahan lokal. Sinkronkan atau selesaikan konflik sebelum keluar.');return;}
  ready=false;lock(true);
  // Local sign-out works even when the server is unreachable.
  await client.auth.signOut({scope:'local'});
  localStorage.removeItem(draftKey);app.set({units:[],cash:[]});location.reload();
};
window.addEventListener('online',sync);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
setInterval(sync,15000);
async function start(){
  try{
    const config=window.APP_CONFIG;
    if(!config || config.supabaseUrl.includes('PROJECT_REF') || !config.supabasePublishableKey.startsWith('sb_publishable_')) throw Error('Isi URL project dan publishable key Supabase pada config.js terlebih dahulu.');
    const url=new URL(config.supabaseUrl);if(url.protocol!=='https:' || !url.hostname.endsWith('.supabase.co')) throw Error('URL Supabase tidak valid.');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    client=createClient(config.supabaseUrl,config.supabasePublishableKey);
    const {data,error}=await client.auth.getSession();if(error) throw error;
    if(data.session) await openAccount(data.session);
    else message('Masuk memakai akun yang dibuat di Supabase.');
  }catch(e){message(e.message||'Koneksi gagal. Muat ulang untuk mencoba lagi.');}
}
start();
