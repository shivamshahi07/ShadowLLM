# Product Requirements Document (PRD)

## Project: ShadowLLM — Production AI Shadow-Testing & Live Drift Engine
**Repository Target:** `shadow-llm-proxy`  
**Classification:** Distributed Systems, AI Reliability & Reverse Proxy Infrastructure  
**Estimated Architecture Level:** Senior / Staff Backend & AI Systems Engineer  
**Cost Model:** $0.00 / month (100% Free-Tier Maintainable)

---

## 1. Executive Summary & The 10-Second Pitch

### 1.1 The 10-Second Pitch
> *"It’s an intelligent, drop-in reverse proxy that sits in front of your live AI application, transparently clones production traffic to test experimental prompts and cheaper models in the background, safely virtualizes side-effect tool calls so you never double-charge customers or corrupt your database, and alerts you in real time if the new model hallucinates, drifts semantically, or breaches latency budgets—with zero impact on real users."*

### 1.2 The Industry Problem
Every AI startup wants to:
1. **Migrate to cheaper, faster models** (e.g. replacing Claude 3.5 Sonnet / GPT-4o with Llama 3.3 70B or Gemini 2.0 Flash to cut bills by 80%).
2. **Optimize prompts and system instructions** to reduce latency and token bloat.

**Why they can't do it safely today:**
- **Static benchmarks (MMLU, HumanEval) are useless** for evaluating custom company data, real customer nuance, and multi-step tool calls.
- **You cannot safely shadow-test agents in production:** If an agent executes actions (charges a card, updates a database row, sends a customer email), blindly shadowing live traffic will execute those real-world side effects twice.
- **Latency penalties:** Adding evaluation directly into the request-response lifecycle slows down end users.
- **Streaming complexity:** Modern AI apps stream tokens over Server-Sent Events (SSE). Splitting and evaluating live streaming connections without buffering stalls is technically hard.

### 1.3 The Solution: ShadowLLM
**ShadowLLM** is an OpenAI-compatible reverse proxy with:
1. **Zero-Latency Impact Bifurcation:** Intercepts incoming `POST /v1/chat/completions`, forwards the primary request to production, and streams tokens back to the user with under 2ms proxy overhead.
2. **Asynchronous Shadow Forking:** Clones the prompt and payload into a background Redis Stream for parallel shadow evaluation.
3. **Side-Effect Virtualization (Dry-Run Sandboxing):** If the shadow model attempts to call state-mutating tools (e.g., `execute_payout`, `update_order`), the engine intercepts the tool call, matches it against the primary model's real result or a sandboxed mock, and logs the intent without touching production APIs.
4. **Real-Time Semantic Drift & Eval Pipeline:** Runs an asynchronous judge evaluating:
   - **Semantic Similarity:** Cosine similarity of response embeddings.
   - **Tool Parameter Compliance:** Did the shadow model pass the exact same parameters?
   - **Hallucination & Factuality Score:** Automated LLM-as-a-judge check.
   - **Latency & Cost Delta:** Exact measurement of dollar savings vs. p95 latency changes.
5. **Canary Dashboard & Alerting:** A real-time Next.js 15 UI with live radar charts, drift alerts, and one-click model promotion.

---

## 2. Target Persona & User Stories


- **User Story 1 (AI Engineer / Cost Lead):** As an engineer paying $5,000/mo on OpenAI, I can route my app's traffic through `https://proxy.mysite.com/v1` and configure a 20% shadow split to test Groq / Gemini Flash without changing a single line of application logic.
- **User Story 2 (Product Lead):** As a product owner, I can view the live Canary Dashboard to verify that a new, optimized prompt achieves 98%+ semantic agreement with the baseline before rolling it out to 100% of users.
- **User Story 3 (Security & Compliance Officer):** As an auditor, I can confirm that the shadow worker safely intercepts mutating tool calls so no test prompt ever writes fake records to our production PostgreSQL database or charges external payment gateways.
- **User Story 4 (SRE / Platform Engineer):** As an SRE, if the shadow model experiences 5xx rate limits or high latency, the background worker quietly drops or throttles the shadow queue without affecting the primary user's connection.

---

## 3. System Architecture & Request Lifecycle

```
+---------------------------------------------------------------------------------------------------+
|                                  Client Application / SDK                                         |
|                   (Points OPENAI_BASE_URL to ShadowLLM Reverse Proxy)                             |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  | 1. POST /v1/chat/completions (Stream or JSON)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                               ShadowLLM Ingestion Proxy Gateway                                   |
|                (TypeScript / Fastify or Go: Ultra-low sub-2ms overhead routing)                   |
+---------------------------------------------------------------------------------------------------+
         |                                                                      |
         | 2. Direct Primary Forward                                            | 3. Async Shadow Fork
         v                                                                      v
+----------------------------------+                   +--------------------------------------------+
|     Primary LLM (Production)     |                   |         Upstash Redis Streams Buffer       |
|    e.g. OpenAI / Claude 3.5      |                   | - Traffic Sampling (e.g. 10%-50%)          |
|                                  |                   | - Decoupled Asynchronous Queue             |
+----------------------------------+                   +--------------------------------------------+
         |                                                                      |
         | 4. SSE Stream Pass-Through                                           | 5. Worker Pull
         v                                                                      v
+----------------------------------+                   +--------------------------------------------+
|           End User               |                   |         Shadow Evaluation Worker           |
| (Receives instant live response) |                   |                                            |
+----------------------------------+                   |  +--------------------------------------+  |
                                                       |  |       Experimental Shadow Model      |  |
                                                       |  |  e.g. Groq Llama 3.3 / Gemini Flash   |  |
                                                       |  +--------------------------------------+  |
                                                       |                    |                       |
                                                       |  +--------------------------------------+  |
                                                       |  |    Side-Effect Virtualization Engine |  |
                                                       |  | - Intercepts mutating tool calls     |  |
                                                       |  | - Mocks responses / diffs parameters |  |
                                                       |  +--------------------------------------+  |
                                                       |                    |                       |
                                                       |  +--------------------------------------+  |
                                                       |  |       Semantic Drift Evaluator       |  |
                                                       |  | - Embedding Cosine Distance          |  |
                                                       |  | - Tool Precision & Recall Delta      |  |
                                                       |  | - Cost & P95 Latency Attribution     |  |
                                                       |  +--------------------------------------+  |
                                                       +--------------------------------------------+
                                                                            |
                                                                            v
                                                       +--------------------------------------------+
                                                       |          Neon Serverless Postgres          |
                                                       |   (Stores execution pairs, drift logs,     |
                                                       |    cost deltas, and telemetry stats)       |
                                                       +--------------------------------------------+
                                                                            |
                                                                            v
                                                       +--------------------------------------------+
                                                       |           Next.js 15 Web Console           |
                                                       | - Live Canary Radar & Drift Graphs         |
                                                       | - Side-by-Side Response Diff Inspector     |
                                                       | - One-Click Model Promotion Toggle         |
                                                       +--------------------------------------------+
```

---

## 4. Deep Technical Challenges & Solutions

### 4.1 Zero-Latency Asynchronous Request Bifurcation
- The gateway acts as an HTTP reverse proxy using streaming pipelines (`stream.PassThrough` or Go `io.TeeReader`).
- When an application sends a chat completion request, the gateway pipes the incoming stream directly to the Primary Provider.
- In parallel, a non-blocking clone of the request body is pushed to an in-memory buffer or Redis Stream.
- The user's streaming tokens are returned with **zero buffering delay** (p95 latency addition < 2ms).

### 4.2 Side-Effect Virtualization (Solving the Double-Mutation Problem)
When testing agents that invoke tools:
- Tools are classified into two categories:
  ```typescript
  type ToolType = "READ_ONLY" | "SIDE_EFFECT";
  // READ_ONLY: search_docs, get_user_balance, read_file
  // SIDE_EFFECT: charge_card, send_email, update_db, delete_record
  ```
- **Read-Only Tools:** The shadow worker executes them against live read replicas or cached read responses safely.
- **Side-Effect Tools:** The shadow worker **never** executes the mutation. Instead, it:
  1. Captures the tool name and arguments proposed by the shadow model.
  2. Compares the parameters against the tool call made by the primary model (computing an argument diff).
  3. Feeds back the primary model's observed tool response into the shadow model's context to let the shadow agent finish its reasoning loop without executing duplicate real-world actions.

### 4.3 Real-Time Semantic Drift & Scoring Engine
For every completed shadow pair, the evaluation worker calculates:
1. **Semantic Similarity Score ($S_{embed}$):** Generates embeddings for primary output $O_p$ and shadow output $O_s$ using free embedding models (e.g. Gemini `text-embedding-004`). Computes cosine similarity:
   $$\text{Cosine}(A, B) = \frac{A \cdot B}{\|A\| \|B\|}$$
   - Score $\ge 0.92$: Safe semantic agreement.
   - Score $< 0.85$: Flags a **Semantic Drift Warning**.
2. **Tool Intent Match ($T_{match}$):** Boolean check whether both models selected the same tool with equivalent arguments.
3. **Cost & Latency Delta:**
   $$\Delta \text{Cost} = \text{Cost}_{primary} - \text{Cost}_{shadow}$$
   $$\Delta \text{Latency} = \text{Latency}_{primary} - \text{Latency}_{shadow}$$

---

## 5. Technology Stack (100% Free-Tier Architecture)

| Layer | Technology | Free Tier Allocation & Rationale |
| :--- | :--- | :--- |
| **Proxy Gateway** | **TypeScript, Node.js 20+, Fastify** | High-throughput async I/O. Fastify handles native HTTP proxying with ultra-low CPU/memory usage. |
| **Worker Engine** | **TypeScript / Node.js** (or Go) | Background worker pulling from Redis Streams to run shadow calls and evaluations. |
| **Queue & Streaming Buffer** | **Upstash Redis (Redis Streams)** | Free tier (10,000 commands/day). Decouples user-facing proxy from background shadow runs. |
| **Database & Analytics** | **Neon Serverless PostgreSQL** | Free tier (0.5GB). Stores request pairs, embeddings, drift metrics, and tool execution logs. |
| **Primary & Shadow LLMs** | **OpenAI API** (or mock) + **Google Gemini Flash** + **Groq Llama 3.3 70B** | Google AI Studio (Free 15 RPM, 1M context); Groq (Free blazing fast inference, 30 RPM). |
| **Frontend Console** | **Next.js 15, Tailwind CSS, shadcn/ui** | Deployed on **Vercel Hobby** ($0/month). Real-time telemetry, model diff viewer. |
| **Proxy Deployment** | **Render Free Web Service** | Free 512MB container with free SSL domain. Kept warm 24/7 with keep-alive cron. |
| **Keep-Alive Worker** | **cron-job.org / UptimeRobot** | Pings `/health` every 10 minutes to eliminate cold starts. |

---

## 6. API Specification

### 6.1 Drop-in Reverse Proxy Endpoints (OpenAI-Compatible)
- `POST /v1/chat/completions` — Drop-in replacement for OpenAI API. Supports both JSON responses and `stream: true` (Server-Sent Events).
- `GET /v1/models` — Returns combined list of primary and shadow models available.

### 6.2 Canary Management & Configuration
- `POST /api/v1/canary/config` — Update shadow routing rules dynamically without restarting the server:
  ```json
  {
    "enabled": true,
    "sample_rate": 0.25,
    "primary_target": {
      "provider": "openai",
      "model": "gpt-4o",
      "base_url": "https://api.openai.com/v1"
    },
    "shadow_target": {
      "provider": "groq",
      "model": "llama-3.3-70b-versatile",
      "base_url": "https://api.groq.com/openai/v1",
      "system_prompt_override": null
    },
    "drift_threshold": 0.85
  }
  ```
- `GET /api/v1/canary/stats` — Real-time aggregate metrics: total requests, shadow sample count, average semantic similarity, cost savings ($), and p95 latency delta.
- `GET /api/v1/canary/traces` — List recent shadow pairs with side-by-side output diffs, tool discrepancies, and drift flags.
- `POST /api/v1/canary/promote` — One-click action that promotes the shadow model to become the new primary target.

---

## 7. Database Schema (PostgreSQL DDL)

```sql
-- Canary Configuration Settings
CREATE TABLE canary_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_active BOOLEAN DEFAULT TRUE,
    sample_rate NUMERIC(3, 2) DEFAULT 0.20, -- 20% traffic split
    primary_provider VARCHAR(50) NOT NULL,
    primary_model VARCHAR(100) NOT NULL,
    shadow_provider VARCHAR(50) NOT NULL,
    shadow_model VARCHAR(100) NOT NULL,
    system_prompt_override TEXT,
    drift_alert_threshold NUMERIC(3, 2) DEFAULT 0.85,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Paired Ingestion & Shadow Execution Records
CREATE TABLE execution_traces (
    id VARCHAR(64) PRIMARY KEY, -- Trace ID (e.g. trc_01JAZ8K7M)
    endpoint VARCHAR(100) NOT NULL,
    client_ip_hash VARCHAR(64),
    prompt_tokens INT DEFAULT 0,
    
    -- Primary Model Execution
    primary_model VARCHAR(100) NOT NULL,
    primary_response_text TEXT,
    primary_tool_calls JSONB,
    primary_latency_ms INT,
    primary_cost_usd NUMERIC(10, 6),
    
    -- Shadow Model Execution
    shadow_model VARCHAR(100),
    shadow_response_text TEXT,
    shadow_tool_calls JSONB,
    shadow_latency_ms INT,
    shadow_cost_usd NUMERIC(10, 6),
    
    -- Evaluation & Drift Metrics
    semantic_similarity NUMERIC(4, 3), -- 0.000 to 1.000
    tool_intent_matched BOOLEAN,
    has_drift_warning BOOLEAN DEFAULT FALSE,
    drift_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_traces_created_at ON execution_traces(created_at DESC);
CREATE INDEX idx_traces_drift ON execution_traces(has_drift_warning) WHERE has_drift_warning = TRUE;

-- Virtualized Side-Effect Tool Logs
CREATE TABLE virtualized_tool_mutations (
    id BIGSERIAL PRIMARY KEY,
    trace_id VARCHAR(64) REFERENCES execution_traces(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    primary_args JSONB,
    shadow_args JSONB,
    args_match BOOLEAN DEFAULT TRUE,
    virtualization_action VARCHAR(50) NOT NULL, -- 'mocked', 'replayed_primary', 'blocked'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 8. Zero-Dollar Deployment & Operations Runbook

### 8.1 Backend Deployment (Render Free Web Service)
1. Push repository `shadow-llm-proxy` to GitHub.
2. Connect to Render as a **Web Service**.
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm run start`
5. **Environment Variables Configured in Render:**
   - `PORT`: `8080`
   - `DATABASE_URL`: Connection string from Neon (pooled)
   - `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Upstash credentials
   - `PRIMARY_API_KEY`: Key for your baseline provider (e.g. OpenAI or Gemini)
   - `SHADOW_API_KEY`: Key for your experimental provider (e.g. Groq or Gemini Flash)
   - `PROXY_AUTH_TOKEN`: Secret Bearer token for client apps connecting to the proxy

### 8.2 Keep-Alive Workaround (Preventing Sleep)
Render free containers spin down after 15 minutes of inactivity. To ensure the proxy is always warm and responds with sub-50ms latency:
- Set up a free monitor on **cron-job.org** or **UptimeRobot**.
- **Target URL:** `https://<your-render-proxy>.onrender.com/health`
- **Cadence:** Every 10 minutes (`GET` request).
- **Result:** Keeps the reverse proxy warm 24/7 with zero hosting fees.

### 8.3 Frontend Deployment (Vercel Free Tier)
1. Set root directory to `/dashboard` (Next.js 15 App Router).
2. Connect `NEXT_PUBLIC_PROXY_API_URL` to your Render service URL.
3. Deploys on Vercel Hobby ($0/month) with global edge CDN.

---

## 9. Development Phases & Implementation Milestones

### Phase 1: High-Throughput Reverse Proxy & Streaming Bifurcation (Week 1)
- [ ] Initialize Fastify TypeScript server with `@fastify/http-proxy` or custom streaming handlers.
- [ ] Implement `POST /v1/chat/completions` proxying to Primary Provider.
- [ ] Support both non-streaming JSON and streaming Server-Sent Events (SSE) with `Transfer-Encoding: chunked`.
- [ ] Implement non-blocking request cloning pushing to Upstash Redis Streams.

### Phase 2: Asynchronous Shadow Worker & Virtualized Tool Sandboxing (Week 2)
- [ ] Build background worker consumer loop listening to Redis Streams.
- [ ] Implement shadow invocation calling experimental provider (Groq / Gemini Flash).
- [ ] Implement Side-Effect Virtualization: intercept mutating tool calls, diff arguments against primary, and inject safe mock outputs.
- [ ] Record trace records in Neon PostgreSQL.

### Phase 3: Real-Time Semantic Drift & Scoring Engine (Week 3)
- [ ] Integrate embedding generation (`text-embedding-004`) for primary and shadow outputs.
- [ ] Calculate cosine similarity distance and flag drift when score < 0.85.
- [ ] Compute real-time token count, cost savings ($), and latency delta.
- [ ] Build dynamic configuration endpoint `POST /api/v1/canary/config` to adjust sampling rate on the fly.

### Phase 4: Next.js 15 Canary Console & Operations Dashboard (Week 4)
- [ ] Build interactive web dashboard:
  - Live cost savings odometer ($ saved by shadow model).
  - P95 Latency comparison bar chart (Primary vs. Shadow).
  - Side-by-side diff inspector showing prompt, primary response, and shadow response.
  - "Promote Model to Production" one-click action.
- [ ] Write rich `README.md` with architectural diagrams, load-testing benchmark (e.g. 1,000 RPS with <2ms proxy overhead), and case study.
- [ ] Deploy to Render + Vercel and configure keep-alive cron.

---

## 10. Production Deployment Verification

Key Architecture Summary:
1. **The Hook:**
   > *"I built ShadowLLM because in production AI systems, you can't just switch to a cheaper model like Llama 3 or Gemini Flash and hope for the best. Offline benchmarks don't reflect live customer prompts, but shadowing live traffic usually causes disastrous double-mutations—like charging cards twice or sending duplicate emails."*
2. **The Systems Engineering:**
   > *"I engineered a drop-in reverse proxy in TypeScript/Fastify with under 2ms overhead that bifurcates live traffic asynchronously via Redis Streams. To solve the double-mutation problem, I built a Side-Effect Virtualization layer that classifies tools, intercepts mutating actions, diffs the parameters, and mocks the response so the shadow model completes its reasoning loop without touching production databases."*
3. **The Measurable Impact:**
   > *"In benchmarks, this pipeline allowed teams to validate an 80% reduction in LLM inference costs and a 3x drop in p95 latency while mathematically verifying 94%+ semantic agreement across thousands of real-world requests before flipping the production switch."*
