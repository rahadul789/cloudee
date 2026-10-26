import { safeImage } from './storefront-domain.mjs';

export function zoneDealSlides(home, hasLocation) {
  const deals = home?.webDeals;
  if (!hasLocation || !deals?.zoneId || deals.sourceScope !== `zone:${deals.zoneId}`) return [];
  const strip = deals.offerStrip;
  if (!strip?.isActive || strip.mode === 'hidden') return [];
  if (strip.variant === 'carousel') {
    const carousel = strip.carouselImages?.length ? strip.carouselImages : (strip.carouselImageUrls || []).map(url => ({ url }));
    return carousel.filter(slide => safeImage(slide.url)).map(slide => ({ url: slide.url, title: strip.title || 'অফার', path: slide.linkEnabled ? slide.ctaPath : strip.ctaPath }));
  }
  if (strip.variant === 'text' || !safeImage(strip.imageUrl)) return [];
  return [{ url: strip.imageUrl, title: strip.title || 'অফার', path: strip.ctaPath }];
}

export function restaurantOfferLabel(restaurantId, offers = []) {
  const offer = offers.find(item => item.scopeType !== 'all_restaurants' && !item.areaWide &&
    (item.restaurantIds?.length ? item.restaurantIds : [item.restaurantId]).some(id => String(id) === String(restaurantId)));
  if (!offer) return '';
  if (offer.type === 'free_delivery') return 'ফ্রি ডেলিভারি';
  const value = Number(offer.discountValue);
  if (!(value > 0)) return '';
  if (offer.type === 'percentage') return `${value}% ছাড়`;
  if (offer.type === 'flat') return `৳${value} ছাড়`;
  return '';
}

export function menuItemAvailability(restaurant, item) {
  const closed = restaurant.availability ? restaurant.availability.isOpen === false : restaurant.isOpen === false;
  if (closed) return { disabled: true, label: 'এখন বন্ধ', reason: restaurant.availability?.opensAtLabel ? `রেস্টুরেন্ট এখন বন্ধ। আবার খুলবে: ${restaurant.availability.opensAtLabel}` : 'রেস্টুরেন্ট এখন বন্ধ। চালু হলে খাবার যোগ করতে পারবেন।' };
  if (restaurant.isServiceableForSelectedLocation === false) return { disabled: true, label: 'ডেলিভারি নেই', reason: 'আপনার নির্বাচিত ঠিকানায় এই রেস্টুরেন্ট ডেলিভারি দেয় না।' };
  if (item.availability === 'unavailable') return { disabled: true, label: 'এখন পাওয়া যাচ্ছে না', reason: 'এই খাবারটি এখন পাওয়া যাচ্ছে না। পরে আবার দেখুন।' };
  return { disabled: false, label: 'যোগ করুন +', reason: '' };
}
