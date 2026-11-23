/* Product page: colour from ?colour=, pick a size, then one of three ways on:
 * Add to bag, Buy now (straight to Shopify checkout with just this), or
 * Add both (this plus the matching piece in the same colour). */
(() => {
  const { add, img, priceHtml, partners, checkout, track, item, money } = window.NSFSite;
  const NSF = window.NSF;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $('.pdp__main');
  const s = NSF.byId[main.dataset.style];
  let colour = s.colours[0];
  let picked = null;
  let mate = null;      // { s, c } the other half of the set, if there is one
  let matePick = null;  // its chosen variant id

  function setColour(name, push) {
    const c = s.colours.find((x) => x.colour === name) || s.colours[0];
    colour = c; picked = null;
    $('#pdp-colour').textContent = c.colour;
    $('#pdp-price').innerHTML = priceHtml(c);
    $$('[data-pdp-colour]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pdpColour === c.colour)));
    $('#gallery').innerHTML = c.images.map((im, i) => `<img src="${img(im.src, 1000)}" srcset="${[360, 540, 720, 960, 1280].map((w) => `${img(im.src, w)} ${w}w`).join(', ')}" sizes="(max-width: 860px) 88vw, 32vw" alt="${i === 0 ? `${s.name} in ${c.colour}` : ''}" width="900" height="1200" ${i ? 'loading="lazy"' : ''} decoding="async">`).join('');
    $('#pdp-sizes').innerHTML = c.variants.map((v) => `<button type="button" class="size" data-pick="${v.id}" ${v.stock ? '' : 'disabled'} aria-pressed="false" aria-label="${v.size}${v.stock ? '' : ', sold out'}">${v.size}</button>`).join('');
    const live = c.variants.filter((v) => v.stock);
    if (c.variants.length === 1 && live.length) picked = live[0].id;
    paintSet();
    sync();
    if (push) history.replaceState(null, '', `?colour=${encodeURIComponent(c.colour)}`);
    $$('.pdp__pair .card').forEach((card) => {
      const other = NSF.byId[card.dataset.style];
      if (other.colours.some((x) => x.colour === c.colour)) card.querySelector(`[data-colour="${CSS.escape(c.colour)}"]`)?.click();
    });
    const v = c.variants.find((x) => x.stock) || c.variants[0];
    track('view_item', { value: v.price, items: [item(v.id)] });
  }

  // Complete the set: the best-selling matching piece in the same colour.
  function paintSet() {
    const box = $('#pdp-set');
    mate = partners(s, colour.colour, 1)[0] || null; matePick = null;
    if (!mate) { box.hidden = true; box.innerHTML = ''; return; }
    const { s: m, c } = mate;
    box.hidden = false;
    box.innerHTML = `<p class="label">Complete the set</p>
      <div class="offer">
        <a href="/nsf-preview-314af409/products/${m.id}/?colour=${encodeURIComponent(c.colour)}"><img src="${img(c.images[0].src, 200)}" alt="" width="64" height="85" loading="lazy"></a>
        <div class="offer__main"><a class="offer__name" href="/nsf-preview-314af409/products/${m.id}/?colour=${encodeURIComponent(c.colour)}">${m.name}</a>
          <p class="bag-item__meta">${c.colour} · ${priceHtml(c)}</p>
          <div class="sizes offer__sizes" role="radiogroup" aria-label="${m.name} size">${c.variants.map((v) => `<button type="button" class="size" data-mate="${v.id}" ${v.stock ? '' : 'disabled'} aria-pressed="false" aria-label="${v.size}${v.stock ? '' : ', sold out'}">${v.size}</button>`).join('')}</div>
        </div></div>
      <button class="btn btn--line btn--wide" type="button" id="pdp-both" disabled>Add both</button>`;
  }

  function pick(id) {
    picked = id;
    $$('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.pick === id)));
    // Suggest the same size for the other half, if it's in stock.
    if (mate && !matePick) {
      const size = colour.variants.find((v) => v.id === id).size;
      const same = mate.c.variants.find((v) => v.size === size && v.stock);
      if (same) pickMate(same.id);
    }
    sync();
  }
  function pickMate(id) {
    matePick = id;
    $$('[data-mate]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.mate === id)));
    sync();
  }
  function sync() {
    const add = $('#pdp-add'); const buy = $('#pdp-buy');
    const anyStock = colour.variants.some((v) => v.stock);
    add.disabled = buy.disabled = !picked || !anyStock;
    add.textContent = !anyStock ? 'Sold out' : picked ? 'Add to bag' : 'Choose a size';
    const both = $('#pdp-both');
    if (both) {
      both.disabled = !(picked && matePick);
      const { index } = window.NSFSite;
      const total = picked && matePick ? index.get(picked).v.price + index.get(matePick).v.price : 0;
      both.textContent = picked && matePick ? `Add both, ${money(total)}` : !picked ? 'Add both: choose your size above' : 'Add both: choose a size';
    }
  }

  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pdp-colour]'); if (c) return setColour(c.dataset.pdpColour, true);
    const z = e.target.closest('[data-pick]'); if (z && !z.disabled) return pick(+z.dataset.pick);
    const m = e.target.closest('[data-mate]'); if (m && !m.disabled) return pickMate(+m.dataset.mate);
    if (e.target.closest('#pdp-add') && picked) { add(picked, 1, { source: 'product-page' }); return; }
    if (e.target.closest('#pdp-buy') && picked) { checkout([{ id: picked, qty: 1 }], 'buy-now'); return; }
    if (e.target.closest('#pdp-both') && picked && matePick) {
      add(picked, 1, { source: 'product-set', quiet: true });
      add(matePick, 1, { source: 'product-set' });
      return;
    }
    if (e.target.closest('[data-bar-add]')) {
      if (picked) add(picked, 1, { source: 'product-sticky-bar' });
      else { $('#pdp-sizes').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#pdp-sizes .size:not([disabled])')?.focus({ preventScroll: true }); }
    }
  });

  // Phones: the sticky bar appears once the main Add button has scrolled out of view.
  const bar = $('#pdp-bar');
  new IntersectionObserver(([e]) => { const on = !e.isIntersecting && e.boundingClientRect.top < 0; bar.classList.toggle('is-on', on); bar.setAttribute('aria-hidden', String(!on)); })
    .observe($('#pdp-add'));

  setColour(new URLSearchParams(location.search).get('colour') || s.colours[0].colour, false);
})();
