// Isolated manual/browser QA only. No real account, payment, SMS or order is created.
const { createFixture } = require("./helpers/storefront-fixture.cjs");
const fixture = createFixture();
const backend = fixture.app.listen(0, "127.0.0.1", () => {
  process.env.NODE_ENV = "test";
  process.env.BACKEND_API_BASE_URL = `http://127.0.0.1:${backend.address().port}/api/v1`;
  process.env.WEBSITE_BASE_URL = "http://localhost:4321";
  require("../src/app").listen(4321, () => console.log("Isolated storefront QA: http://localhost:4321 (fixture data only)"));
});
