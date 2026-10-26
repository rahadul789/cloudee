import { escapeHtml as h } from './storefront-domain.mjs';

export function categoryScroller(markup, label) {
  return `<div class="category-scroll-shell"><button type="button" class="category-scroll-arrow scroll-left" data-scroll-direction="-1" aria-label="${h(label)} বামে"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>${markup}<button type="button" class="category-scroll-arrow scroll-right" data-scroll-direction="1" aria-label="${h(label)} ডানে"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div>`;
}

export function bindCategoryScroll(root) {
  const cleanups = [];
  for (const shell of root.querySelectorAll('.category-scroll-shell')) {
    const track = shell.querySelector('[data-category-track]');
    if (!track) continue;
    const buttons = [...shell.querySelectorAll('[data-scroll-direction]')];
    let frame = 0, active = true;
    const update = () => {
      frame = 0;
      const max = track.scrollWidth - track.clientWidth;
      buttons.forEach(button => { button.disabled = Number(button.dataset.scrollDirection) < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max - 2; });
      shell.dataset.scrollable = String(max > 2);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onClick = event => track.scrollBy({ left: Number(event.currentTarget.dataset.scrollDirection) * Math.max(160, track.clientWidth * .7), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    buttons.forEach(button => button.addEventListener('click', onClick));
    track.addEventListener('scroll', onScroll, { passive: true });
    const observer = 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    observer?.observe(track); window.addEventListener('resize', onScroll);
    document.fonts?.ready.then(() => { if (active) update(); }); update();
    cleanups.push(() => { active = false; cancelAnimationFrame(frame); observer?.disconnect(); track.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); buttons.forEach(button => button.removeEventListener('click', onClick)); });
  }
  return () => cleanups.forEach(cleanup => cleanup());
}
