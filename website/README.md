# Foodbela Website

Lightweight Express + EJS public website for Foodbela.

## Run locally

```bash
npm install
npm run dev
```

Default URL: `http://localhost:4200`

## Lead handling

Restaurant, rider, and contact leads are accepted at `POST /leads`.

If `BACKEND_LEADS_API_URL` is set, the website forwards leads to that endpoint. If it is not set, or the remote call fails, leads are appended to `storage/leads.jsonl`.
