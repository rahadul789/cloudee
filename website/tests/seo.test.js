const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPageSeo, buildSitemapXml, buildAreaSeo } = require("../src/services/seo.service");
const { fallbackSettings } = require("../src/services/website-api.service");
const { getFoodbelaFacts } = require("../src/services/foodbela-facts.service");

test("fallback metadata does not invent contact information or a physical location", () => {
  const seo = buildPageSeo({ path: "/" }, fallbackSettings);
  const graph = JSON.parse(seo.structuredDataJson);
  const organization = graph.find((item) => item["@type"] === "Organization");
  assert.equal(organization.telephone, undefined);
  assert.equal(organization.address, undefined);
  assert.ok(!graph.some((item) => item["@type"] === "LocalBusiness"));
  assert.equal(graph.find((item) => item["@type"] === "WebSite").potentialAction, undefined);
  const configured = JSON.parse(buildPageSeo({ path: "/" }, {
    ...fallbackSettings, supportPhone: "+8801812345678", businessAddress: "Office address", businessCity: "Netrakona",
    facebookUrl: "https://www.facebook.com/example",
  }).structuredDataJson);
  assert.equal(configured.find((item) => item["@type"] === "LocalBusiness").telephone, "+8801812345678");
  assert.deepEqual(configured[0].sameAs, ["https://www.facebook.com/example"]);
});

test("only active coverage is advertised and submitted for indexing", () => {
  const settings = { ...fallbackSettings, updatedAt: "invalid-date" };
  const xml = buildSitemapXml(settings);
  assert.match(xml, /netrakona-food-delivery/);
  assert.doesNotMatch(xml, /mohongonj|dhaka|mirpur|lastmod/);
  const upcoming = settings.serviceAreas.find((area) => area.status !== "active");
  assert.equal(buildAreaSeo({ path: "/areas/example" }, settings, upcoming).robots, "noindex,follow");
  assert.match(getFoodbelaFacts(settings)[1].answer, /Netrakona/);
  assert.doesNotMatch(getFoodbelaFacts(settings)[1].answer, /Mohongonj/);
});

test("facts render in HTML and JSON-LD safely without requiring browser JavaScript", async () => {
  const ejs = require("ejs");
  const path = require("node:path");
  const settings = { ...fallbackSettings, serviceAreas: [{ name: "</script><script>test</script>", status: "active" }] };
  const foodbelaFacts = getFoodbelaFacts(settings);
  const seo = buildPageSeo({ path: "/" }, settings, "home", { faqs: foodbelaFacts });
  assert.doesNotMatch(seo.structuredDataJson, /<script>/);
  for (const page of ["home", "about"]) {
    const html = await ejs.renderFile(path.join(__dirname, "../src/views/pages", `${page}.ejs`), {
      title: seo.title, description: seo.description, seo, websiteSettings: settings,
      foodbelaFacts, activePath: "/", currentYear: 2026,
    });
    assert.match(html, /Foodbela সম্পর্কে প্রয়োজনীয় তথ্য/);
    assert.match(html, /&lt;\/script&gt;/);
    assert.match(html, /application\/ld\+json/);
  }
});
