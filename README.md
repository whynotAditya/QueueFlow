# QueueFlow

**A high-throughput, distributed task scheduling and email dispatch engine built with Node.js, TypeScript, BullMQ, Redis, PostgreSQL, and Elasticsearch.**

Designed to solve the challenges of high-volume asynchronous job scheduling: persistent delayed execution without cron polling, atomic per-sender rate limiting, crash-resilient workers, and automated dead-letter quarantining (DLQ) for poisonous payloads.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │          HTTP Ingestion Layer           │
                      │  Express 4 + TypeScript + Zod Validate  │
                      └───────────────────┬─────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                     ┌────────────────────────┐
     │   PostgreSQL (Prisma)  │                     │   Redis 7 (BullMQ)     │
     │  Source-of-Truth State │                     │  Append-Only File AOF  │
     │  (SCHEDULED/SENT/DLQ)  │                     │  Sorted Set (ZSET)     │
     └────────────────────────┘                     └────────────┬───────────┘
                                                                 │
                                                    Atomic Score Evaluation
                                                    (Score = Epoch Millis)
                                                                 │
                                                                 ▼
                                                    ┌────────────────────────┐
                                                    │   Worker Pool (x5)     │
                                                    │  Provider Throttle 2s  │
                                                    └────────────┬───────────┘
                                                                 │
                                       ┌─────────────────────────┴─────────────────────────┐
                                       │                                                   │
                            [Atomic Rate Check OK]                               [Limit Exceeded]
                                       │                                                   │
                                       ▼                                                   ▼
                         ┌──────────────────────────┐                        ┌──────────────────────────┐
                         │   SMTP Delivery Worker   │                        │   BullMQ Auto-Delay      │
                         │   (Nodemailer / Ethereal)│                        │   Re-queue to Next Hour  │
                         └─────────────┬────────────┘                        │   + Real-Time Slack Alert│
                                       │                                     └──────────────────────────┘
                  ┌────────────────────┴────────────────────┐
                  │                                         │
            [Success 200]                        [Delivery Failed 3x]
                  │                                         │
                  ▼                                         ▼
     ┌────────────────────────┐               ┌───────────────────────────┐
     │ Status: SENT           │               │ Status: FAILED            │
     │ Preview URL Generated  │               │ Quarantined to email-dlq  │
     │ Synced to ElasticSearch│               │ Visual Inspection/Replay  │
     └────────────────────────┘               └───────────────────────────┘
```

---

## Core Engineering Decisions

### 1. Persistent Delayed Scheduling Without Cron
* **The Problem:** Traditional cron schedulers (`node-cron`, `crontab`) run periodically (e.g., every 60s), query the database for pending jobs, and spawn execution threads. Under high volume, this introduces **thundering herd problems**, database lock contention, and coarse timing resolution.
* **The QueueFlow Solution:** QueueFlow delegates delay management to **Redis Sorted Sets (`ZSET`)**. When a job is scheduled for a future timestamp, its BullMQ delay is mapped to a Redis score representing the target epoch milliseconds (`ZADD delayed <timestamp> <jobId>`). Redis evaluates due jobs natively using internal event loops with sub-millisecond precision, completely eliminating CPU polling loops.

### 2. Dead Letter Queue (DLQ) & Poison Pill Isolation
* **Failure Model:** Transient network glitches vs. permanent payload failures (e.g., malformed recipient headers, revoked SMTP credentials, rejected domain MX records).
* **Retry Policy:** The primary queue (`email-scheduler-queue`) retries failed dispatches up to 3 times using **exponential backoff** (5s, 10s, 20s).
* **Quarantine:** If all 3 attempts are exhausted, the job is identified as a poisonous payload. Rather than silently dropping the message or blocking worker threads, the worker:
  1. Transitions the PostgreSQL record state to `FAILED` with the exact stack trace in `failedReason`.
  2. Updates the document status in Elasticsearch.
  3. Moves the payload to a dedicated **Dead Letter Queue (`email-dlq`)** containing full execution context (original job ID, failure timestamp, attempt count, and provider error).
* **Replay Capability:** Engineers can inspect quarantined jobs via the Bull Board UI or trigger a manual replay via `POST /api/emails/dlq/:jobId/retry`, which atomically re-enqueues the job into the active pipeline.

### 3. Atomic Per-Sender Rate Limiting (Zero-Drop Guarantee)
* **The Problem:** Sending providers enforce strict hourly quotas per sending account (e.g., 200 emails/hour). Breaching quotas leads to ISP blacklisting and account suspension.
* **The Implementation:** Rate limits are tracked using atomic Redis counters keyed by `rate:sender:{senderId}:{YYYY-MM-DD-HH}` with a sliding expiration.
* **Zero-Drop Policy:** When a sender exceeds their hourly threshold:
  - Jobs are **never dropped or rejected** with a 429 to the client.
  - The worker calculates the milliseconds remaining until the top of the next hour.
  - The job is re-delayed into BullMQ for the exact start of the next hour window (`status: DELAYED_RATE_LIMIT`).
  - An asynchronous Slack OAuth webhook notifies the workspace admin in real-time.

### 4. Idempotency & Crash Resilience
* **Crash Recovery:** BullMQ maintains job state inside Redis with Append-Only File (`appendonly yes`) persistence. If the Node.js process crashes, worker locks expire and the in-flight jobs are safely re-acquired by surviving workers.
* **Strict Idempotency:** The BullMQ `jobId` is explicitly set to the PostgreSQL `emailJob.id` (UUID). Under network retries, client re-submissions, or webhook redeliveries, Redis ignores duplicate `jobId` insertions, preventing duplicate emails.

### 5. Full-Text Search via Elasticsearch
* Search queries on large relational tables with `LIKE '%term%'` cause catastrophic table scans.
* All email dispatches are indexed into Elasticsearch (`queueflow_emails`) with multi-match queries and field boosting (`recipient^3`, `subject^2`, `body`).
* Provides sub-15ms fuzzy search across millions of historical outreach records.

---

## Architectural Trade-Offs

| Decision | Chosen Approach | Alternative Considered | Trade-Off Rationale |
| :--- | :--- | :--- | :--- |
| **Queue Broker** | **BullMQ + Redis** | Apache Kafka | Kafka is optimized for high-throughput streaming partitions, but lacks native per-message arbitrary delayed scheduling without external workflow engines (Temporal/Cadence) or custom delay-partition topic hacks. Redis ZSET provides native $O(\log N)$ delay timers out of the box. |
| **Queue Broker** | **BullMQ + Redis** | RabbitMQ | RabbitMQ's delayed exchange plugin (`rabbitmq-delayed-message-exchange`) stores delays in an internal Mnesia database on disk, causing severe CPU and RAM degradation when handling tens of thousands of unique delay timers. |
| **Rate Limit Storage** | **Redis `INCR`** | PostgreSQL `COUNT(*)` | Querying `SELECT COUNT(*) WHERE sent_at > NOW() - INTERVAL '1 hour'` under concurrent worker threads creates severe database read contention. Redis atomic counters provide $O(1)$ operations in memory. |
| **State Machine** | **Dual Store (PG + Redis)** | Redis-Only | Redis provides ephemeral queue velocity and locks, while PostgreSQL ensures relational ACID durability, relational indexing for sender accounts, and long-term historical auditability. |

---

## Tech Stack

* **Runtime:** Node.js (v20+) with strict TypeScript
* **Task Scheduling:** BullMQ 5.x + Redis 7 (AOF enabled)
* **Primary Relational DB:** PostgreSQL 15 via Prisma ORM
* **Search Engine:** Elasticsearch 8.x (Fuzzy Multi-Match)
* **Observability:** Bull Board (Live Dual-Queue UI for `email-scheduler-queue` & `email-dlq`)
* **Alerting:** Slack Web API (OAuth 2.0 Webhooks)
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher)
* [Docker Desktop](https://www.docker.com/) (for PostgreSQL, Redis, Elasticsearch)

### 1. Clone & Start Infrastructure
```bash
git clone https://github.com/whynotAditya/QueueFlow.git
cd QueueFlow

# Start PostgreSQL, Redis (AOF), and Elasticsearch via Docker Compose
docker compose up -d
```

### 2. Backend Setup
```bash
cd server
npm install

# Run database schema migrations
npx prisma db push

# Start development server
npm run dev
```
The server will boot on `http://localhost:5000`.

### 3. Frontend Setup
```bash
cd ../client
npm install
npm run dev
```
The client dashboard will be available at `http://localhost:3000`.

---

## Environment Configuration

### `server/.env`
```env
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://queueflow_user:queueflow_password@localhost:5432/queueflow_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_URL=rediss://default:<password>@<host>:<port> (for managed Redis / Upstash)

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200

# Worker & Limiter
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

# Client URL
CLIENT_URL=http://localhost:3000

# Slack OAuth (Optional)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:5000/api/slack/oauth/callback
```

---

## API Endpoints

### Scheduling & Email Management
* `POST /api/emails/schedule` — Schedule an outreach batch with custom pacing and start time.
* `GET /api/emails/scheduled` — Retrieve pending and rate-delayed emails.
* `GET /api/emails/sent` — Retrieve dispatched and failed emails.
* `GET /api/emails/search?q=:query` — Elasticsearch fuzzy search across recipients, subjects, and bodies.

### Dead Letter Queue (DLQ)
* `GET /api/emails/dlq` — List all poisonous / failed jobs quarantined in the DLQ.
* `POST /api/emails/dlq/:jobId/retry` — Replay a quarantined job back into the primary scheduling queue.

### Monitoring
* `GET /health` — Service health and timestamp.
* `GET /admin/queues` — Live Bull Board UI monitoring both `email-scheduler-queue` and `email-dlq`.

---

## Automated Verification

A standalone end-to-end integration test is included in the backend:
```bash
cd server
npx tsx src/test-e2e.ts
```
This script exercises:
1. User registration & JWT session creation.
2. Virtual SMTP sender account provisioning (Ethereal Email).
3. Delayed job scheduling with BullMQ timer evaluation.
4. Concurrent worker consumption with provider throttle enforcement.
5. Delivery verification and preview URL generation.
6. Elasticsearch indexing & multi-field fuzzy query execution.

---

## Author

**Aditya Patel**  
Final-Year B.Tech CSE  
GitHub: [@whynotAditya](https://github.com/whynotAditya)
