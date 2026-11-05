'use strict';

const APP_VERSION = 'V3.7.0';
const API_URL = 'https://script.google.com/macros/s/AKfycbz0X-gA6i7Y66zCArwwQ2ciCKOq-V4jLwo3_x7-2ZDdPUV5iWMfaoGJzDslmpEaE1Q8/exec';
const STORAGE_KEYS = {
  favorites: 'tea_favorites',
  recentVisits: 'tea_recentVisits',
  recentSearches: 'tea_recentSearches',
  darkMode: 'tea_darkMode',
  siteCache: 'tea_siteCache_v2',
  seenUpdateVersion: 'tea_seenUpdateVersion'
};

let sites = [];
let officialSites = [];
let officialMeta = {};
let meta = {};
let currentType = 'all';
let deferredInstallPrompt = null;
let favorites = readStoredArray(STORAGE_KEYS.favorites);
let recentVisits = readStoredArray(STORAGE_KEYS.recentVisits);
let recentSearches = readStoredArray(STORAGE_KEYS.recentSearches);
const MERGED_SITE_IDS = { 31: 25 };
let syncStatus = '최신 목록 확인 중…';

const $ = (id) => document.getElementById(id);
const els = {
  splash: $('splash'),
  siteList: $('siteList'),
  searchInput: $('searchInput'),
  clearBtn: $('clearBtn'),
  countText: $('countText'),
  headerCount: $('headerCount'),
  favoriteTopBox: $('favoriteTopBox'),
  detailModal: $('detailModal'),
  detailContent: $('detailContent'),
  closeDetailBtn: $('closeDetailBtn'),
  settingsBtn: $('settingsBtn'),
  settingsModal: $('settingsModal'),
  closeSettingsBtn: $('closeSettingsBtn'),
  darkModeToggle: $('darkModeToggle'),
  addSiteBtn: $('addSiteBtn'),
  settingsSiteSearch: $('settingsSiteSearch'),
  settingsSiteList: $('settingsSiteList'),
  siteEditorModal: $('siteEditorModal'),
  closeSiteEditorBtn: $('closeSiteEditorBtn'),
  siteEditorForm: $('siteEditorForm'),
  siteEditorTitle: $('siteEditorTitle'),
  siteIdInput: $('siteIdInput'),
  siteTypeInput: $('siteTypeInput'),
  siteNameInput: $('siteNameInput'),
  siteAddressInput: $('siteAddressInput'),
  siteNoteInput: $('siteNoteInput'),
  siteSaveBtn: $('siteSaveBtn'),
  deleteSiteBtn: $('deleteSiteBtn'),
  toast: $('toast'),
  refreshBtn: $('refreshBtn'),
  installBtn: $('installBtn'),
  versionText: $('versionText'),
  updatedText: $('updatedText'),
  syncStatus: $('syncStatus'),
  checkUpdateBtn: $('checkUpdateBtn'),
  kakaoGuide: $('kakaoGuide'),
  kakaoGuideMessage: $('kakaoGuideMessage'),
  kakaoAndroidSteps: $('kakaoAndroidSteps'),
  kakaoIosSteps: $('kakaoIosSteps'),
  openChromeBtn: $('openChromeBtn'),
  kakaoAndroidFallback: $('kakaoAndroidFallback'),
  copyAppLinkBtn: $('copyAppLinkBtn'),
  continueInKakaoBtn: $('continueInKakaoBtn'),
  updateNoticeModal: $('updateNoticeModal'),
  closeUpdateNoticeBtn: $('closeUpdateNoticeBtn')
};

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`저장 데이터 복구 실패: ${key}`, error);
    return [];
  }
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  localStorage.setItem(STORAGE_KEYS.recentVisits, JSON.stringify(recentVisits));
  localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(recentSearches));
}

function readSiteCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.siteCache) || 'null');
    if (!cached || !Array.isArray(cached.sites)) return null;
    return cached;
  } catch (error) {
    console.warn('현장 캐시를 읽지 못했습니다.', error);
    return null;
  }
}

function saveSiteCache(data) {
  try {
    localStorage.setItem(STORAGE_KEYS.siteCache, JSON.stringify({
      meta: data.meta || {},
      sites: Array.isArray(data.sites) ? data.sites : [],
      cachedAt: Date.now()
    }));
  } catch (error) {
    console.warn('현장 캐시를 저장하지 못했습니다.', error);
  }
}

function normalizeSite(site) {
  return {
    id: Number(site?.id) || 0,
    type: site?.type === 'coupang' ? 'coupang' : 'general',
    name: String(site?.name || '').trim(),
    address: String(site?.address || '').trim(),
    distance: site?.distance === '' || site?.distance === null || site?.distance === undefined
      ? ''
      : cleanNumber(site.distance),
    toll: site?.toll === '' || site?.toll === null || site?.toll === undefined
      ? ''
      : cleanNumber(site.toll),
    fuel: site?.fuel === '' || site?.fuel === null || site?.fuel === undefined
      ? ''
      : cleanNumber(site.fuel),
    note: String(site?.note || '').trim(),
    warranty: String(site?.warranty || '').trim(),
    region: String(site?.region || '').trim(),
    aliases: Number(site?.id) === 25 ? ['군포1', '군포 1'] : []
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanNumber(value) {
  const number = Number(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  if (value === '' || value === null || value === undefined) return '-';
  const number = cleanNumber(value);
  if (!number) return '-';
  return `${number.toLocaleString('ko-KR')}원`;
}

function distanceText(site) {
  return `🚗 사무실 ${escapeHtml(site.distance || '-')}km`;
}

function totalCost(site) {
  return cleanNumber(site.toll) + cleanNumber(site.fuel);
}

function totalCostText(site) {
  const cost = totalCost(site);
  return cost ? `${cost.toLocaleString('ko-KR')}원` : '-';
}

function hasTravelInfo(site) {
  return Boolean(cleanNumber(site.distance) || cleanNumber(site.toll) || cleanNumber(site.fuel));
}

function siteById(id) {
  const numericId = Number(id);
  return sites.find((site) => Number(site.id) === numericId);
}

function applySiteData(data, authoritative = false) {
  officialMeta = data.meta || {};
  meta = { ...officialMeta };
  officialSites = Array.isArray(data.sites) ? data.sites.map(normalizeSite) : [];
  sites = officialSites.map((site) => ({ ...site }));
  if (authoritative) {
    const ids = new Set(sites.map(site => site.id));
    const tidy = values => [...new Set(values.map(id => MERGED_SITE_IDS[Number(id)] || Number(id)))].filter(id => ids.has(id));
    favorites = tidy(favorites);
    recentVisits = tidy(recentVisits);
    saveStorage();
  }
  updateMeta();
  render();
  renderSettingsSiteList();
}

function hideSplashQuickly() {
  window.setTimeout(() => els.splash?.classList.add('hide'), 50);
}

async function fetchLiveData() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_URL}?action=sites&_=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Google Sheets 연결 실패');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.sites)) {
      throw new Error(data.error || '현장 데이터 형식 오류');
    }
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function loadData(options = {}) {
  const skipCache = options.skipCache === true;
  const notifyOnError = options.notifyOnError === true;
  let hasVisibleData = sites.length > 0;
  setSyncStatus('최신 목록 확인 중…');
  setLoading('불러오는 중...');

  if (!skipCache) {
    const cached = readSiteCache();
    if (cached) {
      applySiteData(cached);
      hasVisibleData = true;
      hideSplashQuickly();
    } else {
      try {
        const backupResponse = await fetch('./data/sites.json', { cache: 'force-cache' });
        if (backupResponse.ok) {
          const backupData = await backupResponse.json();
          backupData.meta = { ...(backupData.meta || {}), source: '내장 백업' };
          applySiteData(backupData);
          hasVisibleData = true;
          hideSplashQuickly();
        }
      } catch (backupError) {
        console.warn('내장 백업을 먼저 표시하지 못했습니다.', backupError);
      }
    }
  }

  try {
    const liveData = await fetchLiveData();
    applySiteData(liveData, true);
    saveSiteCache(liveData);
    setSyncStatus(`최신 목록 확인 완료 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (error) {
    setSyncStatus(hasVisibleData ? '저장된 목록 표시 중 · 연결 후 새로고침' : '목록 연결 실패 · 다시 시도해 주세요');
    console.warn('Google Sheets 최신 데이터를 불러오지 못했습니다.', error);
    if (!hasVisibleData) {
      els.siteList.innerHTML = '';
      const message = document.createElement('div');
      message.className = 'empty';
      message.textContent = '현장목록을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';
      els.siteList.appendChild(message);
      setLoading('0개 현장');
    } else if (notifyOnError) {
      toast('저장된 현장목록을 표시합니다.');
    }
  } finally {
    hideSplashQuickly();
  }
}

function setLoading(text) {
  if (els.headerCount) els.headerCount.textContent = text;
}

function updateMeta() {
  if (els.headerCount) els.headerCount.textContent = `${sites.length}개 현장`;
  if (els.versionText) els.versionText.textContent = APP_VERSION;
  if (els.updatedText) els.updatedText.textContent = `업데이트 ${meta.updatedAt || '-'}`;
}

function setSyncStatus(message) {
  syncStatus = message;
  if (els.syncStatus) els.syncStatus.textContent = syncStatus;
}

function buildingAddress(value) {
  // 층수·동호수·건물명 앞까지 비교하며 도로명 속 숫자는 유지합니다.
  const text = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/경기도/g, '경기').replace(/서울특별시/g, '서울')
    .replace(/(부산|인천|대구|대전|광주|울산)광역시/g, '$1');
  const match = text.match(/^.*?(?:로|길|동|리)\s*(?:산\s*)?\d+(?:\s*-\s*\d+)?(?=\s|번지|층|$)/);
  return normalizeSearchText(match ? match[0] : text);
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

function matchesSiteSearch(site, query) {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) return true;

  const searchTarget = normalizeSearchText([
    site.name,
    site.address,
    site.note,
    site.region,
    ...(site.aliases || []),
    site.type === 'coupang' ? '쿠팡' : '일반현장'
  ].join(' '));
  const tokens = rawQuery
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);

  return tokens.every((token) => searchTarget.includes(token));
}

function filteredSites() {
  const keyword = (els.searchInput.value || '').trim();
  let data = [...sites];

  if (currentType === 'general') data = data.filter((site) => site.type === 'general');
  if (currentType === 'coupang') data = data.filter((site) => site.type === 'coupang');
  if (currentType === 'favorite') data = data.filter((site) => favorites.includes(site.id));
  if (currentType === 'recent') data = data.filter((site) => recentVisits.includes(site.id));

  if (keyword) {
    data = data.filter((site) => matchesSiteSearch(site, keyword));
  }

  if (currentType === 'recent') {
    data.sort((a, b) => recentVisits.indexOf(a.id) - recentVisits.indexOf(b.id));
  }

  return data;
}

function render() {
  const data = filteredSites();
  updateMeta();

  if (els.countText) els.countText.textContent = `전체 ${data.length}개`;
  renderFavoriteTop();
  els.siteList.innerHTML = '';

  if (!data.length) {
    els.siteList.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>';
    return;
  }

  els.siteList.innerHTML = data.map(siteCard).join('');
}

function siteCard(site) {
  const isCoupang = site.type === 'coupang';
  const isFavorite = favorites.includes(site.id);
  const id = Number(site.id);

  return `<article class="site-card" data-action="open-detail" data-id="${id}" tabindex="0" aria-label="${escapeHtml(site.name)} 상세보기">
    <div class="card-head">
      <span class="type-badge ${isCoupang ? 'coupang' : ''}">${isCoupang ? '📦 쿠팡' : '🏗️ 일반현장'}</span>
      <button class="favorite-btn" type="button" data-action="toggle-favorite" data-id="${id}" aria-label="${isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${isFavorite ? '⭐' : '☆'}</button>
    </div>
    <div class="site-title">${escapeHtml(site.name)}</div>
    <div class="address">📍 ${escapeHtml(site.address)}</div>
    ${hasTravelInfo(site) ? `<div class="info-grid">
      <div class="info-box"><span>거리</span><strong>${distanceText(site)}</strong></div>
      <div class="info-box"><span>예상비용</span><strong>💰 ${totalCostText(site)}</strong></div>
      <div class="info-box"><span>주유비</span><strong>${money(site.fuel)}</strong></div>
    </div>` : ''}
    <div class="meta-row">
      ${site.toll ? `<span class="meta-chip">💳 톨비 ${money(site.toll)}</span>` : ''}
      ${site.note ? `<span class="meta-chip">📝 ${escapeHtml(site.note)}</span>` : ''}
      ${site.warranty ? `<span class="meta-chip">🛡 ${escapeHtml(site.warranty)}</span>` : ''}
    </div>
    <div class="card-buttons">
      <button type="button" data-action="copy" data-id="${id}">📋 주소복사</button>
      <button type="button" data-action="map" data-map="tmap" data-id="${id}">🚗 티맵</button>
      <button type="button" data-action="map" data-map="kakao" data-id="${id}">카카오내비</button>
      <button type="button" data-action="map" data-map="naver" data-id="${id}">네이버지도</button>
    </div>
  </article>`;
}

function renderFavoriteTop() {
  if (!els.favoriteTopBox) return;

  const favoriteSites = sites.filter((site) => favorites.includes(site.id)).slice(0, 10);
  if (!favoriteSites.length) {
    els.favoriteTopBox.classList.remove('show');
    els.favoriteTopBox.innerHTML = '';
    return;
  }

  els.favoriteTopBox.classList.add('show');
  els.favoriteTopBox.innerHTML = `<div class="favorite-top-title">⭐ 즐겨찾기 현장</div>
    <div class="favorite-top-list">
      ${favoriteSites.map((site) => `<button class="favorite-chip" type="button" data-action="open-detail" data-id="${Number(site.id)}">
        <strong>⭐ ${escapeHtml(site.name)}</strong>
        <span>${distanceText(site)}</span>
      </button>`).join('')}
    </div>`;
}

function toggleFavorite(id) {
  const numericId = Number(id);
  favorites = favorites.includes(numericId)
    ? favorites.filter((value) => value !== numericId)
    : [numericId, ...favorites];
  saveStorage();
  render();
}

function openDetail(id) {
  const site = siteById(id);
  if (!site) return;

  const numericId = Number(site.id);
  recentVisits = [numericId, ...recentVisits.filter((value) => value !== numericId)].slice(0, 20);
  saveStorage();

  const isCoupang = site.type === 'coupang';

  els.detailContent.innerHTML = `<span class="type-badge ${isCoupang ? 'coupang' : ''}">${isCoupang ? '📦 쿠팡' : '🏗️ 일반현장'}</span>
    <div class="detail-title">${escapeHtml(site.name)}</div>
    <div class="detail-address">📍 ${escapeHtml(site.address)}</div>
    ${hasTravelInfo(site) ? `<div class="info-grid">
      <div class="info-box"><span>거리</span><strong>${distanceText(site)}</strong></div>
      <div class="info-box"><span>톨비</span><strong>${money(site.toll)}</strong></div>
      <div class="info-box"><span>주유비</span><strong>${money(site.fuel)}</strong></div>
    </div>
    <div class="info-grid detail-summary-grid">
      <div class="info-box"><span>예상비용</span><strong>💰 ${totalCostText(site)}</strong></div>
      <div class="info-box"><span>구분</span><strong>${isCoupang ? '쿠팡' : '일반'}</strong></div>
    </div>` : ''}
    <div class="meta-row">
      ${site.note ? `<span class="meta-chip">📝 ${escapeHtml(site.note)}</span>` : ''}
      ${site.warranty ? `<span class="meta-chip">🛡 Warranty ${escapeHtml(site.warranty)}</span>` : ''}
    </div>
    <div class="detail-buttons">
      <button class="btn-copy" type="button" data-action="copy" data-id="${numericId}">📋 주소복사</button>
      <button class="btn-tmap" type="button" data-action="map" data-map="tmap" data-id="${numericId}">🚗 티맵</button>
      <button class="btn-kakao" type="button" data-action="map" data-map="kakao" data-id="${numericId}">카카오내비</button>
      <button class="btn-naver" type="button" data-action="map" data-map="naver" data-id="${numericId}">네이버지도</button>
    </div>`;

  els.detailModal.classList.add('show');
  els.detailModal.setAttribute('aria-hidden', 'false');
  els.closeDetailBtn.focus();
}

function closeDetail() {
  els.detailModal.classList.remove('show');
  els.detailModal.setAttribute('aria-hidden', 'true');
}

function toast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.setTimeout(() => els.toast.classList.remove('show'), 1800);
}

async function copyAddress(id) {
  const site = siteById(id);
  if (!site) return;

  try {
    await navigator.clipboard.writeText(site.address);
    toast('주소가 복사되었습니다.');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = site.address;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    toast(copied ? '주소가 복사되었습니다.' : '주소 복사에 실패했습니다.');
  }
}

function openTmap(site) {
  const destination = String(site.address || site.name || '').trim();
  if (!destination) {
    toast('목적지 주소가 없습니다.');
    return;
  }

  const query = encodeURIComponent(destination);
  toast('티맵을 여는 중입니다.');

  // Android Chrome·삼성 인터넷에서는 intent 주소로 TMAP 앱을 직접 엽니다.
  // 앱이 설치되어 있지 않으면 Google Play의 TMAP 설치 화면으로 이동합니다.
  if (isAndroid()) {
    const playStoreUrl = encodeURIComponent(
      'https://play.google.com/store/apps/details?id=com.skt.tmap.ku'
    );
    window.location.href = `intent://search?name=${query}#Intent;scheme=tmap;package=com.skt.tmap.ku;S.browser_fallback_url=${playStoreUrl};end`;
    return;
  }

  // iPhone·iPad에서는 TMAP의 앱 호출 주소를 사용합니다.
  // 앱이 없을 때는 설치 여부를 묻고 App Store로 연결합니다.
  if (isIos()) {
    let appOpened = false;
    let fallbackTimer = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        appOpened = true;
        window.clearTimeout(fallbackTimer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.location.href = `tmap://search?name=${query}`;

    fallbackTimer = window.setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (!appOpened && !document.hidden) {
        const openStore = window.confirm(
          '티맵 앱이 열리지 않았습니다. App Store에서 티맵을 확인할까요?'
        );
        if (openStore) {
          window.location.href = 'https://apps.apple.com/kr/app/id431589174';
        }
      }
    }, 1800);
    return;
  }

  toast('티맵은 스마트폰에서 열어 주세요.');
}


function openMap(id, type) {
  const site = siteById(id);
  if (!site) return;

  if (type === 'tmap') {
    openTmap(site);
    return;
  }

  const query = encodeURIComponent(site.address);
  const urls = {
    naver: `https://map.naver.com/v5/search/${query}`,
    kakao: `https://map.kakao.com/link/search/${query}`
  };

  const url = urls[type];
  if (!url) return;

  const opened = window.open(url, '_blank');
  if (opened) {
    opened.opener = null;
  } else {
    toast('팝업 차단을 해제해 주세요.');
  }
}

function handleAction(event) {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  const id = actionTarget.dataset.id;

  if (action === 'toggle-favorite') {
    event.stopPropagation();
    toggleFavorite(id);
    return;
  }

  if (action === 'copy') {
    event.stopPropagation();
    copyAddress(id);
    return;
  }

  if (action === 'map') {
    event.stopPropagation();
    openMap(id, actionTarget.dataset.map);
    return;
  }

  if (action === 'open-detail') {
    openDetail(id);
  }
}


function openSettings() {
  if (!els.settingsModal) return;
  closeDetail();
  els.settingsModal.hidden = false;
  els.settingsModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('settings-open');
  if (els.darkModeToggle) {
    els.darkModeToggle.checked = document.body.classList.contains('dark');
  }
  if (els.settingsSiteSearch) els.settingsSiteSearch.value = '';
  renderSettingsSiteList();
  window.setTimeout(() => els.addSiteBtn?.focus(), 40);
}

function closeSettings() {
  if (!els.settingsModal) return;
  els.settingsModal.hidden = true;
  els.settingsModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('settings-open');
}

function renderSettingsSiteList() {
  if (!els.settingsSiteList) return;
  const keyword = String(els.settingsSiteSearch?.value || '').trim();
  const filtered = sites.filter((site) => matchesSiteSearch(site, keyword));

  if (!filtered.length) {
    els.settingsSiteList.innerHTML = '<div class="settings-empty">해당 현장을 찾을 수 없습니다.</div>';
    return;
  }

  els.settingsSiteList.innerHTML = filtered.map((site) => `
    <div class="settings-site-item">
      <button class="settings-site-edit" type="button" data-edit-site-id="${Number(site.id)}">
        <span class="settings-site-type">${site.type === 'coupang' ? '쿠팡' : '일반'}</span>
        <strong>${escapeHtml(site.name)}</strong>
        <small>${escapeHtml(site.address)}</small>
      </button>
    </div>`).join('');
}

function openSiteEditor(id = null) {
  if (!els.siteEditorModal || !els.siteEditorForm) return;
  const site = id === null ? null : siteById(id);

  els.siteEditorForm.reset();
  els.siteIdInput.value = site ? String(site.id) : '';
  els.siteTypeInput.value = site?.type === 'coupang' ? 'coupang' : 'general';
  els.siteNameInput.value = site?.name || '';
  els.siteAddressInput.value = site?.address || '';
  els.siteNoteInput.value = site?.note || '';
  els.siteEditorTitle.textContent = site ? '현장 수정' : '현장 추가';
  els.siteSaveBtn.textContent = site ? '수정 저장하기' : '등록하기';
  els.deleteSiteBtn.hidden = !site;
  els.deleteSiteBtn.closest('.site-editor-actions')?.classList.toggle('editing', Boolean(site));

  els.siteEditorModal.hidden = false;
  els.siteEditorModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('site-editor-open');
  window.setTimeout(() => els.siteNameInput?.focus(), 40);
}

function closeSiteEditor(force = false) {
  if (!els.siteEditorModal) return;
  if (!force && (els.siteSaveBtn.disabled || els.deleteSiteBtn.disabled)) return;
  els.siteEditorModal.hidden = true;
  els.siteEditorModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('site-editor-open');
}

async function saveSiteFromForm(event) {
  event.preventDefault();

  const idValue = Number(els.siteIdInput.value || 0);
  const name = String(els.siteNameInput.value || '').trim();
  const address = String(els.siteAddressInput.value || '').trim();

  if (!name || !address) {
    toast('현장명과 주소를 입력해 주세요.');
    return;
  }

  const duplicateSites = sites.filter((site) => {
    if (Number(site.id) === idValue) return false;
    const sameName = normalizeSearchText(site.name) === normalizeSearchText(name);
    const sameAddress = buildingAddress(site.address) === buildingAddress(address);
    return sameName || sameAddress;
  });

  if (duplicateSites.length) {
    const duplicateNames = duplicateSites
      .slice(0, 3)
      .map((site) => `• ${site.name}\n  ${site.address}`)
      .join('\n');
    const moreText = duplicateSites.length > 3
      ? `\n외 ${duplicateSites.length - 3}개`
      : '';
    const continueSave = window.confirm(
      `같은 현장명 또는 같은 건물 주소가 있습니다.\n층이나 업체가 다른 별도 현장이라면 계속 저장할 수 있습니다.\n\n${duplicateNames}${moreText}\n\n그래도 저장할까요?`
    );
    if (!continueSave) {
      toast('중복 가능성이 있어 저장을 취소했습니다.');
      return;
    }
  }

  els.siteSaveBtn.disabled = true;
  els.deleteSiteBtn.disabled = true;
  els.siteSaveBtn.textContent = idValue ? '수정 중...' : '등록 중...';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveSite',
        site: {
          id: idValue || undefined,
          type: els.siteTypeInput.value,
          name,
          address,
          note: els.siteNoteInput.value.trim()
        }
      })
    });

    if (!response.ok) throw new Error('등록 서버에 연결하지 못했습니다.');
    const result = await response.json();
    if (!result.success) throw new Error(result.error || '현장 저장에 실패했습니다.');
    if (!result.site || !result.site.id) throw new Error('저장 결과를 확인하지 못했습니다.');

    const savedSite = normalizeSite(result.site || {});
    if (idValue) {
      sites = sites.map(site => Number(site.id) === idValue ? savedSite : site);
    } else {
      sites = [...sites, savedSite];
    }
    saveSiteCache({ meta, sites });
    render();
    renderSettingsSiteList();
    closeSiteEditor(true);
    await loadData({ skipCache: true });
    renderSettingsSiteList();
    toast(idValue ? '현장 정보가 모든 직원에게 수정되었습니다.' : '새 현장이 모든 직원에게 등록되었습니다.');
  } catch (error) {
    console.error(error);
    toast(error.message || '현장 저장에 실패했습니다.');
  } finally {
    els.siteSaveBtn.disabled = false;
    els.deleteSiteBtn.disabled = false;
    els.siteSaveBtn.textContent = idValue ? '수정 저장하기' : '등록하기';
  }
}

async function deleteCurrentSite() {
  const id = Number(els.siteIdInput.value || 0);
  const site = siteById(id);
  if (!site) {
    toast('삭제할 현장을 찾을 수 없습니다.');
    return;
  }

  const confirmed = window.confirm(
    `“${site.name}” 현장을 삭제할까요?\n삭제 직전 전체 목록은 Google Sheets 자동백업에 보관됩니다.`
  );
  if (!confirmed) return;

  const typedName = window.prompt(
    `실수 삭제 방지를 위해 현장명을 그대로 입력하세요.\n\n${site.name}`,
    ''
  );
  if (typedName === null) return;
  if (typedName.trim() !== site.name) {
    toast('현장명이 일치하지 않아 삭제하지 않았습니다.');
    return;
  }

  els.siteSaveBtn.disabled = true;
  els.deleteSiteBtn.disabled = true;
  els.deleteSiteBtn.textContent = '삭제 중...';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteSite',
        site: {
          id,
          confirmName: typedName.trim()
        }
      })
    });

    if (!response.ok) throw new Error('삭제 서버에 연결하지 못했습니다.');
    const result = await response.json();
    if (!result.success) throw new Error(result.error || '현장 삭제에 실패했습니다.');

    sites = sites.filter(item => Number(item.id) !== id);
    favorites = favorites.filter(value => Number(value) !== id);
    recentVisits = recentVisits.filter(value => Number(value) !== id);
    saveStorage();
    saveSiteCache({ meta, sites });
    render();
    renderSettingsSiteList();
    closeSiteEditor(true);
    await loadData({ skipCache: true });
    toast('현장이 삭제됐고 직전 목록은 자동백업에 보관됐습니다.');
  } catch (error) {
    console.error(error);
    toast(error.message || '현장 삭제에 실패했습니다.');
  } finally {
    els.siteSaveBtn.disabled = false;
    els.deleteSiteBtn.disabled = false;
    els.deleteSiteBtn.textContent = '현장 삭제';
  }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  const userAgent = window.navigator.userAgent || '';
  const iPadDesktopMode = window.navigator.platform === 'MacIntel'
    && window.navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(userAgent) || iPadDesktopMode;
}

function isAndroid() {
  return /android/i.test(window.navigator.userAgent);
}

function isKakaoInAppBrowser() {
  if (window.__TEA_KAKAO_CONTEXT__ === true) return true;

  const userAgent = window.navigator.userAgent || '';
  const params = new URLSearchParams(window.location.search);
  return /KAKAOTALK|KakaoTalk/i.test(userAgent)
    || params.get('from') === 'kakao'
    || params.get('kakao') === '1';
}

function showKakaoGuide() {
  if (typeof window.__TEA_SHOW_KAKAO_GUIDE__ === 'function') {
    window.__TEA_SHOW_KAKAO_GUIDE__();
    return;
  }

  if (!els.kakaoGuide || isStandalone()) return;

  const ios = isIos();
  els.kakaoGuide.hidden = false;
  els.kakaoGuide.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kakao-guide-open');

  if (els.kakaoAndroidSteps) els.kakaoAndroidSteps.hidden = ios;
  if (els.kakaoIosSteps) els.kakaoIosSteps.hidden = !ios;
  if (els.openChromeBtn) els.openChromeBtn.hidden = ios || !isAndroid();
  if (els.kakaoAndroidFallback) els.kakaoAndroidFallback.hidden = ios || !isAndroid();

  if (els.kakaoGuideMessage) {
    els.kakaoGuideMessage.textContent = ios
      ? 'Safari에서 열면 홈 화면에 앱으로 추가할 수 있어요.'
      : '아래 버튼을 누르면 Chrome에서 설치할 수 있어요.';
  }

  window.setTimeout(() => {
    const focusTarget = ios ? els.copyAppLinkBtn : els.openChromeBtn;
    focusTarget?.focus();
  }, 50);
}

function hideKakaoGuide() {
  if (typeof window.__TEA_HIDE_KAKAO_GUIDE__ === 'function') {
    window.__TEA_HIDE_KAKAO_GUIDE__();
    return;
  }

  if (!els.kakaoGuide) return;
  els.kakaoGuide.hidden = true;
  els.kakaoGuide.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('kakao-guide-open');
}

function openInChrome() {
  const currentUrl = typeof window.__TEA_CLEAN_APP_URL__ === 'function'
    ? window.__TEA_CLEAN_APP_URL__()
    : window.location.href;

  if (!isAndroid()) {
    copyCurrentAppLink();
    return;
  }

  const protocol = window.location.protocol.replace(':', '') || 'https';
  const path = `${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  const fallbackUrl = encodeURIComponent(currentUrl);
  window.location.href = `intent://${path}#Intent;scheme=${protocol};package=com.android.chrome;S.browser_fallback_url=${fallbackUrl};end`;
}

async function copyCurrentAppLink() {
  const currentUrl = typeof window.__TEA_CLEAN_APP_URL__ === 'function'
    ? window.__TEA_CLEAN_APP_URL__()
    : window.location.href;

  try {
    await navigator.clipboard.writeText(currentUrl);
    toast('앱 주소를 복사했습니다.');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = currentUrl;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    toast(copied ? '앱 주소를 복사했습니다.' : '주소를 길게 눌러 복사해 주세요.');
  }
}

function updateInstallButton() {
  if (isStandalone()) {
    els.installBtn.hidden = true;
    return;
  }

  if (isKakaoInAppBrowser()) {
    els.installBtn.textContent = '설치안내';
    els.installBtn.hidden = false;
    return;
  }

  if (deferredInstallPrompt) {
    els.installBtn.textContent = '설치';
    els.installBtn.hidden = false;
    return;
  }

  if (isIos()) {
    els.installBtn.textContent = '설치안내';
    els.installBtn.hidden = false;
  }
}

async function installApp() {
  if (isKakaoInAppBrowser()) {
    showKakaoGuide();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButton();
    return;
  }

  if (isIos()) {
    window.alert('Safari의 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하세요.');
    return;
  }

  toast('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.');
}

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
  if (els.darkModeToggle) els.darkModeToggle.checked = enabled;
  localStorage.setItem(STORAGE_KEYS.darkMode, enabled ? '1' : '0');
}

function showUpdateNoticeOnce() {
  if (!els.updateNoticeModal) return;
  try {
    if (localStorage.getItem(STORAGE_KEYS.seenUpdateVersion) === APP_VERSION) return;
  } catch (error) {
    console.warn('업데이트 확인 기록을 읽지 못했습니다.', error);
  }

  els.updateNoticeModal.hidden = false;
  els.updateNoticeModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('update-notice-open');
  window.setTimeout(() => els.closeUpdateNoticeBtn?.focus(), 50);
}

function closeUpdateNotice() {
  if (!els.updateNoticeModal || els.updateNoticeModal.hidden) return;
  els.updateNoticeModal.hidden = true;
  els.updateNoticeModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('update-notice-open');
  try {
    localStorage.setItem(STORAGE_KEYS.seenUpdateVersion, APP_VERSION);
  } catch (error) {
    console.warn('업데이트 확인 기록을 저장하지 못했습니다.', error);
  }
}

function initEvents() {
  els.searchInput.addEventListener('input', render);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const keyword = els.searchInput.value.trim();
    if (!keyword) return;
    recentSearches = [keyword, ...recentSearches.filter((value) => value !== keyword)].slice(0, 10);
    saveStorage();
  });

  els.clearBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchInput.focus();
    render();
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
      render();
    });
  });

  els.siteList.addEventListener('click', handleAction);
  els.favoriteTopBox.addEventListener('click', handleAction);
  els.detailContent.addEventListener('click', handleAction);

  els.siteList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.site-card');
    if (!card || event.target.closest('button')) return;
    event.preventDefault();
    openDetail(card.dataset.id);
  });

  els.closeDetailBtn.addEventListener('click', closeDetail);
  els.detailModal.addEventListener('click', (event) => {
    if (event.target === els.detailModal) closeDetail();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (els.updateNoticeModal && !els.updateNoticeModal.hidden) {
      closeUpdateNotice();
      return;
    }
    if (els.siteEditorModal && !els.siteEditorModal.hidden) {
      closeSiteEditor();
      return;
    }
    if (els.settingsModal && !els.settingsModal.hidden) {
      closeSettings();
      return;
    }
    if (els.detailModal.classList.contains('show')) closeDetail();
  });

  els.settingsBtn?.addEventListener('click', openSettings);
  els.closeSettingsBtn?.addEventListener('click', closeSettings);
  els.settingsModal?.addEventListener('click', (event) => {
    if (event.target === els.settingsModal) closeSettings();
  });
  els.darkModeToggle?.addEventListener('change', () => applyDarkMode(els.darkModeToggle.checked));
  els.addSiteBtn?.addEventListener('click', () => openSiteEditor());
  els.settingsSiteSearch?.addEventListener('input', renderSettingsSiteList);
  els.settingsSiteList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-site-id]');
    if (!button) return;
    openSiteEditor(Number(button.dataset.editSiteId));
  });
  els.closeSiteEditorBtn?.addEventListener('click', () => closeSiteEditor());
  els.siteEditorModal?.addEventListener('click', (event) => {
    if (event.target === els.siteEditorModal) closeSiteEditor();
  });
  els.siteEditorForm?.addEventListener('submit', saveSiteFromForm);
  els.deleteSiteBtn?.addEventListener('click', deleteCurrentSite);
  els.closeUpdateNoticeBtn?.addEventListener('click', closeUpdateNotice);
  els.updateNoticeModal?.addEventListener('click', (event) => {
    if (event.target === els.updateNoticeModal) closeUpdateNotice();
  });

  els.refreshBtn.addEventListener('click', () => loadData({
    skipCache: true,
    notifyOnError: true
  }));
  els.installBtn.addEventListener('click', installApp);
  if (!window.__TEA_KAKAO_INLINE_BOUND__) {
    els.openChromeBtn?.addEventListener('click', openInChrome);
    els.copyAppLinkBtn?.addEventListener('click', copyCurrentAppLink);
    els.continueInKakaoBtn?.addEventListener('click', hideKakaoGuide);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
    toast('앱이 설치되었습니다.');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js?v=3.7.0', {
        scope: './',
        updateViaCache: 'none'
      });
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      registration.update().catch(() => {});
    } catch (error) {
      console.warn('서비스 워커 등록 실패', error);
    }
  });
}

async function checkAppUpdate() {
  const button = els.checkUpdateBtn;
  button.disabled = true;
  button.textContent = '새 버전 확인 중…';
  try {
    const response = await fetch(`./index.html?updateCheck=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('업데이트 연결 실패');
    const html = await response.text();
    const version = html.match(/data-app-version="([^"]+)"/)?.[1];
    if (!version) throw new Error('버전 확인 실패');
    if (version === APP_VERSION) {
      await loadData({ skipCache: true });
      toast(`${APP_VERSION} 최신 버전입니다.`);
    } else if (window.confirm(`${version} 업데이트가 있습니다. 새로고침할까요?`)) {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.replace(`./?source=installed-app&update=${encodeURIComponent(version)}&t=${Date.now()}`);
    }
  } catch (error) {
    toast('새 버전을 확인하지 못했습니다. 연결 후 다시 시도해 주세요.');
  } finally {
    button.disabled = false;
    button.textContent = '업데이트 확인';
  }
}

function initialize() {
  const storedDarkMode = localStorage.getItem(STORAGE_KEYS.darkMode) === '1';
  applyDarkMode(storedDarkMode);
  initEvents();
  els.checkUpdateBtn?.addEventListener('click', checkAppUpdate);
  registerServiceWorker();
  updateInstallButton();
  if (isKakaoInAppBrowser()) showKakaoGuide();
  loadData();
  window.setTimeout(showUpdateNoticeOnce, 650);
}

initialize();
