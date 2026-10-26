import { zoneDealSlides, restaurantOfferLabel, menuItemAvailability } from './storefront-discovery.mjs';
import { categoryScroller, bindCategoryScroll } from './category-scroll.mjs';
import { restaurantCard } from './restaurant-card.mjs';
import { escapeHtml as h, safeImage, cmsPath, validLocation, cartPayload, itemKey, validateSelections, money, statusLabel } from "./storefront-domain.mjs";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Current session remains usable. */ } };
const deviceId = read("foodbela-web-device-id", null) || crypto.randomUUID();
save("foodbela-web-device-id", deviceId);
const emptyCart = () => ({ restaurantId: "", restaurantName: "", items: [], voucherCode: "" });
const state = { location: read("foodbela-web-location", null), cart: read("foodbela-web-cart", emptyCart()), customer: null, quote: null, restaurant: null, menuItems: [], search: new URLSearchParams(location.search).get("search") || "", filter: new URLSearchParams(location.search).get("filter") || "all", page: 1, busy: false, auth: {}, homeVersion: 0, quoteVersion: 0, checkoutDraft: null };
if (!validLocation(state.location)) state.location = null;
if (!state.cart || !Array.isArray(state.cart.items) || state.cart.items.length > 50) state.cart = emptyCart();
state.cart.items = state.cart.items.filter((i) => typeof i.itemId === "string" && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 50);
const page = document.body.dataset.page;
let map, pin, pollTimer, returnToCheckout = false, checkoutVersion = 0;
async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`/shop-api${path}`, {
    method, credentials: "same-origin", headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json", "X-Foodbela-Web": "1" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "অনুরোধ সম্পন্ন হয়নি। আবার চেষ্টা করুন।");
    error.status = response.status; error.code = payload.code;
    throw error;
  }
  return payload.data;
}
function notice(message) { const el = $("#notice"); el.textContent = message; el.hidden = !message; }
function show(id) { const el = $(`#${id}`); if (!el.open) el.showModal(); }
function coordsQuery() { return state.location ? new URLSearchParams({ latitude: state.location.latitude, longitude: state.location.longitude }).toString() : ""; }
function persistCart() { const mobileCount = $("#mobile-cart-count"); if (mobileCount) mobileCount.textContent = state.cart.items.reduce((sum, i) => sum + i.quantity, 0).toLocaleString("bn-BD"); save("foodbela-web-cart", state.cart); $("#cart-count").textContent = state.cart.items.reduce((sum, i) => sum + i.quantity, 0).toLocaleString("bn-BD"); }
function invalidateQuote() { state.quote = null; state.quoteVersion++; }
function image(url, alt = "", attrs = "") { const src = safeImage(url); return src ? `<img src="${h(src)}" alt="${h(alt)}" loading="lazy" ${attrs}>` : ""; }
function empty(title, text = "") { return `<div class="empty-state"><h3>${h(title)}</h3><p class="muted">${h(text)}</p></div>`; }
function cardWithOffer(restaurant) { return restaurantCard({ ...restaurant, offerLabel: restaurantOfferLabel(restaurant._id, state.offers) }); }
async function loadRestaurants(append = false) {
  const list = $("#restaurant-list"); if (!list) return;
  updateSearchControls();
  const version = ++state.homeVersion;
  const requestedPage = append ? state.page + 1 : 1;
  const query = new URLSearchParams(coordsQuery());
  if (state.sortBy) query.set("sortBy", state.sortBy); query.set("search", state.search); query.set("filter", state.filter); query.set("page", requestedPage); query.set("pageSize", "18"); query.set("openStrict", "1");
  if (!append) { list.setAttribute("aria-busy", "true"); $("#load-more").hidden = true; }
  try {
    const result = await api(`/restaurants?${query}`);
    if (version !== state.homeVersion) return;
    state.listRestaurants = append ? [...(state.listRestaurants || []), ...(result.items || [])] : (result.items || []); const html = state.listRestaurants.map(cardWithOffer).join("");
    list.innerHTML = html || empty(state.location ? "এই ঠিকানায় রেস্টুরেন্ট পাওয়া যায়নি" : "এখন রেস্টুরেন্ট পাওয়া যাচ্ছে না", state.search ? "অন্য খাবার বা রেস্টুরেন্টের নাম দিয়ে খুঁজুন।" : "ঠিকানা পরিবর্তন করে দেখুন অথবা কিছুক্ষণ পরে আবার চেষ্টা করুন।");
    state.page = requestedPage;
    $("#load-more").hidden = !result.hasNextPage;
    $("#coverage-note").textContent = state.location ? `নির্বাচিত ঠিকানা: ${state.location.address}` : "সঠিক কভারেজ দেখতে ডেলিভারির ঠিকানা নির্বাচন করুন।";
    $("#restaurant-title").textContent = state.search ? `“${state.search}” খুঁজছেন` : "সব রেস্টুরেন্ট";
  } catch (error) { if (version === state.homeVersion) { notice(error.message); if (!append) list.innerHTML = empty("রেস্টুরেন্ট লোড হয়নি", "একটু পরে আবার চেষ্টা করুন।"); } }
  finally { if (version === state.homeVersion) list.removeAttribute("aria-busy"); }
}
let cmsVersion = 0, cleanupHomeArrows = () => {};
async function loadCms() {
  const root = $("#cms-content"); if (!root) return;
  const version = ++cmsVersion;
  cleanupHomeArrows();
  root.innerHTML = "";
  state.offers = []; if (state.listRestaurants?.length) $("#restaurant-list").innerHTML = state.listRestaurants.map(cardWithOffer).join("");
  $("#cuisine-filters").innerHTML = "";
  try {
    const home = await api(`/home?${coordsQuery()}`);
    if (version !== cmsVersion) return;
    const cms = home.homeCms || {};
    state.offers = home.activeOffers || [];
    if (state.listRestaurants?.length) $("#restaurant-list").innerHTML = state.listRestaurants.map(cardWithOffer).join("");
    const slides = zoneDealSlides(home, Boolean(state.location));
    let html = "";
    if (slides.length) html += `<section class="daily-deals"><h2>আজকের ডিল</h2><div class="deals-track">${slides.map(slide => `<a class="deal-card" href="${h(cmsPath(slide.path))}">${image(slide.url, slide.title)}</a>`).join("")}</div></section>`;
    const categories = cms.homeCategories?.isActive ? (cms.homeCategories.items || []).filter(i => i.isActive !== false).sort((a,b) => (a.position || 0) - (b.position || 0)) : [];
    if (categories.length) html += `<section class="favourite-cuisines"><h2>${h(cms.homeCategories.title || "পছন্দের খাবার")}</h2>${categoryScroller(`<div class="cms-categories" data-category-track>${categories.map(i => `<button class="category-chip" data-search="${h(i.searchQuery)}">${image(i.imageUrl, "") || '<span class="category-fallback" aria-hidden="true">🍽</span>'}<span>${h(i.label)}</span></button>`).join("")}</div>`, 'খাবারের ক্যাটাগরি')}</section>`;
    root.innerHTML = html;
    cleanupHomeArrows = bindCategoryScroll(root);
    $("#cuisine-filters").innerHTML = categories.length ? `<label><input type="radio" name="cuisine" value="" checked> সব ধরনের খাবার</label>${categories.map(i => `<label><input type="radio" name="cuisine" value="${h(i.searchQuery)}"> ${h(i.label)}</label>`).join("")}` : '<p class="muted">সব ধরনের খাবার খুঁজতে সার্চ ব্যবহার করুন।</p>';
    $$("[data-search]").forEach(b => b.addEventListener("click", () => applyCuisine(b.dataset.search)));
    $$("input[name=cuisine]").forEach(input => input.addEventListener("change", () => applyCuisine(input.value)));
    if (slides.length) void api("/cms/event", { eventType: "strip_impression" }).catch(() => {});
    $$(".deal-card").forEach(a => a.addEventListener("click", () => void api("/cms/event", { eventType: "strip_click" }).catch(() => {})));
  } catch (error) { if (version === cmsVersion) notice(error.message); }
}
function applyCuisine(search) {
  state.search = search; $("#search").value = search;
  $$("input[name=cuisine]").forEach(input => input.checked = input.value === search);
  void loadRestaurants();
}
function updateSearchControls() {
  if (!$("#search")) return;
  $("#search-clear").hidden = !$("#search").value;
  $("#results-clear").hidden = !state.search;
  $("#restaurant-title").textContent = state.search ? `“${state.search}” খুঁজছেন` : "সব রেস্টুরেন্ট";
}
function clearSearch() {
  state.search = ""; $("#search").value = "";
  $$("input[name=cuisine]").forEach(input => input.checked = input.value === "");
  const url = new URL(location.href); url.searchParams.delete("search"); history.replaceState(null, "", url.pathname + url.search + url.hash);
  updateSearchControls(); void loadRestaurants(); $("#search").focus();
}
function updateLocationLabel() { $("#location-label").textContent = state.location?.address || "লোকেশন বাছাই করুন"; }
async function openLocation() {
  if (state.busy) return;
  const form = $("#location-form");
  form.elements.address.value = state.location?.address || ""; form.elements.addressDetails.value = state.location?.addressDetails || "";
  form.elements.latitude.value = state.location?.latitude ?? ""; form.elements.longitude.value = state.location?.longitude ?? "";
  $("#location-status").textContent = "ম্যাপে ট্যাপ করে ডেলিভারির জায়গা বাছাই করুন।";
  show("location-dialog");
  if (window.L) {
    const center = [state.location?.latitude ?? 24.8831, state.location?.longitude ?? 90.7275];
    if (!map) {
      map = L.map("location-map").setView(center, 14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      map.on("click", (event) => setPin(event.latlng.lat, event.latlng.lng));
    }
    map.invalidateSize(); map.setView(center, 15);
    if (state.location) setPin(...center);
  } else $("#location-status").textContent = "ম্যাপ লোড হয়নি। বর্তমান লোকেশন ব্যবহার করুন অথবা অক্ষাংশ ও দ্রাঘিমাংশ দিন।";
  $("#saved-locations").innerHTML = "";
  if (state.customer) try {
    const locations = await api("/locations");
    $("#saved-locations").innerHTML = `<h3>আপনার সংরক্ষিত ঠিকানা</h3>${locations.map((l, i) => `<p><button class="secondary" data-saved="${i}">${h(l.label)} — ${h(l.address)}</button></p>`).join("")}`;
    $$("[data-saved]").forEach((b) => b.addEventListener("click", () => { const l = locations[Number(b.dataset.saved)]; form.elements.address.value = l.address; form.elements.addressDetails.value = l.addressDetails || ""; setPin(l.latitude, l.longitude); }));
  } catch (error) { $("#location-status").textContent = error.message; }
}
function setPin(latitude, longitude) {
  const form = $("#location-form"); form.elements.latitude.value = Number(latitude).toFixed(6); form.elements.longitude.value = Number(longitude).toFixed(6);
  if (map) { if (pin) pin.setLatLng([latitude, longitude]); else { pin = L.marker([latitude, longitude], { draggable: true }).addTo(map); pin.on("dragend", () => { const p = pin.getLatLng(); setPin(p.lat, p.lng); }); } map.panTo([latitude, longitude]); }
}
$("#use-gps").addEventListener("click", () => {
  if (!navigator.geolocation) { $("#location-status").textContent = "এই browser-এ লোকেশন পাওয়া যায় না। ম্যাপে জায়গা বেছে নিন।"; return; }
  $("#use-gps").disabled = true; $("#location-status").textContent = "লোকেশন নেওয়া হচ্ছে…";
  navigator.geolocation.getCurrentPosition((position) => {
    setPin(position.coords.latitude, position.coords.longitude); $("#use-gps").disabled = false;
    $("#location-status").textContent = `লোকেশন পাওয়া গেছে (প্রায় ${Math.round(position.coords.accuracy)} মিটার নির্ভুলতা)। পিন ও ঠিকানা যাচাই করে নিশ্চিত করুন।`;
  }, () => { $("#use-gps").disabled = false; $("#location-status").textContent = "লোকেশন পাওয়া যায়নি বা অনুমতি দেওয়া হয়নি। ম্যাপে জায়গা বাছাই করে ঠিকানা লিখুন।"; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
});
$("#location-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const next = { address: data.address.trim(), addressDetails: data.addressDetails.trim(), latitude: Number(data.latitude), longitude: Number(data.longitude), label: "ডেলিভারির ঠিকানা", source: "manual" };
  if (!validLocation(next)) { $("#location-status").textContent = "সঠিক লোকেশন ও ঠিকানা দিন।"; return; }
  state.location = next; save("foodbela-web-location", next); updateLocationLabel(); invalidateQuote(); $("#location-dialog").close(); notice("");
  if (page === "home") await Promise.allSettled([loadCms(), loadRestaurants()]);
  if (page === "restaurant") await loadRestaurant();
  if (page === "checkout") await renderCheckout();
});
async function loadRestaurant() {
  const id = location.pathname.split("/")[2];
  try {
    const result = await api(`/restaurants/${encodeURIComponent(id)}?${coordsQuery()}`);
    state.restaurant = result.restaurant; state.menuItems = result.menuItems || [];
    const r = result.restaurant; const closed = r.availability ? !r.availability.isOpen : r.isOpen === false;
    const menuCategories = [...(result.categories || []), { _id: "__other", name: "অন্যান্য খাবার" }].map((category, index) => ({ ...category, anchor: `menu-category-${index}`, items: state.menuItems.filter(item => category._id === "__other" ? !(result.categories || []).some(c => c._id === item.categoryId) : item.categoryId === category._id) })).filter(category => category.items.length);
    let html = `<section class="restaurant-hero"><div class="restaurant-cover">${image(r.coverImage?.url || r.logo?.url, r.name, 'decoding="async"')}<div class="cover-shade"></div></div><div class="restaurant-intro"><h1>${h(r.name)}</h1><p>${h(r.description || "")}</p><p class="muted">${h((r.cuisineTypes || []).join(" · "))}</p><span class="badge ${closed ? "closed" : ""}">${closed ? "এখন বন্ধ" : "এখন খোলা"}</span>${r.availability?.opensAtLabel && closed ? `<p>আবার খুলবে: ${h(r.availability.opensAtLabel)}</p>` : ""}${r.isServiceableForSelectedLocation === false ? '<p class="notice">এই ঠিকানায় এই রেস্টুরেন্টের ডেলিভারি পাওয়া যায় না।</p>' : ""}</div></section>`;
    html += `<div class="restaurant-menu-nav"><div class="menu-nav-heading"><strong>${h(r.name)}</strong><span class="muted">${menuCategories.length}টি ক্যাটাগরি</span></div>${categoryScroller(`<nav class="menu-category-tabs" data-category-track aria-label="খাবারের ক্যাটাগরি">${menuCategories.map((category, index) => `<a href="#${category.anchor}" ${index === 0 ? 'aria-current="true"' : ''}>${h(category.name)}</a>`).join("")}</nav>`, 'মেনু ক্যাটাগরি')}</div>`;
    for (const category of menuCategories) {
      const items = category.items;
      html += `<section class="menu-section" id="${category.anchor}"><h2 class="menu-category">${h(category.name)}</h2><div class="menu-grid">${items.map((item) => `<article class="menu-card"><div><h3>${h(item.name)}</h3><p>${h(item.description || "")}</p><strong>${money(item.markdown?.effectivePrice ?? item.basePrice)}</strong>${item.markdown?.hasMarkdown ? ` <del class="muted">${money(item.markdown.originalPrice)}</del>` : ""}<br>${menuItemButton(r, item)}</div>${image(item.images?.[0]?.url, item.name)}</article>`).join("")}</div></section>`;
    }
    $("#restaurant-detail").innerHTML = html; setupRestaurantMotion();
    $$("[data-item]").forEach((b) => b.addEventListener("click", () => openItem(b.dataset.item)));
  } catch (error) { notice(error.message); }
}
function menuItemButton(restaurant, item) {
  const status = menuItemAvailability(restaurant, item), tooltipId = `item-unavailable-${item._id}`;
  const button = `<button class="secondary" data-item="${h(item._id)}" ${status.disabled ? `disabled aria-describedby="${h(tooltipId)}"` : ''}>${h(status.label)}</button>`;
  return status.disabled ? `<span class="item-action is-unavailable" tabindex="0" role="group" aria-describedby="${h(tooltipId)}" title="${h(status.reason)}">${button}<span class="item-tooltip" role="tooltip" id="${h(tooltipId)}">${h(status.reason)}</span></span>` : button;
}
let cleanupRestaurantMotion = () => {};
function setupRestaurantMotion() {
  cleanupRestaurantMotion();
  const cover = $(".restaurant-cover"), coverImage = $("img", cover || document);
  const nav = $(".restaurant-menu-nav"), tabs = $$(".menu-category-tabs a");
  const cleanupArrows = bindCategoryScroll($("#restaurant-detail"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const activate = (id) => tabs.forEach(tab => { if (tab.hash === `#${id}`) tab.setAttribute("aria-current", "true"); else tab.removeAttribute("aria-current"); });
  let frame = 0, sectionObserver;
  const resize = () => {
    const headerHeight = $(".shop-header").getBoundingClientRect().height;
    const navHeight = nav?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--menu-nav-height", `${navHeight}px`);
    sectionObserver?.disconnect();
    if ("IntersectionObserver" in window) {
      sectionObserver = new IntersectionObserver(entries => {
        const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) activate(visible[0].target.id);
      }, { rootMargin: `-${Math.ceil(headerHeight + navHeight + 8)}px 0px -40% 0px`, threshold: 0 });
      $$(".menu-section").forEach(section => sectionObserver.observe(section));
    }
  };
  const onScroll = () => {
    if (frame || reduced.matches || !coverImage) return;
    frame = requestAnimationFrame(() => {
      frame = 0; if (!cover.isConnected) return;
      const rect = cover.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight) coverImage.style.transform = `translate3d(0,${Math.max(-20, Math.min(24, -rect.top * .08))}px,0)`;
    });
  };
  tabs.forEach(tab => tab.addEventListener("click", event => {
    const target = document.getElementById(tab.hash.slice(1)); if (!target) return;
    event.preventDefault(); activate(target.id);
    target.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "start" });
  }));
  const navResize = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
  if (nav) navResize?.observe(nav);
  resize(); window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", resize);
  cleanupRestaurantMotion = () => { cleanupArrows(); cancelAnimationFrame(frame); sectionObserver?.disconnect(); navResize?.disconnect(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", resize); };
}
function openItem(id) {
  const item = state.menuItems.find((i) => i._id === id); if (!item) return;
  const availability = menuItemAvailability(state.restaurant, item);
  if (availability.disabled) { notice(availability.reason); return; }
  $("#item-title").textContent = item.name;
  const form = $("#item-form"); form.dataset.item = id;
  form.innerHTML = `<p class="muted">${h(item.description || "")}</p>${[["variant", item.variants || []], ["addon", item.addOnGroups || []]].map(([kind, groups]) => groups.map((group, index) => `<fieldset><legend>${h(group.name)} <small>(${h(group.minSelect || 0)}–${h(group.maxSelect ?? group.options.length)}টি)</small></legend>${group.options.map((option, optionIndex) => `<label><input type="${Number(group.maxSelect ?? group.options.length) === 1 ? "radio" : "checkbox"}" name="${kind}-${index}" value="${optionIndex}" data-kind="${kind}" data-group="${index}">${h(option.label)} <span class="muted">+${money(option.priceDelta ?? option.price)}</span></label>`).join("")}</fieldset>`).join("")).join("")}<label>পরিমাণ<input name="quantity" type="number" min="1" max="50" step="1" value="1" required></label><p id="item-status" role="status"></p><button class="primary wide" type="submit">কার্টে যোগ করুন</button>`;
  show("item-dialog");
}
$("#item-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = event.currentTarget; const item = state.menuItems.find((i) => i._id === form.dataset.item); if (!item) return;
  const selections = (kind, groups) => $$(`input[data-kind="${kind}"]:checked`, form).map((input) => { const group = groups[Number(input.dataset.group)]; return { groupName: group.name, optionLabel: group.options[Number(input.value)].label }; });
  const selectedVariantOptions = selections("variant", item.variants || []), selectedAddOnOptions = selections("addon", item.addOnGroups || []);
  try { validateSelections(item, selectedVariantOptions, selectedAddOnOptions); } catch (error) { $("#item-status").textContent = error.message; return; }
  if (state.cart.items.length && state.cart.restaurantId !== state.restaurant._id) {
    if (!confirm(`${state.cart.restaurantName}-এর কার্ট সরিয়ে ${state.restaurant.name}-এর খাবার যোগ করবেন?`)) return;
    state.cart = emptyCart();
  }
  state.cart.restaurantId = state.restaurant._id; state.cart.restaurantName = state.restaurant.name;
  const entry = { itemId: item._id, name: item.name, quantity: Number(form.elements.quantity.value), selectedVariantOptions, selectedAddOnOptions };
  const existing = state.cart.items.find((i) => itemKey(i) === itemKey(entry));
  if (existing && existing.quantity + entry.quantity > 50) { $("#item-status").textContent = "একই খাবার সর্বোচ্চ ৫০টি যোগ করা যায়।"; return; }
  if (existing) existing.quantity += entry.quantity;
  else { if (state.cart.items.length >= 50) { $("#item-status").textContent = "কার্টে সর্বোচ্চ ৫০ ধরনের খাবার রাখা যায়।"; return; } state.cart.items.push(entry); }
  delete state.cart.clientOrderId; invalidateQuote(); persistCart(); $("#item-dialog").close(); notice(`${item.name} কার্টে যোগ হয়েছে।`);
});
function cartLines(quote = state.quote) {
  return state.cart.items.map((item, index) => { const quoted = quote?.items?.[index]; return `<div class="cart-line"><div class="cart-line-top"><strong>${h(item.name)}</strong>${quoted ? `<span>${money(quoted.effectiveLineTotal ?? quoted.lineTotal)}</span>` : ""}</div><small>${h([...(item.selectedVariantOptions || []), ...(item.selectedAddOnOptions || [])].map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · "))}</small><div class="quantity"><button data-quantity="${index}" data-delta="-1" aria-label="${h(item.name)} কমান">−</button><span>${h(item.quantity)}</span><button data-quantity="${index}" data-delta="1" ${item.quantity >= 50 ? "disabled" : ""} aria-label="${h(item.name)} বাড়ান">+</button><button data-remove="${index}">সরান</button></div></div>`; }).join("");
}
function pricingHtml(quote) {
  if (!quote) return "";
  const p = quote.pricing || {};
  const rows = [["খাবারের দাম", p.subtotal], ["খাবারের ছাড়", -Number(p.menuMarkdownAmount || 0)], ["ডেলিভারি চার্জ", p.deliveryFee], ["বৃষ্টির অতিরিক্ত চার্জ", p.rainSurcharge], [quote.platformFeeInfo?.label || "প্ল্যাটফর্ম ফি", p.platformFee], [quote.urgentDeliveryInfo?.label || "জরুরি ডেলিভারি", p.urgentDeliveryFee], ["ভাউচার ছাড়", -Number(p.discountAmount || 0)], ["প্রথম অর্ডারের ছাড়", -Number(p.firstOrderDiscountAmount || 0)]];
  return rows.filter(([,v],i) => i === 0 || i === 2 || Number(v)).map(([label,value]) => `<div class="price-row"><span>${h(label)}</span><span>${money(value)}</span></div>`).join("") + `<div class="price-row price-total"><span>মোট</span><span>${money(p.total)}</span></div>${quote.minimumOrder && !quote.minimumOrder.isMet ? `<p class="notice">ন্যূনতম অর্ডার ${money(quote.minimumOrder.amount)}। আরও ${money(quote.minimumOrder.amountShort)} যোগ করুন।</p>` : ""}`;
}
async function getQuote() {
  invalidateQuote(); const version = state.quoteVersion;
  if (!state.location) throw new Error("ডেলিভারির চার্জ ও কভারেজ দেখতে ঠিকানা বাছাই করুন।");
  const result = await api("/cart/quote", { ...cartPayload(state.cart, state.location), installId: deviceId });
  if (version !== state.quoteVersion) return null;
  state.quote = result; return result;
}
function bindCartControls(root, refresh) {
  $$("[data-quantity], [data-remove]", root).forEach((button) => button.addEventListener("click", () => {
    if (state.busy) return;
    const index = Number(button.dataset.quantity ?? button.dataset.remove);
    if (button.dataset.remove !== undefined) state.cart.items.splice(index, 1);
    else { state.cart.items[index].quantity += Number(button.dataset.delta); if (state.cart.items[index].quantity <= 0) state.cart.items.splice(index, 1); }
    delete state.cart.clientOrderId; invalidateQuote(); persistCart(); void refresh();
  }));
}
async function openCart() {
  if (state.busy) return;
  show("cart-dialog"); const root = $("#cart-content");
  if (!state.cart.items.length) { root.innerHTML = empty("আপনার কার্ট খালি", "রেস্টুরেন্ট থেকে পছন্দের খাবার যোগ করুন।"); return; }
  root.innerHTML = `<h3>${h(state.cart.restaurantName)}</h3>${cartLines(null)}<div id="cart-pricing"><p class="muted">বিল হিসাব করা হচ্ছে…</p></div><p><a class="primary wide" href="/checkout">Checkout-এ যান →</a></p>`;
  bindCartControls(root, openCart);
  try { const quote = await getQuote(); if (quote && $("#cart-pricing")) $("#cart-pricing").innerHTML = pricingHtml(quote); }
  catch (error) { if ($("#cart-pricing")) $("#cart-pricing").innerHTML = `<p class="notice">${h(error.message)}</p><button class="secondary" id="cart-location">ঠিকানা বাছাই করুন</button>`; $("#cart-location")?.addEventListener("click", () => { $("#cart-dialog").close(); void openLocation(); }); }
}
async function loadProfile() {
  try { const result = await api("/profile"); state.customer = result.customer || result; $("#auth-open").textContent = state.customer.fullName || "আমার অ্যাকাউন্ট"; }
  catch (error) { if (error.status === 401) { state.customer = null; $("#auth-open").textContent = "লগইন"; } }
}
function openAuth() {
  if (state.busy) return;
  show("auth-dialog"); $("#auth-status").textContent = "";
  if (state.customer) {
    $("#auth-content").innerHTML = `<p>${h(state.customer.fullName || "Foodbela কাস্টমার")}</p><p>${h(state.customer.phone || "")}</p><div class="auth-actions"><a class="secondary" href="/orders">আমার অর্ডার</a><button class="secondary" id="logout">লগআউট</button></div>`;
    $("#logout").addEventListener("click", async () => { try { await api("/auth/logout", {}); state.customer = null; invalidateQuote(); $("#auth-open").textContent = "লগইন"; $("#auth-dialog").close(); if (page === "checkout") void renderCheckout(); if (page === "orders") void loadOrders(); if (page === "home") void loadCms(); } catch (error) { $("#auth-status").textContent = error.message; } }); return;
  }
  authPhone();
}
function authForm(html, handler) {
  $("#auth-content").innerHTML = `<form id="auth-form">${html}</form>`;
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); if (button.disabled) return;
    button.disabled = true; $("#auth-status").textContent = "";
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch (error) { $("#auth-status").textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  });
}
function authPhone() {
  authForm('<label>মোবাইল নম্বর<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" pattern="01[0-9]{9}" maxlength="11" placeholder="01XXXXXXXXX" required></label><button type="submit" class="primary wide">এগিয়ে যান</button>', async ({ phone }) => {
    state.auth = { phone }; const result = await api("/auth/phone/start", { phone }); state.auth.start = result;
    if (result.flow === "password") authPassword(); else authOtp();
  });
}
function authPassword() {
  authForm(`<p>${h(state.auth.phone)}</p><label>পাসওয়ার্ড<input type="password" name="password" autocomplete="current-password" required></label><button type="submit" class="primary wide">লগইন</button><div class="auth-actions"><button type="button" id="otp-instead" class="secondary">OTP দিয়ে লগইন</button><button type="button" id="phone-back" class="quiet">নম্বর পরিবর্তন</button></div>`, async ({ password }) => { await api("/auth/phone/password", { phone: state.auth.phone, password, installId: deviceId, currentLocation: state.location || undefined }); await authComplete(); });
  $("#phone-back").addEventListener("click", authPhone);
  $("#otp-instead").addEventListener("click", async (event) => { const button = event.currentTarget; button.disabled = true; try { state.auth.start = await api("/auth/phone/start", { phone: state.auth.phone, useOtp: true }); authOtp(); } catch (error) { $("#auth-status").textContent = error.message; button.disabled = false; } });
}
function authOtp() {
  const start = state.auth.start;
  if (!start.verificationSessionId) throw new Error("OTP session পাওয়া যায়নি। আবার চেষ্টা করুন।");
  authForm(`<p>${h(state.auth.phone)} নম্বরে পাঠানো ৪ সংখ্যার কোড দিন।</p><label>OTP<input name="otpCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" required></label><button type="submit" class="primary wide">কোড যাচাই করুন</button><div class="auth-actions"><button type="button" id="resend-otp" class="secondary" disabled>আবার কোড পাঠান</button><button type="button" id="phone-back" class="quiet">নম্বর পরিবর্তন</button></div>`, async ({ otpCode }) => {
    const result = await api("/auth/phone/otp/verify", { verificationSessionId: start.verificationSessionId, otpCode });
    state.auth.verifiedId = result.verificationSessionId; authFinish();
  });
  $("#phone-back").addEventListener("click", authPhone);
  const resend = $("#resend-otp"); setTimeout(() => { if (resend.isConnected) resend.disabled = false; }, Math.max(1, start.resendAvailableInSeconds || 60) * 1000);
  resend.addEventListener("click", async () => { resend.disabled = true; try { state.auth.start = await api("/auth/phone/start", { phone: state.auth.phone, useOtp: true }); authOtp(); } catch (error) { $("#auth-status").textContent = error.message; resend.disabled = false; } });
}
function authFinish() {
  authForm(`<label>আপনার নাম<input name="fullName" autocomplete="name" maxlength="100" value="${h(state.auth.start.customer?.fullName || "")}" required></label><label>পাসওয়ার্ড (ইচ্ছা হলে)<input name="password" type="password" autocomplete="new-password" minlength="6"></label><button type="submit" class="primary wide">লগইন সম্পন্ন করুন</button>`, async (data) => { await api("/auth/phone/verify", { verificationSessionId: state.auth.verifiedId, fullName: data.fullName, ...(data.password ? { password: data.password } : {}), installId: deviceId, currentLocation: state.location || undefined }); await authComplete(); });
}
async function authComplete() {
  await loadProfile(); invalidateQuote(); $("#auth-dialog").close(); notice("লগইন হয়েছে।");
  if (returnToCheckout) { returnToCheckout = false; if (page !== "checkout") { location.href = "/checkout"; return; } }
  if (page === "checkout") await renderCheckout(); if (page === "orders") await loadOrders(); if (page === "home") void loadCms();
}
function captureDraft() {
  const form = $("#checkout-form"); if (form) state.checkoutDraft = Object.fromEntries(new FormData(form));
}
async function renderCheckout() {
  const root = $("#checkout-content"); if (!root) return;
  const version = ++checkoutVersion;
  if (!state.cart.items.length) { root.innerHTML = `<h1>Checkout</h1>${empty("আপনার কার্ট খালি", "রেস্টুরেন্ট থেকে খাবার যোগ করে ফিরে আসুন।")}<p><a class="primary" href="/restaurants">খাবার বেছে নিন</a></p>`; return; }
  captureDraft(); const draft = state.checkoutDraft || {};
  root.innerHTML = `<h1>আপনার অর্ডার</h1><div class="checkout-layout"><section class="panel"><h2>ডেলিভারি ও পেমেন্ট</h2><p>${h(state.location?.address || "ডেলিভারির ঠিকানা দেওয়া হয়নি")}</p><button id="checkout-location" class="secondary">ঠিকানা বাছাই / পরিবর্তন</button>${!state.customer ? '<p class="notice">খাবার অর্ডার করতে আপনার মোবাইল নম্বর দিয়ে লগইন করুন।</p><button class="primary" id="checkout-login">লগইন করুন</button>' : `<p class="muted">${h(state.customer.fullName)} · ${h(state.customer.phone)}</p>`}<form id="checkout-form" class="checkout-form"><label>বাড়ি / ফ্ল্যাট / অতিরিক্ত ঠিকানা<input name="addressDetails" maxlength="240" value="${h(draft.addressDetails ?? state.location?.addressDetails ?? "")}"></label><label>রেস্টুরেন্টের জন্য নির্দেশনা<textarea name="note" maxlength="240" rows="2">${h(draft.note || "")}</textarea></label><label>কুপন কোড<input name="voucherCode" maxlength="80" value="${h(state.cart.voucherCode || "")}"></label><p><button id="apply-voucher" type="button" class="secondary">কুপন প্রয়োগ করুন</button></p><div id="fee-options"></div><h3>পেমেন্ট পদ্ধতি</h3><div id="payment-options"><p class="muted">পেমেন্ট পদ্ধতি লোড হচ্ছে…</p></div><p id="checkout-status" role="status"></p><button id="place-order" class="primary wide" type="submit" disabled>অর্ডার নিশ্চিত করুন</button></form></section><aside class="panel"><h2>${h(state.cart.restaurantName)}</h2><div id="checkout-lines">${cartLines(null)}</div><div id="checkout-pricing"><p class="muted">বিল হিসাব করা হচ্ছে…</p></div></aside></div>`;
  $("#checkout-location").addEventListener("click", () => { captureDraft(); void openLocation(); });
  $("#checkout-login")?.addEventListener("click", () => { returnToCheckout = true; openAuth(); });
  bindCartControls($("#checkout-lines"), renderCheckout);
  $("#apply-voucher").addEventListener("click", async () => { captureDraft(); state.cart.voucherCode = $("#checkout-form").elements.voucherCode.value.trim(); delete state.cart.clientOrderId; persistCart(); await renderCheckout(); });
  $("#checkout-form").addEventListener("submit", placeOrder);
  try {
    const [quote, settings] = await Promise.all([getQuote(), api("/settings")]);
    if (!quote || !$("#checkout-pricing") || version !== checkoutVersion) return;
    $("#checkout-pricing").innerHTML = pricingHtml(quote);
    $("#checkout-lines").innerHTML = cartLines(quote); bindCartControls($("#checkout-lines"), renderCheckout);
    const fees = [];
    if (quote.platformFeeInfo?.enabled && quote.platformFeeInfo.optional && quote.platformFeeInfo.amount > 0) fees.push(["platformFeeOptedIn", quote.platformFeeInfo]);
    if (quote.urgentDeliveryInfo?.enabled && quote.urgentDeliveryInfo.amount > 0) fees.push(["urgentDeliveryOptedIn", quote.urgentDeliveryInfo]);
    $("#fee-options").innerHTML = fees.map(([key, info]) => `<label class="radio-label"><input type="checkbox" data-fee="${key}" ${state.cart[key] ? "checked" : ""}>${h(info.label)} +${money(info.amount)}</label><p class="muted">${h(info.note || "")}</p>`).join("");
    $$("[data-fee]").forEach((input) => input.addEventListener("change", () => { captureDraft(); state.cart[input.dataset.fee] = input.checked; delete state.cart.clientOrderId; persistCart(); void renderCheckout(); }));
    const p = settings.payments || {};
    // Cash is always enabled by the existing backend's getPaymentMethodSettings.
    $("#payment-options").innerHTML = `<label class="radio-label"><input type="radio" name="paymentMethod" value="Cash" checked>ক্যাশ অন ডেলিভারি</label>${p.bkashEnabled ? `<label class="radio-label"><input type="radio" name="paymentMethod" value="Bkash" ${draft.paymentMethod === "Bkash" ? "checked" : ""}>${h(p.bkashLabel || "bKash")}</label><label id="bkash-wallet-label" ${draft.paymentMethod === "Bkash" ? "" : "hidden"}>bKash নম্বর<input name="walletNumber" type="tel" inputmode="tel" pattern="01[0-9]{9}" maxlength="11" value="${h(draft.walletNumber || state.customer?.phone || "")}"></label>` : ""}`;
    $$("input[name=paymentMethod]").forEach((radio) => radio.addEventListener("change", () => { if ($("#bkash-wallet-label")) $("#bkash-wallet-label").hidden = radio.value !== "Bkash"; if ($("input[name=walletNumber]")) $("input[name=walletNumber]").required = radio.value === "Bkash"; }));
    $("#place-order").disabled = !state.customer || !state.location || quote.minimumOrder?.isMet === false;
  } catch (error) { if ($("#checkout-pricing") && version === checkoutVersion) $("#checkout-pricing").innerHTML = `<p class="notice">${h(error.message)}</p>`; }
}
async function placeOrder(event) {
  event.preventDefault(); if (state.busy) return;
  if (!state.customer) { returnToCheckout = true; openAuth(); return; }
  if (!state.location) { void openLocation(); return; }
  const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
  if (String(data.voucherCode || "").trim() !== String(state.cart.voucherCode || "").trim()) {
    captureDraft(); state.cart.voucherCode = String(data.voucherCode || "").trim(); delete state.cart.clientOrderId; persistCart();
    await renderCheckout(); notice("কুপন অনুযায়ী নতুন বিল যাচাই করে অর্ডার নিশ্চিত করুন।"); return;
  }
  if (data.paymentMethod === "Bkash" && !/^01\d{9}$/.test(data.walletNumber || "")) { $("#checkout-status").textContent = "সঠিক bKash নম্বর দিন।"; return; }
  state.busy = true; $("#place-order").disabled = true; $$("button,input,textarea", form).forEach((el) => el.disabled = true);
  $("#checkout-status").textContent = "অর্ডার যাচাই করা হচ্ছে…";
  try {
    const displayedTotal = state.quote?.pricing.total;
    const quote = await getQuote();
    if (!quote) throw new Error("কার্ট পরিবর্তিত হয়েছে। আবার বিল যাচাই করুন।");
    if (quote.minimumOrder && !quote.minimumOrder.isMet) throw new Error("ন্যূনতম অর্ডারের পরিমাণ পূরণ হয়নি।");
    if (displayedTotal !== quote.pricing.total) { $("#checkout-pricing").innerHTML = pricingHtml(quote); throw new Error("বিল পরিবর্তিত হয়েছে। নতুন মোট বিল দেখে আবার অর্ডার নিশ্চিত করুন।"); }
    const base = cartPayload(state.cart, state.location);
    const draftFingerprint = JSON.stringify({ ...base, paymentMethod: data.paymentMethod, walletNumber: data.walletNumber, note: data.note, addressDetails: data.addressDetails, addressLine: state.location.address });
    if (state.cart.orderFingerprint !== draftFingerprint || !state.cart.clientOrderId) { state.cart.clientOrderId = crypto.randomUUID(); state.cart.orderFingerprint = draftFingerprint; persistCart(); }
    const body = { ...base, installId: deviceId, clientOrderId: state.cart.clientOrderId, note: data.note?.trim(), deliveryAddress: { label: "ডেলিভারির ঠিকানা", addressLine: state.location.address, addressDetails: data.addressDetails?.trim(), latitude: state.location.latitude, longitude: state.location.longitude } };
    delete body.latitude; delete body.longitude;
    if (data.paymentMethod === "Bkash") {
      const result = await api("/payments/bkash/initiate", { ...body, walletNumber: data.walletNumber });
      const url = new URL(result.bkashURL);
      if (url.protocol !== "https:" || !(url.hostname === "bkash.com" || url.hostname.endsWith(".bkash.com"))) throw new Error("নিরাপদ bKash checkout ঠিকানা পাওয়া যায়নি।");
      save("foodbela-web-pending-payment", { sessionId: result.sessionId, clientOrderId: state.cart.clientOrderId });
      location.assign(url.href);
    } else {
      const result = await api("/orders", { ...body, paymentMethod: "Cash" });
      if (!result.order?._id) throw new Error("অর্ডার নিশ্চিত হয়নি। আপনার অর্ডার তালিকা যাচাই করুন।");
      state.cart = emptyCart(); persistCart(); location.assign(`/orders/${encodeURIComponent(result.order._id)}`);
    }
  } catch (error) { $("#checkout-status").textContent = `${error.message}${error.status >= 500 ? " অর্ডার তালিকা যাচাই করে একই অর্ডার পুনরায় চেষ্টা করুন।" : ""}`; if (error.status === 401) { state.customer = null; $("#checkout-status").textContent += " আবার লগইন করুন।"; } }
  finally { state.busy = false; $$("button,input,textarea", form).forEach((el) => el.disabled = false); }
}
function orderHtml(order, details = false) {
  return `<article class="order-card"><div class="cart-line-top"><h2>${h(order.orderNumber || order._id)}</h2><span class="badge">${h(statusLabel(order.status))}</span></div><p class="muted">${h(order.createdAt ? new Date(order.createdAt).toLocaleString("bn-BD") : "")}</p>${(order.itemsSnapshot || []).map((i) => `<p>${h(i.name)} × ${h(i.quantity)} <span class="muted">${money(i.unitPrice * i.quantity)}</span></p>`).join("")}<p><strong>মোট ${money(order.pricing?.total)}</strong> · ${h(order.paymentMethod)} · ${h(order.paymentStatus || "")}</p>${details ? `<p>${h(order.customerSnapshot?.deliveryAddress?.addressLine || "")}</p>${order.riderSnapshot?.name ? `<p>রাইডার: ${h(order.riderSnapshot.name)}${order.riderSnapshot.phone && order.riderPhoneVisible !== false ? ` · <a href="tel:${h(order.riderSnapshot.phone.replace(/[^+\d]/g, ""))}">${h(order.riderSnapshot.phone)}</a>` : ""}</p>` : ""}<ol class="order-timeline">${(order.history || []).map((entry) => `<li>${h(statusLabel(entry.status))}${entry.createdAt ? ` <small class="muted">${h(new Date(entry.createdAt).toLocaleTimeString("bn-BD"))}</small>` : ""}</li>`).join("")}</ol>${order.status === "New" ? `<button class="secondary" id="cancel-order">অর্ডার বাতিলের অনুরোধ</button>` : ""}` : `<a class="secondary" href="/orders/${encodeURIComponent(order._id)}">অর্ডার দেখুন →</a>`}</article>`;
}
async function loadOrders() {
  const root = $("#orders-content"); if (!root) return;
  clearTimeout(pollTimer);
  if (!state.customer) { root.innerHTML = `<h1>আপনার অর্ডার</h1>${empty("অর্ডার দেখতে লগইন করুন")}<p><button class="primary" id="orders-login">লগইন</button></p>`; $("#orders-login").addEventListener("click", openAuth); return; }
  const id = location.pathname.startsWith("/orders/") ? location.pathname.split("/")[2] : null;
  try {
    if (id) {
      const order = await api(`/orders/${encodeURIComponent(id)}`);
      root.innerHTML = `<a class="back-link" href="/orders">← আমার সব অর্ডার</a><h1>অর্ডারের আপডেট</h1>${orderHtml(order, true)}`;
      $("#cancel-order")?.addEventListener("click", async (event) => { if (!confirm("অর্ডারটি বাতিলের অনুরোধ করবেন?")) return; const button = event.currentTarget; button.disabled = true; try { await api(`/orders/${encodeURIComponent(id)}/cancel`, { reason: "Customer requested cancellation from website" }); await loadOrders(); } catch (error) { notice(error.message); button.disabled = false; } });
      if (!["Delivered", "Rejected", "Cancelled"].includes(order.status)) pollTimer = setTimeout(() => { if (!document.hidden) void loadOrders(); }, 15000);
    } else {
      const orders = await api("/orders?page=1&pageSize=30");
      root.innerHTML = `<h1>আপনার অর্ডার</h1>${orders.length ? orders.map((o) => orderHtml(o)).join("") : empty("এখনো কোনো অর্ডার নেই", "আপনার পছন্দের রেস্টুরেন্ট থেকে প্রথম অর্ডারটি করুন।")}`;
      if (location.pathname === "/payment-return") {
        const query = new URLSearchParams(location.search), orderId = query.get("orderId");
        // Query-string status is never proof of payment. Confirm via owned backend orders.
        const pending = read("foodbela-web-pending-payment", null);
        const verified = orderId ? await api(`/orders/${encodeURIComponent(orderId)}`).catch(() => null) : null;
        if (verified?.paymentStatus === "paid") {
          if (pending?.sessionId && verified.paymentSnapshot?.sessionId === pending.sessionId) { state.cart = emptyCart(); persistCart(); save("foodbela-web-pending-payment", null); }
          location.replace(`/orders/${encodeURIComponent(verified._id)}`);
        }
        else notice("পেমেন্টের অবস্থা আপনার অর্ডার তালিকা থেকে যাচাই করুন। অর্ডার না দেখালে সাপোর্টে যোগাযোগ করুন; নিশ্চিত না হয়ে আবার পেমেন্ট করবেন না।");
      }
    }
  } catch (error) { if (error.status === 401) { state.customer = null; void loadOrders(); } else notice(error.message); }
}
$("#location-open").addEventListener("click", () => void openLocation());
$("#auth-open").addEventListener("click", openAuth);
$("#cart-open").addEventListener("click", () => void openCart());
$("#mobile-cart-open").addEventListener("click", () => void openCart());
$("#mobile-auth-open").addEventListener("click", openAuth);
const filterPanel = $(".filter-panel");
const mobileFilters = matchMedia("(max-width: 760px)");
function syncFilterLayout() { if (filterPanel) filterPanel.open = !mobileFilters.matches; }
mobileFilters.addEventListener("change", syncFilterLayout); syncFilterLayout();
function syncHeaderHeight() { document.documentElement.style.setProperty("--shop-header-height", `${Math.ceil($(".shop-header").getBoundingClientRect().height)}px`); }
if ("ResizeObserver" in window) new ResizeObserver(syncHeaderHeight).observe($(".shop-header"));
syncHeaderHeight(); window.addEventListener("resize", syncHeaderHeight);
$$('[data-close]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
$("#search-form")?.addEventListener("submit", (event) => { event.preventDefault(); state.search = $("#search").value.trim(); void loadRestaurants(); $("#restaurant-section").scrollIntoView({ behavior: "smooth" }); });
$("#search")?.addEventListener("input", updateSearchControls);
$("#search-clear")?.addEventListener("click", clearSearch);
$("#results-clear")?.addEventListener("click", clearSearch);
function setRestaurantFilter(value) {
  state.filter = value; $("#restaurant-filter").value = value;
  $$("input[name=availability-filter]").forEach(input => input.checked = input.value === value);
  void loadRestaurants();
}
$("#restaurant-filter")?.addEventListener("change", event => setRestaurantFilter(event.currentTarget.value));
$$("input[name=availability-filter]").forEach(input => input.addEventListener("change", () => setRestaurantFilter(input.value)));
$$("input[name=sort]").forEach(input => input.addEventListener("change", () => { state.sortBy = input.value; void loadRestaurants(); }));
$("#reset-filters")?.addEventListener("click", () => {
  state.sortBy = ""; state.search = ""; $("#search").value = "";
  $$("input[name=sort], input[name=cuisine]").forEach(input => input.checked = input.value === "");
  setRestaurantFilter("all");
});
$("#load-more")?.addEventListener("click", async (event) => { const button = event.currentTarget; button.disabled = true; await loadRestaurants(true); button.disabled = false; });
document.addEventListener("visibilitychange", () => { if (!document.hidden && page === "orders") void loadOrders(); });
if (/Android/i.test(navigator.userAgent)) {
  let dismissed = false; try { dismissed = sessionStorage.getItem("foodbela-android-app-dismissed"); } catch { /* Optional. */ }
  if (!dismissed) $("#app-prompt").hidden = false;
  const store = "https://play.google.com/store/apps/details?id=com.foodbela.app";
  const target = page === "restaurant" || location.pathname.startsWith("/orders/") ? location.pathname : "/";
  $("#app-intent").href = `intent://${target}#Intent;scheme=foodbela;package=com.foodbela.app;S.browser_fallback_url=${encodeURIComponent(store)};end`;
  $("#app-dismiss").addEventListener("click", () => { $("#app-prompt").hidden = true; try { sessionStorage.setItem("foodbela-android-app-dismissed", "1"); } catch { /* Optional. */ } });
}
updateLocationLabel(); persistCart();
await loadProfile();
if (page === "home") { $("#search").value = state.search; $("#restaurant-filter").value = state.filter; $$("input[name=availability-filter]").forEach(input => input.checked = input.value === state.filter); await Promise.allSettled([loadCms(), loadRestaurants()]); }
if (page === "restaurant") await loadRestaurant();
if (page === "checkout") await renderCheckout();
if (page === "orders") await loadOrders();
if ((!state.location && ["home", "restaurant", "checkout"].includes(page)) || new URLSearchParams(location.search).get("location") === "1") void openLocation();
