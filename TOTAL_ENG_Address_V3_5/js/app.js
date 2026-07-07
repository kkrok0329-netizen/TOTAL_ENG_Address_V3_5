const APP_VERSION = 'V3.5.0';
let sites = [];
let meta = {};
let currentType = 'all';
let deferredInstallPrompt = null;
let favorites = JSON.parse(localStorage.getItem('tea_favorites') || '[]');
let recentVisits = JSON.parse(localStorage.getItem('tea_recentVisits') || '[]');
let recentSearches = JSON.parse(localStorage.getItem('tea_recentSearches') || '[]');

const $ = (id) => document.getElementById(id);
const els = {
  splash: $('splash'), siteList: $('siteList'), searchInput: $('searchInput'), clearBtn: $('clearBtn'),
  countText: $('countText'), headerCount: $('headerCount'), favoriteTopBox: $('favoriteTopBox'),
  detailModal: $('detailModal'), detailContent: $('detailContent'), closeDetailBtn: $('closeDetailBtn'),
  darkModeBtn: $('darkModeBtn'), toast: $('toast'), refreshBtn: $('refreshBtn'), installBtn: $('installBtn'),
  versionText: $('versionText'), updatedText: $('updatedText')
};

function saveStorage(){
  localStorage.setItem('tea_favorites', JSON.stringify(favorites));
  localStorage.setItem('tea_recentVisits', JSON.stringify(recentVisits));
  localStorage.setItem('tea_recentSearches', JSON.stringify(recentSearches));
}
function cleanNumber(value){
  const n = Number(String(value ?? '0').replace(/[^0-9.-]/g,''));
  return Number.isFinite(n) ? n : 0;
}
function money(value){
  if(value === '' || value === null || value === undefined) return '-';
  const n = cleanNumber(value);
  if(!n) return '-';
  return n.toLocaleString('ko-KR') + '원';
}
function distanceText(site){ return `🚗 사무실 ${site.distance || '-'}km`; }
function totalCost(site){ return cleanNumber(site.toll) + cleanNumber(site.fuel); }
function totalCostText(site){ const cost = totalCost(site); return cost ? cost.toLocaleString('ko-KR') + '원' : '-'; }
function safeText(text){ return String(text || '').replace(/'/g, "\\'").replace(/\n/g,' '); }
function regionLabel(value){
  if(!value) return '';
  if(String(value).includes('서.경')) return '서울·경기';
  if(String(value).includes('지방')) return '지방';
  return String(value);
}
function regionClass(value){
  if(!value) return '';
  if(String(value).includes('지방')) return 'region-local';
  return 'region-capital';
}

async function loadData(){
  try{
    setLoading('불러오는 중...');
    const res = await fetch('data/sites.json?ts=' + Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error('sites.json을 찾을 수 없습니다.');
    const data = await res.json();
    meta = data.meta || {};
    sites = Array.isArray(data.sites) ? data.sites : [];
    updateMeta();
    render();
    const appInfoText = document.getElementById("appInfoText");
if (appInfoText) {
  const today = new Date().toLocaleDateString("ko-KR");
  appInfoText.textContent = `등록 현장 ${sites.length}개 · 최종 업데이트 ${today}`;
}
  }catch(err){
    console.error(err);
    els.siteList.innerHTML = `<div class="empty">데이터를 불러오지 못했습니다.<br>${err.message}</div>`;
    setLoading('0개 현장');
  }finally{
    setTimeout(()=>els.splash?.classList.add('hide'), 350);
  }
}
function setLoading(text){ if(els.headerCount) els.headerCount.textContent = text; }
function updateMeta(){
  if(els.headerCount) els.headerCount.textContent = `${sites.length}개 현장`;
  if(els.versionText) els.versionText.textContent = meta.version || APP_VERSION;
  if(els.updatedText) els.updatedText.textContent = `업데이트 ${meta.updatedAt || '-'}`;
}
function filteredSites(){
  const keyword = (els.searchInput.value || '').trim().toLowerCase();
  let data = [...sites];
  if(currentType === 'general') data = data.filter(s=>s.type === 'general');
  if(currentType === 'coupang') data = data.filter(s=>s.type === 'coupang');
  if(currentType === 'favorite') data = data.filter(s=>favorites.includes(s.id));
  if(currentType === 'recent') data = data.filter(s=>recentVisits.includes(s.id));
  if(keyword){
    data = data.filter(s => [s.name,s.address,s.note,s.page,s.region].join(' ').toLowerCase().includes(keyword));
  }
  if(currentType === 'recent') data.sort((a,b)=>recentVisits.indexOf(a.id)-recentVisits.indexOf(b.id));
  return data;
}
function render(){
  const data = filteredSites();
  updateMeta();
  if(els.countText) els.countText.textContent = `전체 ${data.length}개`;
  renderFavoriteTop();
  els.siteList.innerHTML = '';
  if(!data.length){ els.siteList.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
  els.siteList.innerHTML = data.map(siteCard).join('');
}
function siteCard(site){
  const isCoupang = site.type === 'coupang';
  const isFav = favorites.includes(site.id);
  const region = isCoupang ? regionLabel(site.region || site.page) : '';
  return `<article class="site-card" onclick="openDetail(${site.id})">
    <div class="card-head">
      <span class="type-badge ${isCoupang?'coupang':''}">${isCoupang?'📦 쿠팡':'🏗️ 일반현장'}</span>
      <button class="favorite-btn" type="button" onclick="toggleFavorite(event, ${site.id})">${isFav?'⭐':'☆'}</button>
    </div>
    <div class="site-title">${site.name}</div>
    <div class="address">📍 ${site.address}</div>
    <div class="info-grid">
      <div class="info-box"><span>거리</span><strong>${distanceText(site)}</strong></div>
      <div class="info-box"><span>예상비용</span><strong>💰 ${totalCostText(site)}</strong></div>
      <div class="info-box"><span>주유비</span><strong>${money(site.fuel)}</strong></div>
    </div>
    <div class="meta-row">
      ${site.toll ? `<span class="meta-chip">💳 톨비 ${money(site.toll)}</span>` : ''}
      ${site.note ? `<span class="meta-chip">📝 ${site.note}</span>` : ''}
      ${region ? `<span class="meta-chip ${regionClass(region)}">📍 ${region}</span>` : ''}
      ${site.warranty ? `<span class="meta-chip">🛡 ${site.warranty}</span>` : ''}
    </div>
    <div class="card-buttons">
      <button type="button" onclick="copyAddress(event, '${safeText(site.address)}')">📋 주소복사</button>
      <button type="button" onclick="openMap(event, '${safeText(site.address)}', 'tmap')">🚗 티맵</button>
      <button type="button" onclick="openMap(event, '${safeText(site.address)}', 'kakao')">카카오내비</button>
      <button type="button" onclick="openMap(event, '${safeText(site.address)}', 'naver')">네이버지도</button>
    </div>
  </article>`;
}
function renderFavoriteTop(){
  if(!els.favoriteTopBox) return;
  const favs = sites.filter(s=>favorites.includes(s.id)).slice(0,10);
  if(!favs.length){ els.favoriteTopBox.classList.remove('show'); els.favoriteTopBox.innerHTML=''; return; }
  els.favoriteTopBox.classList.add('show');
  els.favoriteTopBox.innerHTML = `<div class="favorite-top-title">⭐ 즐겨찾기 현장</div><div class="favorite-top-list">${favs.map(s=>`<button class="favorite-chip" type="button" onclick="openDetail(${s.id})"><strong>⭐ ${s.name}</strong><span>${distanceText(s)}</span></button>`).join('')}</div>`;
}
function toggleFavorite(event,id){
  event.stopPropagation();
  favorites = favorites.includes(id) ? favorites.filter(x=>x!==id) : [id, ...favorites];
  saveStorage(); render();
}
function openDetail(id){
  const site = sites.find(s=>s.id===id); if(!site) return;
  recentVisits = [id, ...recentVisits.filter(x=>x!==id)].slice(0,20); saveStorage();
  const isCoupang = site.type === 'coupang'; const region = isCoupang ? regionLabel(site.region || site.page) : '';
  els.detailContent.innerHTML = `<span class="type-badge ${isCoupang?'coupang':''}">${isCoupang?'📦 쿠팡':'🏗️ 일반현장'}</span>
    <div class="detail-title">${site.name}</div><div class="detail-address">📍 ${site.address}</div>
    <div class="info-grid"><div class="info-box"><span>거리</span><strong>${distanceText(site)}</strong></div><div class="info-box"><span>톨비</span><strong>${money(site.toll)}</strong></div><div class="info-box"><span>주유비</span><strong>${money(site.fuel)}</strong></div></div>
    <div class="info-grid"><div class="info-box"><span>예상비용</span><strong>💰 ${totalCostText(site)}</strong></div><div class="info-box"><span>구분</span><strong>${isCoupang?'쿠팡':'일반'}</strong></div><div class="info-box"><span>${isCoupang?'지역':'PAGE'}</span><strong>${isCoupang ? (region || '-') : (site.page || '-')}</strong></div></div>
    <div class="meta-row">${site.note?`<span class="meta-chip">📝 ${site.note}</span>`:''}${site.warranty?`<span class="meta-chip">🛡 Warranty ${site.warranty}</span>`:''}</div>
    <div class="detail-buttons"><button class="btn-copy" type="button" onclick="copyAddress(event, '${safeText(site.address)}')">📋 주소복사</button><button class="btn-tmap" type="button" onclick="openMap(event, '${safeText(site.address)}', 'tmap')">🚗 티맵</button><button class="btn-kakao" type="button" onclick="openMap(event, '${safeText(site.address)}', 'kakao')">카카오내비</button><button class="btn-naver" type="button" onclick="openMap(event, '${safeText(site.address)}', 'naver')">네이버지도</button></div>`;
  els.detailModal.classList.add('show'); els.detailModal.setAttribute('aria-hidden','false');
}
function closeDetail(){ els.detailModal.classList.remove('show'); els.detailModal.setAttribute('aria-hidden','true'); }
function toast(message){
  if(!els.toast) return alert(message);
  els.toast.textContent = message; els.toast.classList.add('show');
  setTimeout(()=>els.toast.classList.remove('show'), 1600);
}
function copyAddress(event,address){
  event.stopPropagation();
  navigator.clipboard?.writeText(address).then(()=>toast('주소가 복사되었습니다.')).catch(()=>{ prompt('주소를 복사하세요', address); });
}
function openMap(event,address,type){
  event.stopPropagation(); const q = encodeURIComponent(address); let url='';
  if(type==='naver') url = `https://map.naver.com/v5/search/${q}`;
  if(type==='kakao') url = `https://map.kakao.com/link/search/${q}`;
  if(type==='tmap') url = `https://www.google.com/search?q=${q}+티맵`;
  window.open(url,'_blank');
}
function initEvents(){
  els.searchInput.addEventListener('input', render);
  els.searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const k=els.searchInput.value.trim(); if(k){ recentSearches=[k,...recentSearches.filter(x=>x!==k)].slice(0,10); saveStorage(); } } });
  els.clearBtn.addEventListener('click', ()=>{ els.searchInput.value=''; render(); });
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{ document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active'); currentType=tab.dataset.type; render(); }));
  els.closeDetailBtn.addEventListener('click', closeDetail);
  els.detailModal.addEventListener('click', e=>{ if(e.target === els.detailModal) closeDetail(); });
  const darkModeBtn = $("darkModeBtn");
const settingModal = $("settingModal");
const closeSettingBtn = $("closeSettingBtn");
const refreshCacheBtn = $("refreshCacheBtn");
const settingCount = $("settingCount");

if (darkModeBtn) {
  darkModeBtn.textContent = "⚙️";
  darkModeBtn.onclick = () => {
    if (settingCount) {
      settingCount.textContent = sites.length + "개";
    }
    settingModal.classList.add("show");
  };
}

if (closeSettingBtn) {
  closeSettingBtn.onclick = () => {
    settingModal.classList.remove("show");
  };
}

if (refreshCacheBtn) {
  refreshCacheBtn.onclick = () => {
    location.reload();
  };
}
const darkToggleBtn = $("darkToggleBtn");

if (darkToggleBtn) {
  darkToggleBtn.onclick = () => {
    document.body.classList.toggle("dark");
  };
}
  els.refreshBtn.addEventListener('click', loadData);
  window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredInstallPrompt = e; els.installBtn.hidden = false; });
  els.installBtn.addEventListener('click', async()=>{ if(!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; els.installBtn.hidden=true; });
}
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
  }
}
initEvents(); registerServiceWorker(); loadData();
function renderFavoriteTop() {
  const box = document.getElementById("favoriteTopBox");
  if (!box) return;

  const favSites = sites.filter(site => favorites.includes(site.id)).slice(0, 10);

  if (favSites.length === 0) {
    box.classList.remove("show");
    box.innerHTML = "";
    return;
  }

  box.classList.add("show");
  box.innerHTML = `
    <div class="favorite-top-title">⭐ 즐겨찾기 현장</div>
    <div class="favorite-top-list">
      ${favSites.map(site => `
        <button class="favorite-chip" onclick="openDetail(${site.id})">
          ⭐ ${site.name}
          <small>🚗 사무실 ${site.distance || "-"}km</small>
        </button>
      `).join("")}
    </div>
  `;
}