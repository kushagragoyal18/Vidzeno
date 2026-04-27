# Vidzeno

A modern, scalable video conversion SaaS platform that mimics the simplicity of ilovepdf.com. Built with React, Node.js, FFmpeg, and Redis.

![Vidzeno](https://img.shields.io/badge/vidzeno-v1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Multi-format Support**: Convert between MP4, AVI, MOV, MKV, WEBM, FLV, WMV, GIF, and MP3
- **Drag & Drop UI**: Simple, intuitive interface inspired by ilovepdf.com
- **Freemium Model**: 
  - Free: 500MB max, 2 conversions/day, watermark
  - Premium: 4GB max, unlimited conversions, no watermark, priority queue
- **User Authentication**: Email/password + Google/GitHub OAuth
- **Stripe Integration**: Monthly ($9.99) and yearly ($79.99) subscriptions
- **Async Processing**: Redis + BullMQ queue system for reliable processing
- **Secure**: JWT cookies, rate limiting, file validation, path traversal protection

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Tailwind CSS + react-dropzone |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL (via Supabase or self-hosted) |
| Queue | Redis + BullMQ |
| Video Processing | FFmpeg |
| Authentication | JWT (HttpOnly cookies) + OAuth |
| Payments | Stripe Checkout + Webhooks |
| Storage | Local (dev) / S3 (production) |
| Containerization | Docker + Kubernetes |

## Project Structure

```
vidzeno/
├── backend/           # Express API server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── middleware/# Auth, rate limiting, upload
│   │   ├── services/  # Queue, storage
│   │   ├── db/        # Database schema, migrations
│   │   └── index.ts   # Entry point
│   └── package.json
├── worker/            # FFmpeg worker process
│   ├── src/
│   │   ├── processor.ts
│   │   ├── formats.ts
│   │   └── index.ts
│   └── package.json
├── frontend/          # React application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api.ts
│   └── package.json
├── docker/            # Docker configurations
├── k8s/               # Kubernetes manifests
├── docker-compose.yml # Local development
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- FFmpeg (for local development without Docker)

### 1. Clone and Setup

```bash
cd vidzeno
cp .env.example .env
```

Edit `.env` with your credentials:
- Stripe keys (for payments)
- OAuth credentials (optional, for Google/GitHub login)
- JWT secret (use a strong random string)

### 2. Start with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Run database migrations
docker-compose exec backend npm run migrate
```

Services will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- MinIO (S3): http://localhost:9001

### 3. Local Development (without Docker)

```bash
# Install dependencies
npm install

# Start database and Redis (via Docker)
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Start backend and worker
npm run dev
```

In another terminal:
```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### File Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload video file |
| GET | `/api/upload/:fileId` | Get upload status |

### Conversion
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/convert` | Start conversion |
| GET | `/api/convert/job/:jobId` | Get job status |
| GET | `/api/convert/formats` | List supported formats |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/create-checkout-session` | Create Stripe checkout |
| GET | `/api/payments/subscription` | Get subscription status |
| POST | `/api/payments/create-portal-session` | Manage subscription |

### Content
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/content/faq` | Get FAQ content |
| POST | `/api/content/contact` | Submit contact form |

## Environment Variables

See `.env.example` for all available options:

```env
# Node.js
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://vidzeno:vidzeno_password@localhost:5432/vidzeno

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_MONTHLY=price_xxx
STRIPE_PRICE_ID_YEARLY=price_xxx

# Storage
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E demo
./demo.sh
```

## Deployment

### Docker Compose (Production)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
# Create namespace and secrets
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic vidzeno-secrets \
  --namespace=vidzeno \
  --from-literal=database-password='secure-password' \
  --from-literal=jwt-secret='jwt-secret' \
  --from-literal=stripe-secret-key='sk_live_xxx' \
  --from-literal=stripe-webhook-secret='whsec_xxx'

# Apply manifests
kubectl apply -f k8s/

# Run migrations
kubectl exec -n vidzeno deploy/backend -- npm run migrate
```

### Heroku

```bash
# Install Heroku CLI
heroku login
heroku create vidzeno-app

# Add PostgreSQL
heroku addons:create heroku-postgresql:mini

# Add Redis
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set JWT_SECRET=xxx
heroku config:set STRIPE_SECRET_KEY=sk_live_xxx

# Deploy
git push heroku main
```

### AWS ECS

1. Build and push Docker images to ECR
2. Create ECS cluster and task definitions
3. Set up RDS PostgreSQL and ElastiCache Redis
4. Configure Application Load Balancer
5. Deploy with Terraform or CloudFormation

## Stripe Setup

1. Create account at [Stripe Dashboard](https://dashboard.stripe.com)
2. Get API keys from Developers > API keys
3. Create products and prices:
   ```bash
   # Use Stripe CLI or Dashboard
   stripe products create --name="vidzeno Premium Monthly"
   stripe prices create --product=prod_xxx --unit-amount=999 --currency=usd --recurring=interval=month
   stripe prices create --product=prod_xxx --unit-amount=7999 --currency=usd --recurring=interval=year
   ```
4. Set up webhook endpoint: `/api/webhooks/stripe`
5. Get webhook secret from Developers > Webhooks

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│   (React)   │     │  (Express)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (BullMQ)  │
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Worker    │
                    │  (FFmpeg)   │
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │   Storage   │
                    │ (Local/S3)  │
                    └─────────────┘
```

## Security Features

- **JWT in HttpOnly cookies**: Prevents XSS token theft
- **Rate limiting**: 10 requests/minute for conversion endpoints
- **File validation**: MIME type and extension checking
- **Path traversal protection**: Secure filename generation
- **CORS**: Restricted to frontend origin
- **Helmet.js**: Security headers

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- Documentation: `/help` route in the application
- Email: support@vidzeno.com
- Issues: GitHub Issues

---

Built with ❤️ by the vidzeno Team
