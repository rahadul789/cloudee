process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "5000";
process.env.API_PREFIX = process.env.API_PREFIX || "/api/v1";
process.env.MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/foodbela_test";
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
process.env.CUSTOMER_APP = process.env.CUSTOMER_APP || "http://localhost:8081";
process.env.DELIVERY_APP = process.env.DELIVERY_APP || "http://localhost:8082";
process.env.ADMIN_PANEL_ORIGIN =
  process.env.ADMIN_PANEL_ORIGIN || "http://localhost:5174";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test_access_secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test_refresh_secret";
process.env.CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || "test-cloud";
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "test-key";
process.env.CLOUDINARY_API_SECRET =
  process.env.CLOUDINARY_API_SECRET || "test-secret";
process.env.BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL || "http://localhost:5000";
process.env.METRICS_ENABLED = process.env.METRICS_ENABLED || "true";
process.env.METRICS_PATH = process.env.METRICS_PATH || "/metrics";
