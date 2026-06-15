# Foodbela Delivery App

Expo rider app for Foodbela delivery operations.

## Environment

Create `delivery-app/.env` from `.env.example`:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com/api/v1
```

Production builds require HTTPS. Development can still use a local backend URL.

## Development

```bash
npm install
npm run start
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
npm audit --omit=dev --audit-level=moderate
```

## Native Notes

- `google-services.json`, Firebase admin SDK files, `.env`, and `local.properties` must stay local.
- Google Maps keys should be restricted in Google Cloud by Android package name and SHA fingerprints.
- Background location is enabled for active deliveries; keep app store privacy text aligned with this behavior.
