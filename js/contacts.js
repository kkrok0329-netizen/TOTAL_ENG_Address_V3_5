'use strict';
(() => {
  const q = id => document.getElementById(id);
  const categories = ['우리회사', '현장', '협력사'];
  const cacheKey = 'tea_shared_contacts_v1';
  let contacts = [], category = '전체', busy = false, loaded = false, revision = '';
  try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (Array.isArray(c?.contacts)) contacts = c.contacts; } catch (_) {}
  const editor = document.createElement('dialog');
  editor.className = 'contact-editor';
  editor.setAttribute('aria-labelledby', 'contactEditorTitle');
  editor.innerHTML = `<form id="contactForm"><div class="contacts-toolbar"><h2 id="contactEditorTitle">연락처 추가</h2><button type="button" id="closeContactBtn" aria-label="연락처 편집 닫기">✕</button></div>
    <input name="id" type="hidden"><input name="updatedAt" type="hidden">
    <label>분류<select name="category">${categories.map(c => `<option>${c}</option>`).join('')}</select></label>
    <label>이름 *<input name="name" required maxlength="80" autocomplete="name"></label>
    <label>전화번호 *<input name="phone" type="tel" required maxlength="30" autocomplete="tel" placeholder="010-1234-5678"></label>
    <label>업체명<input name="company" maxlength="120" placeholder="TOTAL ENG / 협력업체명"></label>
    <label>직책<input name="position" maxlength="80" placeholder="과장 / 시설팀장 / 대표"></label>
    <label>현장명<input name="siteName" maxlength="120" list="contactSiteOptions" placeholder="휠라 물류센터"></label><datalist id="contactSiteOptions"></datalist>
    <label>메모<textarea name="note" maxlength="500" rows="3" placeholder="담당 업무, 연락 참고사항"></textarea></label>
    <p>저장하면 모든 직원에게 공유됩니다.</p><div class="contact-actions"><button id="deleteContactBtn" type="button">삭제</button><button type="submit" id="saveContactBtn">공용 주소록에 저장</button></div></form>`;
  document.body.appendChild(editor);
  const form = q('contactForm');
  const field = name => form.elements.namedItem(name);
  const phoneDigits = value => String(value || '').replace(/\D/g, '');
  function matches(contact, query) {
    const target = normalizeSearchText([contact.name, contact.company, contact.position, contact.siteName, contact.phone, contact.note, contact.category].join(' '));
    return String(query).trim().split(/\s+/).map(normalizeSearchText).filter(Boolean).every(word => target.includes(word));
  }
  function renderContacts() {
    const filtered = contacts.filter(c => (category === '전체' || c.category === category) && matches(c, q('contactSearch').value))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
    q('contactCount').textContent = `${category} ${filtered.length}명`;
    q('contactList').innerHTML = filtered.map(c => {
      const digits = (String(c.phone || '').trim().startsWith('+') ? '+' : '') + phoneDigits(c.phone);
      return `<article class="contact-card"><div class="contacts-toolbar"><span class="contact-badge">${escapeHtml(c.category)}</span><button type="button" data-edit="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.name)} 수정">✎ 수정</button></div>
        <h3>${escapeHtml(c.name)} <small>${escapeHtml(c.position)}</small></h3>
        ${c.company ? `<p>업체 · ${escapeHtml(c.company)}</p>` : ''}${c.siteName ? `<p>현장 · ${escapeHtml(c.siteName)}</p>` : ''}
        <p>${escapeHtml(c.phone)}</p>${c.note ? `<p class="contact-note">${escapeHtml(c.note)}</p>` : ''}
        <div class="contact-actions">${digits ? `<a href="tel:${digits}" aria-label="${escapeHtml(c.name)}에게 전화">📞 전화</a><a href="sms:${digits}" aria-label="${escapeHtml(c.name)}에게 문자">💬 문자</a>` : '<span>전화번호를 확인해 주세요.</span>'}</div></article>`;
    }).join('') || '<p class="empty">연락처가 없습니다.<br>검색어나 분류를 바꾸거나 연락처를 추가해 주세요.</p>';
  }
  async function request(action, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = body ? await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action, ...body}), signal:controller.signal})
        : await fetch(`${API_URL}?action=${action}&_=${Date.now()}`, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error('서버 연결 실패');
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '주소록 서버 업데이트가 필요합니다.');
      return data;
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    q('contactStatus').textContent = '공용 주소록 확인 중…';
    try {
      const data = await request('contacts');
      if (!Array.isArray(data.contacts)) throw new Error('주소록 서버 업데이트가 필요합니다.');
      contacts = data.contacts; revision = data.revision || ''; loaded = true;
      try { localStorage.setItem(cacheKey, JSON.stringify({contacts})); } catch (_) {}
      q('contactStatus').textContent = '최신 공용 주소록 · 직원 전체 공유';
      renderContacts();
    } catch (error) {
      loaded = false;
      q('contactStatus').textContent = contacts.length ? '저장된 주소록 표시 중 · 연결 후 다시 시도' : '주소록 연결 전입니다. Apps Script 업데이트 후 새로고침해 주세요.';
    }
  }
  function openEditor(contact) {
    if (!loaded) { toast('주소록을 새로고침해 서버에 연결한 후 편집해 주세요.'); return; }
    form.reset();
    for (const key of ['id','updatedAt','name','phone','company','position','siteName','note']) field(key).value = contact?.[key] || '';
    field('category').value = contact?.category || (category === '전체' ? '우리회사' : category);
    q('contactEditorTitle').textContent = contact ? '연락처 수정' : '연락처 추가';
    q('deleteContactBtn').hidden = !contact;
    q('contactSiteOptions').innerHTML = sites.map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('');
    editor.showModal();
  }
  function setBusy(value) {
    busy = value;
    for (const el of form.elements) el.disabled = value;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const contact = Object.fromEntries(new FormData(form));
    for (const key in contact) contact[key] = String(contact[key]).trim();
    const digits = phoneDigits(contact.phone);
    if (digits.length < 7 || digits.length > 15) { toast('전화번호를 확인해 주세요.'); return; }
    if (contacts.some(c => String(c.id) !== contact.id && phoneDigits(c.phone) === digits) && !confirm('같은 전화번호가 이미 있습니다. 그래도 저장할까요?')) return;
    setBusy(true);
    try { await request('saveContact', {contact, revision}); editor.close(); toast('연락처를 공용 주소록에 저장했습니다.'); await refresh(); }
    catch(error) { alert(`${error.message}\n입력 내용은 유지됩니다. 연결 오류라면 주소록을 확인한 후 다시 저장해 주세요.`); }
    finally { setBusy(false); }
  });
  q('deleteContactBtn').addEventListener('click', async () => {
    if (busy || !confirm(`“${field('name').value}” 연락처를 모든 직원의 주소록에서 삭제할까요? 삭제 전 정보는 백업됩니다.`)) return;
    setBusy(true);
    try { await request('deleteContact', {contact:{id:field('id').value, updatedAt:field('updatedAt').value}, revision}); editor.close(); toast('연락처가 삭제됐습니다.'); await refresh(); }
    catch(error) { alert(error.message); } finally { setBusy(false); }
  });
  editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  q('closeContactBtn').onclick = () => { if (!busy) editor.close(); };
  q('addContactBtn').onclick = () => openEditor();
  q('refreshContactsBtn').onclick = refresh;
  q('contactSearch').oninput = renderContacts;
  q('contactList').onclick = event => { const button = event.target.closest('[data-edit]'); if (button) openEditor(contacts.find(c => String(c.id) === button.dataset.edit)); };
  q('contactFilters').onclick = event => {
    const button = event.target.closest('[data-category]'); if (!button) return;
    category = button.dataset.category;
    for (const b of q('contactFilters').querySelectorAll('button')) { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }
    renderContacts();
  };
  function switchView(showContacts) {
    q('sitesView').hidden = showContacts; q('contactsView').hidden = !showContacts;
    for (const [id, selected] of [['showSitesBtn',!showContacts],['showContactsBtn',showContacts]]) { q(id).classList.toggle('selected',selected); q(id).setAttribute('aria-pressed',String(selected)); }
    if (showContacts) { renderContacts(); refresh(); }
  }
  q('showSitesBtn').onclick = () => switchView(false);
  q('showContactsBtn').onclick = () => switchView(true);
})();
