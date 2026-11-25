/* Shop filters. Every card is already in the HTML (readable without
 * JavaScript and by search engines); this only hides, sorts and recolours.
 * Filters live in the URL, so a filtered view can be shared or bookmarked. */
(() => {
  const NSF = window.NSF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const grid = $('#grid');
  const cards = $$('.card', grid);
  const empty = $('.grid__empty', grid);
  const TYPE_NAMES = Object.fromEntries($$('[data-f-type]').map((b) => [b.dataset.fType, b.textContent]));

  const f = { type: '', gender: '', colours: new Set(), sizes: new Set(), sale: false, drop: false, under: 0, q: '', sort: 'featured' };

  function readUrl() {
    const p = new URLSearchParams(location.search);
    f.type = p.get('type') || '';
    f.gender = p.get('gender') || '';
    f.colours = new Set(p.getAll('colour'));
    f.sizes = new Set(p.getAll('size'));
    f.sale = p.get('sale') === '1';
    f.drop = p.get('drop') === '1';
    f.under = +(p.get('under') || 0);
    f.q = p.get('q') || '';
    f.sort = p.get('sort') || 'featured';
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (f.type) p.set('type', f.type);
    if (f.gender) p.set('gender', f.gender);
    f.colours.forEach((c) => p.append('colour', c));
    f.sizes.forEach((z) => p.append('size', z));
    if (f.sale) p.set('sale', '1');
    if (f.drop) p.set('drop', '1');
    if (f.under) p.set('under', String(f.under));
    if (f.q) p.set('q', f.q);
    if (f.sort !== 'featured') p.set('sort', f.sort);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // A colour that passes both the colour and the size filter (that size in stock in that colour).
  const match = (s) => (!f.colours.size && !f.sizes.size) ? s.colours[0]
    : s.colours.find((c) => (!f.colours.size || f.colours.has(c.colour)) && (!f.sizes.size || c.variants.some((v) => v.stock && f.sizes.has(v.size)))) || null;

  function apply() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const el of cards) {
      const s = NSF.byId[el.dataset.style];
      const cols = el.dataset.colours.split('|');
      const sizes = el.dataset.sizes.split('|');
      const hay = `${el.dataset.name} ${s.type.toLowerCase()} ${cols.join(' ').toLowerCase()}`;
      const ok = (!f.type || el.dataset.type === f.type)
        && (!f.gender || el.dataset.gender.split(' ').includes(f.gender))
        && (match(s) !== null)
        && (!f.sale || el.dataset.sale === '1')
        && (!f.drop || el.dataset.drop === '1')
        && (!f.under || +el.dataset.price < f.under)
        && words.every((w) => hay.includes(w));
      const was = el.hidden; el.hidden = !ok;
      if (ok) {
        shown++;
        if (was) { el.classList.remove('is-entering'); void el.offsetWidth; el.classList.add('is-entering'); }
        // Show the first colour that matches the filter, so the photo agrees with it.
        if (f.colours.size || f.sizes.size) {
          const hit = match(s);
          const cur = el.querySelector('.card__colour').textContent;
          if (hit && hit.colour !== cur) el.querySelector(`[data-colour="${CSS.escape(hit.colour)}"]`)?.click();
        }
      }
    }
    // Featured: new and best sellers together (tools/rank.mjs). Best selling: sales only.
    const key = { featured: (el) => -el.dataset.score, best: (el) => +el.dataset.rank, new: (el) => -Date.parse(el.dataset.new), low: (el) => +el.dataset.price, high: (el) => -el.dataset.price }[f.sort];
    [...cards].sort((a, b) => key(a) - key(b)).forEach((el) => grid.insertBefore(el, empty));
    empty.hidden = shown > 0;
    $('#shop-count').textContent = `${shown} ${shown === 1 ? 'style' : 'styles'}`;
    $('#show-n').textContent = `Show ${shown} ${shown === 1 ? 'style' : 'styles'}`;
    $('#shop-title').textContent = f.type ? TYPE_NAMES[f.type] : f.gender === 'men' ? "Men's" : f.gender === 'women' ? "Women's" : f.sale ? 'Sale' : f.drop ? 'Latest drop' : 'Shop all';
    const n = f.colours.size + f.sizes.size + (f.sale ? 1 : 0) + (f.drop ? 1 : 0) + (f.under ? 1 : 0) + (f.gender ? 1 : 0) + (f.q ? 1 : 0);
    $('[data-fcount]').textContent = n ? String(n) : '';
    // Reflect state on every control.
    $$('[data-f-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fType === f.type)));
    $$('[data-f-gender]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fGender === f.gender)));
    $$('[data-f-colour]').forEach((b) => b.setAttribute('aria-pressed', String(f.colours.has(b.dataset.fColour))));
    // Colour folds away (like Leelo's filters); it opens by itself when a colour is chosen.
    const cg = $('[data-fgroup-colour]');
    if (cg) { if (f.colours.size) cg.open = true; $('[data-f-colour-count]', cg).textContent = f.colours.size ? `${f.colours.size} chosen` : ''; }
    $$('[data-f-size]').forEach((b) => b.setAttribute('aria-pressed', String(f.sizes.has(b.dataset.fSize))));
    $('[data-f-sale]').setAttribute('aria-pressed', String(f.sale));
    $('[data-f-under]').setAttribute('aria-pressed', String(!!f.under));
    $('#sort').value = f.sort;
    if ($('#q').value !== f.q) $('#q').value = f.q;
    writeUrl();
  }

  const toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if ('fType' in b.dataset) { f.type = b.dataset.fType; return apply(); }
    if ('fGender' in b.dataset) { f.gender = b.dataset.fGender; return apply(); }
    if ('fColour' in b.dataset) { toggle(f.colours, b.dataset.fColour); return apply(); }
    if ('fSize' in b.dataset) { toggle(f.sizes, b.dataset.fSize); return apply(); }
    if ('fSale' in b.dataset) { f.sale = !f.sale; return apply(); }
    if ('fUnder' in b.dataset) { f.under = f.under ? 0 : +b.dataset.fUnder; return apply(); }
    if ('clear' in b.dataset) { Object.assign(f, { type: '', gender: '', colours: new Set(), sizes: new Set(), sale: false, drop: false, under: 0, q: '' }); return apply(); }
    if ('openFilters' in b.dataset) { $('#filters').classList.add('is-open'); document.documentElement.style.overflow = 'hidden'; $('#filters button, #filters input')?.focus(); return; }
    if ('closeFilters' in b.dataset) { closeFilters(); }
  });
  function closeFilters() { $('#filters').classList.remove('is-open'); document.documentElement.style.overflow = ''; }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#filters.is-open')) closeFilters(); });
  $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; apply(); });
  let qt; $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value.trim(); apply(); }, 120); });

  readUrl(); apply();
  // Funnel step 1 on the shop: what was listed.
  const S = window.NSFSite;
  S.track('view_item_list', { item_list_name: 'shop', items: cards.filter((el) => !el.hidden).slice(0, 24).map((el, i) => { const st = NSF.byId[el.dataset.style]; const v = st.colours[0].variants[0]; return { ...S.item(v.id), index: i }; }) });
  if (location.hash === '#search') setTimeout(() => { if (innerWidth <= 860) $('[data-open-filters]').click(); $('#q').focus(); }, 50);
})();
