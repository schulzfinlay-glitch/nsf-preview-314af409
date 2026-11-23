/* Home: product rows that slide with arrows, and the banner's Black Friday face.
 * Everything here is plain enhancement: without JS the rows still scroll by
 * touch or trackpad and the banner shows its everyday message. */
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = window.NSFSite;

  /* ---------- NSFA intro ----------
   * Letters light (CSS), then the brown screen closes in on the banner's
   * brown copy panel and hands over to it: the intro becomes the banner.
   * The deck (Black Friday) waits for this promise. */
  const root = document.documentElement;
  const intro = document.getElementById('intro');
  const copy = document.querySelector('.hero__copy');
  function riseIn() {
    if (!root.classList.contains('intro-playing')) return;
    const parts = copy ? [...copy.children] : [];
    parts.forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: 60 + i * 70, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' }));
    root.classList.remove('intro-playing');
  }
  window.NSFIntro = new Promise((resolve) => {
    if (!intro || root.classList.contains('no-intro')) { intro?.remove(); root.classList.remove('intro-playing'); return resolve(); }
    try { sessionStorage.setItem('nsf-intro', '1'); } catch { /* */ }
    root.style.overflow = 'hidden';
    let gone = false;
    const leave = () => {
      if (gone) return; gone = true;
      intro.classList.add('is-leaving');
      const mark = intro.querySelector('.intro__mark');
      const r = copy?.getBoundingClientRect();
      const vw = innerWidth, vh = innerHeight;
      // Close in on the brown panel where it sits on screen (left half on desktop,
      // under the photo on phones). If it's off screen, lift away instead.
      const to = r && r.top < vh - 80
        ? `inset(${Math.max(0, r.top)}px ${Math.max(0, vw - r.right)}px ${Math.max(0, vh - Math.min(vh, r.bottom))}px ${Math.max(0, r.left)}px)`
        : 'inset(0 0 100% 0)';
      mark.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }],
        { duration: 340, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      const close = intro.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: to }],
        { duration: 820, delay: 180, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' });
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        if (root.classList.contains('intro-playing')) riseIn();
        intro.remove(); root.style.overflow = ''; resolve();
      };
      setTimeout(riseIn, 760);
      close.finished.then(finish, finish);
      // Never strand anyone on the brown screen: if the browser pauses the
      // animation (a background tab, a battery saver), clear it on time anyway.
      setTimeout(finish, 1200);
    };
    // Last letter lands at ~0.72s; hold a beat, then hand over.
    const timer = setTimeout(leave, 1050);
    setTimeout(leave, 2500); // belt and braces if the first timer is delayed
    const skip = () => { clearTimeout(timer); leave(); };
    intro.addEventListener('pointerdown', skip, { once: true });
    addEventListener('keydown', function k() { removeEventListener('keydown', k); skip(); });
  });

  // Rows: arrows move one screen of cards; they grey out at either end.
  $$('.row').forEach((row) => {
    const track = row.querySelector('[data-row-track]');
    const prev = row.querySelector('[data-row-prev]');
    const next = row.querySelector('[data-row-next]');
    if (!track || !prev || !next) return;
    const step = () => track.clientWidth * 0.9;
    const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: smooth }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: smooth }));
    const ends = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
      row.classList.toggle('is-static', max <= 0);
    };
    track.addEventListener('scroll', ends, { passive: true });
    addEventListener('resize', ends);
    ends();

    // Analytics: which cards the row showed.
    const cards = $$('.card', track);
    if (S && cards.length) {
      S.track('view_item_list', { item_list_name: `home-${row.id}`, items: cards.map((c, i) => {
        const first = c.querySelector('[data-add]');
        return first ? { ...S.item(Number(first.dataset.add)), index: i } : null;
      }).filter(Boolean) });
    }
  });

  // Black Friday and the banner. Cards are only dealt on arrival (the deck opens
  // by itself); the banner never asks anyone to pick a card. Once a card is
  // turned over, the banner shows that card: waiting for an email, or on the bag.
  const everyday = (() => {
    const q = (s) => document.querySelector(s);
    return { kicker: q('[data-hero-kicker]')?.textContent, title: q('[data-hero-title]')?.innerHTML, sub: q('[data-hero-sub]')?.textContent, ctas: q('[data-hero-ctas]')?.innerHTML };
  })();
  function paintBanner() {
    const kicker = document.querySelector('[data-hero-kicker]');
    const title = document.querySelector('[data-hero-title]');
    const sub = document.querySelector('[data-hero-sub]');
    const ctas = document.querySelector('[data-hero-ctas]');
    const hero = document.querySelector('.hero');
    if (!title || !ctas) return;
    const deal = S && S.promoLive && S.promoLive() ? S.store.get('nsf-deck', null) : null;
    if (!deal || deal.card == null) {
      hero?.classList.remove('hero--sale');
      kicker.textContent = everyday.kicker; title.innerHTML = everyday.title; sub.textContent = everyday.sub; ctas.innerHTML = everyday.ctas;
      return;
    }
    hero?.classList.add('hero--sale');
    kicker.textContent = 'Black Friday · ends 8pm Friday, Brisbane time';
    if (deal.done && deal.code) {
      title.innerHTML = `Your ${deal.label}<br>is on your bag.`;
      sub.textContent = 'It comes off at checkout, on everything in your bag.';
      ctas.innerHTML = '<a class="btn btn--light" href="/nsf-preview-314af409/shop/">Shop now</a><button type="button" class="btn btn--ghost" data-hero-bag>View bag</button>';
      ctas.querySelector('[data-hero-bag]').addEventListener('click', () => S.openBag());
    } else {
      title.innerHTML = `Your ${deal.label}<br>is waiting.`;
      sub.textContent = 'Add your email to claim it. It comes off at checkout, on everything in your bag.';
      ctas.innerHTML = '<button type="button" class="btn btn--light" data-hero-claim>Claim it</button><a class="btn btn--ghost" href="/nsf-preview-314af409/shop/">Shop all</a>';
      ctas.querySelector('[data-hero-claim]').addEventListener('click', () => window.NSFDeck?.open());
    }
  }
  paintBanner();
  addEventListener('nsf-deck-change', paintBanner);
})();
