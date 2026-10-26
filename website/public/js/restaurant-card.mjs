import { escapeHtml as h, safeImage } from './storefront-domain.mjs';

export function restaurantCard(restaurant) {
  const closed = restaurant.availability ? restaurant.availability.isOpen === false : restaurant.isOpen === false;
  const imageUrl = safeImage(restaurant.coverImage?.url || restaurant.logo?.url);
  const availability = restaurant.availability || {};
  let opensAt = availability.opensAtLabel || '';
  if (!opensAt && Number.isFinite(availability.opensAtEpochMs)) {
    opensAt = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(availability.opensAtEpochMs);
  }
  const rating = Number(restaurant.avgRating);
  const prepTime = Number(restaurant.preparationTimeMinutes);
  return `<a class="restaurant-card${closed ? ' is-closed' : ''}" href="/restaurants/${encodeURIComponent(restaurant._id)}">
    <div class="restaurant-media">
      ${imageUrl ? `<img src="${h(imageUrl)}" alt="${h(restaurant.name)}" loading="lazy">` : '<div class="restaurant-placeholder" aria-hidden="true">🍽</div>'}
      ${prepTime > 0 ? `<span class="prep-time">◷ ${h(prepTime)} মিনিট</span>` : ''}
      ${restaurant.offerLabel ? `<span class="restaurant-offer"><span aria-hidden="true">✦</span> ${h(restaurant.offerLabel)}</span>` : ''}
      ${closed ? `<div class="closed-overlay"><strong>সাময়িকভাবে বন্ধ</strong>${opensAt ? `<span>খুলবে: ${h(opensAt)}</span>` : '<span>আবার চালু হলে অর্ডার করতে পারবেন</span>'}</div>` : ''}
    </div>
    <div class="restaurant-info"><h3>${h(restaurant.name)}</h3><p>${h((restaurant.cuisineTypes || []).join(' · '))}</p>
      <div class="meta-row">${rating > 0 ? `<span class="restaurant-rating"><span aria-hidden="true">★</span> ${h(rating.toFixed(1))} <small>(${h(restaurant.reviewCount || 0)})</small></span>` : '<span class="restaurant-rating">নতুন রেস্টুরেন্ট</span>'}<span class="delivery-charge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17a3 3 0 1 0 0 .01M19 17a3 3 0 1 0 0 .01M5 17h8l3-8h-5l-2 4H5M14 5h3l2 7M3 9h5"/></svg> ডেলিভারি ৳20</span></div>
    </div>
  </a>`;
}
