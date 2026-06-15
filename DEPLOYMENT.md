# Foodbela Production Deployment

এই setup-এ Docker Compose দিয়ে পুরো stack চলবে:

- `caddy`: public reverse proxy, automatic HTTPS.
- `website`: `https://foodbela.com` এবং `https://www.foodbela.com`.
- `backend`: internal API, public হবে `https://api.foodbela.com`.
- `restaurant-owner-web`: `https://owner.foodbela.com`.
- `admin-web`: `https://admin.foodbela.com`.
- `prometheus`, `grafana`, `loki`, `alloy`: monitoring stack, localhost-only ports.

## 1. DNS

Hostinger DNS panel-এ এই A records দিন:

```text
@       A   YOUR_VPS_IP
www     A   YOUR_VPS_IP
api     A   YOUR_VPS_IP
owner   A   YOUR_VPS_IP
admin   A   YOUR_VPS_IP
```

## 2. VPS setup

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git
```

Docker install:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor | sudo tee /etc/apt/keyrings/docker.gpg > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## 3. Project upload

Git repo থাকলে:

```bash
cd /opt
sudo git clone YOUR_REPO_URL foodbela
sudo chown -R $USER:$USER /opt/foodbela
cd /opt/foodbela
```

Local থেকে upload করলে:

```bash
scp -r ./upload USER@YOUR_VPS_IP:/opt/foodbela
ssh USER@YOUR_VPS_IP
cd /opt/foodbela
```

## 4. Environment

```bash
cp .env.example .env
nano .env
```

এই values production-এর জন্য ঠিক করুন:

```env
ACME_EMAIL=admin@foodbela.com

WEBSITE_BASE_URL=https://foodbela.com
BACKEND_API_BASE_URL=http://backend:5000/api/v1

CLIENT_ORIGIN=https://owner.foodbela.com
ADMIN_PANEL_ORIGIN=https://admin.foodbela.com
CUSTOMER_APP=https://foodbela.com
DELIVERY_APP=https://foodbela.com
BACKEND_PUBLIC_URL=https://api.foodbela.com

OWNER_VITE_API_BASE_URL=/api/v1
ADMIN_VITE_API_BASE_URL=/api/v1

ADMIN_AUTH_COOKIE_SECURE=true
OWNER_AUTH_COOKIE_SECURE=true
```

Strong secret বানাতে:

```bash
openssl rand -hex 32
```

এগুলো অবশ্যই real value দিয়ে replace করুন:

```env
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ADMIN_BOOTSTRAP_PASSWORD=
GRAFANA_ADMIN_PASSWORD=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMS_API_KEY=
```

## 5. MongoDB Atlas

Atlas dashboard:

```text
Network Access -> Add IP Address -> YOUR_VPS_IP
```

Connection string `.env`-এ:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER_HOST/foodbela?retryWrites=true&w=majority
```

Password-এ special character থাকলে URL encode করুন। যেমন `@` হলে `%40`।

## 6. Start

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

প্রথমবার Caddy SSL certificate নিতে কিছু সময় লাগতে পারে। DNS আগে VPS IP-তে point করতে হবে, নাহলে HTTPS certificate issue হবে না।

## 7. Check

```bash
curl -I https://foodbela.com
curl https://api.foodbela.com/api/v1/health
curl https://api.foodbela.com/api/v1/health/ready
```

Browser:

```text
https://foodbela.com
https://www.foodbela.com
https://owner.foodbela.com
https://admin.foodbela.com
https://api.foodbela.com/api/v1/health
```

Logs:

```bash
docker compose logs -f caddy
docker compose logs -f website
docker compose logs -f backend
docker compose logs -f restaurant-owner-web
docker compose logs -f admin-web
```

## 8. Update deploy

```bash
cd /opt/foodbela
git pull
docker compose up -d --build --remove-orphans
docker image prune -f
```

## 9. Email and Alerting

Hostinger Email দিয়ে alert পাঠাতে hPanel-এ:

```text
Emails -> foodbela.com -> Manage -> Email Accounts
```

একটি mailbox বানান, যেমন:

```text
alerts@foodbela.com
```

এই mailbox password-টাই SMTP password। Hostinger Email configuration সাধারণত:

```text
SMTP host: smtp.hostinger.com
SMTP port: 465
Encryption: SSL
Username: full email address, e.g. alerts@foodbela.com
Password: mailbox password
```

Root `.env`-এ:

```env
ALERTS_ENABLED=true
ALERT_RECIPIENT_EMAILS=admin@foodbela.com
ALERT_FROM_EMAIL=alerts@foodbela.com
ALERT_FROM_NAME=Foodbela Monitor
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerts@foodbela.com
SMTP_PASS=YOUR_HOSTINGER_MAILBOX_PASSWORD
ALERT_BACKEND_HEALTH_URL=https://api.foodbela.com/api/v1/health/ready
ALERT_METRICS_URL=http://backend:5000/metrics
ALERT_SSL_HOSTS=foodbela.com,www.foodbela.com,api.foodbela.com,owner.foodbela.com,admin.foodbela.com
ALERT_SSL_EXPIRY_DAYS=14
ALERT_MEMORY_RSS_MB=900
ALERT_5XX_THRESHOLD=5
```

Telegram optional:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Deploy:

```bash
docker compose up -d --build
docker compose logs -f health-alerts
```

এই alert worker check করবে:

- backend readiness down
- MongoDB disconnected
- backend 5xx error spike
- backend RSS memory high
- SSL certificate expiry/failure

Backend process নিজে admin critical operational alerts email/Telegram-এ পাঠাবে।

## 10. Monitoring

Monitoring ports public internet-এ খোলা নেই। SSH tunnel দিয়ে দেখুন:

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 USER@YOUR_VPS_IP
```

তারপর browser:

```text
Grafana: http://localhost:3000
Prometheus: http://localhost:9090
```

Grafana login `.env`-এর `GRAFANA_ADMIN_USER` এবং `GRAFANA_ADMIN_PASSWORD` দিয়ে।
