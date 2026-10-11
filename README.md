# QueueFlow — Distributed Asynchronous Email & Task Scheduler

> **Production-grade distributed task scheduler, rate-limiting engine, and real-time dashboard built for high-throughput email outreach infrastructure (ReachInbox / Outbox Labs assignment).**

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org)
[![BullMQ](https://img.shields.io/badge/Queue-BullMQ%20%2B%20Redis-red.svg)](https://bullmq.io)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20(Prisma)-blue.svg)](https://www.postgresql.org)
[![Elasticsearch](https://img.shields.io/badge/Search-Elasticsearch%208.x-yellow.svg)](https://www.elastic.co)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Tailwind-cyan.svg)](https://react.dev)

---

## 🏛 Architecture Overview

QueueFlow decouples HTTP request ingestion from task execution using an event-driven asynchronous queuing architecture.

```
[ Client / Webhook / API ]
          │
          │ (1) POST /api/emails/schedule
          ▼
┌───────────────────────────┐
│ Express API (Producer)    │ ────(2) Persist state (SCHEDULED) ────► [ PostgreSQL ]
│ TypeScript + Zod Validate │ ────(3) Push Delayed Job (Idempotent) ─► [ Redis (BullMQ) ]
└───────────────────────────┘ ────(4) Sync Document ────────────────► [ Elasticsearch ]
          │
          ▼ (5) Immediate 201 Response (<30ms)

          ══════════════════ BOUNDARY ══════════════════

[ Redis (Append-Only File Persistence) ]
  ├── ZSET: Delayed Jobs (Score = Target Unix Epoch Millis)
  ├── List: Active / Waiting Jobs
  └── Counter: Sliding Hourly Buckets (`rate:sender:{id}:{hour}`)

          │
          │ (6) Dequeue when delay expires
          ▼
┌───────────────────────────┐
│ BullMQ Worker (Consumer)  │ ────(7) Enforce Provider Throttle (2s spacing)
│ Concurrency: Configurable │ ────(8) Atomic Hourly Rate Limit Check
└───────────────────────────┘
          │
          ├── [Limit OK]  ──► (9) Dispatch via Ethereal SMTP ──► Preview URL logged
          │                                                  ──► Status -> SENT
          └── [Limit Hit] ──► (10) BullMQ Re-queue to next window (zero job drop)
                           ──► Real-time Slack OAuth Webhook Alert
```

---

## 🚀 Key Architectural Highlights

### 1. Persistent Scheduling Without Cron
- **Hard Constraint Met:** No OS-level cron (`crontab`) and no Node cron libraries (`node-cron`, `agenda`).
- BullMQ stores delayed jobs natively in Redis **Sorted Sets (`ZSET`)** where the score represents the scheduled Unix timestamp.
- Redis evaluates scheduled timers using single-threaded, sub-millisecond atomic Lua scripts.

### 2. Failure Recovery & Restart Resilience
- **Zero Job Loss:** Redis is configured with `appendonly yes` (AOF), ensuring every queue write is written to disk.
- **State Reconciliation:** PostgreSQL acts as the relational source of truth (`SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, `DELAYED_RATE_LIMIT`).
- If Express or the worker crashes, Redis retains the exact job timers. On reboot, the worker picks up pending jobs without re-starting from Day 1.

### 3. Strict Idempotency
- The BullMQ `jobId` is explicitly set to the PostgreSQL `emailJob.id` (UUID).
- Even under network retries or duplicate webhook hits, Redis atomically ignores duplicate job submissions.

### 4. Concurrency & Provider Throttling
- Configurable worker concurrency (`WORKER_CONCURRENCY=5`).
- Configurable spacing delay between individual sends (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`) to mimic SMTP provider throttling and protect sender reputation.

### 5. Atomic Hourly Rate Limiting (Per-Sender)
- **Redis-Backed Counters:** Rate limiting uses atomic Redis keys formatted as `rate:sender:{senderId}:{YYYY-MM-DD-HH}`.
- When `currentCount > MAX_EMAILS_PER_HOUR_PER_SENDER`, **jobs are NEVER dropped**.
- The worker calculates the milliseconds remaining in the current hour window, updates status to `DELAYED_RATE_LIMIT`, and reschedules the job in BullMQ to execute at the start of the next hour.

### 6. Real-Time Slack OAuth Alerts
- Complete Slack OAuth 2.0 flow (`/api/slack/oauth-url` -> token exchange -> stored in PostgreSQL per user).
- When a sender reaches their hourly rate limit, a live message is dispatched to the user's Slack channel with the sender email, limit count, and resumption time.
- If Slack is not connected, the rate-limiter continues seamlessly without crashing.

### 7. Full-Text Search via Elasticsearch
- Scheduled and sent emails are indexed in Elasticsearch (`queueflow_emails`).
- Search bar queries recipients, subjects, and email bodies using fuzzy multi-match with field boosts (`recipient^3`, `subject^2`, `body`).

### 8. Live BullMQ Queue Monitor
- Real-time Bull-Board dashboard mounted at `http://localhost:5000/admin/queues` showing Active, Waiting, Delayed, Failed, and Completed jobs.

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express, TypeScript, BullMQ, ioredis, Prisma ORM, PostgreSQL, Elasticsearch, Nodemailer (Ethereal Email), `@slack/web-api`.
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Lucide Icons, Axios, `@react-oauth/google`.
- **Infra:** Docker Compose (PostgreSQL 15, Redis 7 with AOF, Elasticsearch 8.11).

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)

### 1. Clone & Start Infrastructure
```bash
git clone https://github.com/whynotAditya/QueueFlow.git
cd QueueFlow

# Start Postgres, Redis (AOF), and Elasticsearch
docker compose up -d
```

### 2. Backend Setup
```bash
cd server
npm install

# Run database migration
npx prisma db push

# Start backend dev server (port 5000)
npm run dev
```

### 3. Frontend Setup
```bash
cd ../client
npm install

# Start Vite dev server (port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## ⚙️ Environment Variables

### `server/.env`
```env
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://queueflow_user:queueflow_password@localhost:5432/queueflow_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200

# Worker & Limiter
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

# Client URL
CLIENT_URL=http://localhost:3000

# Slack OAuth (Optional for local testing)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:5000/api/slack/oauth/callback
```

---

## 🧪 Verifying E2E Pipeline in Terminal

Run our built-in end-to-end integration test:
```bash
cd server
npx tsx src/test-e2e.ts
```
This script validates:
1. User generation & authentication
2. Ethereal virtual SMTP credentials creation
3. Pacing 2 emails with BullMQ delayed timers
4. Queue verification
5. Worker execution & preview URL retrieval
6. Elasticsearch indexing & multi-field query

---

## 📊 Live Dashboards

- **Web Dashboard:** `http://localhost:3000`
- **BullMQ Queue Monitor:** `http://localhost:5000/admin/queues`
- **Prisma Studio (DB GUI):** Run `npx prisma studio` in `server/` -> `http://localhost:5555`

---

## 📝 Trade-offs & Engineering Decisions

1. **Redis Counters vs. DB Aggregations for Rate Limiting:**
   - Querying `SELECT COUNT(*) WHERE sent_at > NOW() - INTERVAL '1 hour'` on PostgreSQL creates expensive table scans under heavy worker concurrency.
   - Redis `INCR` provides atomic $O(1)$ operations with zero disk overhead.
2. **Delayed Queues vs. Cron:**
   - Cron jobs create bursty stampedes every minute. BullMQ delayed jobs spread jobs evenly across time, drastically reducing CPU spikes.
3. **Elasticsearch Refresh Strategy:**
   - Used explicit index refresh on single writes for instantaneous UI test responsiveness. In 100k+ writes/sec environments, an asynchronous bulk queue buffer with a 1-second refresh interval is preferred.

---

## 👨‍💻 Author

**Aditya Patel**  
Final-Year B.Tech CSE | High-Performance Backend Architecture
