const app = require("./app");

const port = Number(process.env.PORT || 4200);

app.listen(port, () => {
  console.log(`Foodbela website is running on http://localhost:${port}`);
});
