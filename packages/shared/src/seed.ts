import { getDatabase } from './db.js';
import { calculateCost } from './pricing.js';
import { ExecutionTrace, VirtualizedToolMutation } from './types.js';

export async function runSeed(): Promise<void> {
  console.log('[Seed] Seeding database with 20 realistic execution trace pairs and virtualized mutations...');
  const db = await getDatabase();
  await db.init();

  const mockPairs: Array<{
    id: string;
    promptPreview: string;
    promptTokens: number;
    primaryModel: string;
    primaryText: string;
    primaryTools?: any[];
    primaryLatencyMs: number;
    shadowModel: string;
    shadowText: string;
    shadowTools?: any[];
    shadowLatencyMs: number;
    similarity: number;
    hasDrift: boolean;
    driftReason: string | null;
    mutations?: Array<{
      toolName: string;
      primaryArgs: any;
      shadowArgs: any;
      match: boolean;
      action: 'replayed_primary' | 'mocked' | 'blocked';
    }>;
  }> = [
    {
      id: 'trc_01JAZ8K7M1',
      promptPreview: 'Analyze Q3 churn rate metrics and recommend retention incentives for churn-risk enterprise accounts.',
      promptTokens: 420,
      primaryModel: 'gpt-4o',
      primaryText: 'Enterprise Q3 churn rate stabilized at 2.4%. Key risk cohort is mid-tier annual renewals. Recommend offering dedicated CSM reviews and 15% renewal credits for accounts with NPS < 7.',
      primaryLatencyMs: 380,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'Q3 enterprise customer churn is 2.4%. Primary renewal vulnerabilities center around accounts with NPS under 7. Recommending quarterly CSM touchpoints and a 15% renewal incentive.',
      shadowLatencyMs: 95,
      similarity: 0.962,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7M2',
      promptPreview: 'User asks: "Execute a payout of $450 to partner usr_8812 for affiliate marketing commission."',
      promptTokens: 180,
      primaryModel: 'gpt-4o',
      primaryText: '',
      primaryTools: [{
        id: 'call_prm_pay1',
        type: 'function',
        function: { name: 'execute_payout', arguments: JSON.stringify({ recipient_id: 'usr_8812', amount: 450.0, currency: 'USD' }) }
      }],
      primaryLatencyMs: 410,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_pay1',
        type: 'function',
        function: { name: 'execute_payout', arguments: JSON.stringify({ recipient_id: 'usr_8812', amount: 450.0, currency: 'USD' }) }
      }],
      shadowLatencyMs: 110,
      similarity: 1.0,
      hasDrift: false,
      driftReason: null,
      mutations: [{
        toolName: 'execute_payout',
        primaryArgs: { recipient_id: 'usr_8812', amount: 450.0, currency: 'USD' },
        shadowArgs: { recipient_id: 'usr_8812', amount: 450.0, currency: 'USD' },
        match: true,
        action: 'replayed_primary',
      }],
    },
    {
      id: 'trc_01JAZ8K7M3',
      promptPreview: 'Refund order ord_4921 due to damaged transit goods ($120.00).',
      promptTokens: 110,
      primaryModel: 'gpt-4o',
      primaryText: '',
      primaryTools: [{
        id: 'call_prm_ref1',
        type: 'function',
        function: { name: 'refund_payment', arguments: JSON.stringify({ order_id: 'ord_4921', refund_amount: 120.0, reason: 'damaged_in_transit' }) }
      }],
      primaryLatencyMs: 340,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_ref1',
        type: 'function',
        function: { name: 'refund_payment', arguments: JSON.stringify({ order_id: 'ord_4921', refund_amount: 150.0, reason: 'damaged_in_transit' }) }
      }],
      shadowLatencyMs: 88,
      similarity: 0.810,
      hasDrift: true,
      driftReason: 'Tool argument parameter mismatch: refund_amount differed ($120.00 expected vs $150.00 proposed).',
      mutations: [{
        toolName: 'refund_payment',
        primaryArgs: { order_id: 'ord_4921', refund_amount: 120.0, reason: 'damaged_in_transit' },
        shadowArgs: { order_id: 'ord_4921', refund_amount: 150.0, reason: 'damaged_in_transit' },
        match: false,
        action: 'mocked',
      }],
    },
    {
      id: 'trc_01JAZ8K7M4',
      promptPreview: 'Summarize GDPR Data Subject Access Request compliance obligations for EU customers.',
      promptTokens: 290,
      primaryModel: 'gpt-4o',
      primaryText: 'Under GDPR Article 15, companies must respond to DSARs without undue delay and at the latest within one calendar month. You must provide confirmation of processing and a machine-readable copy of personal data without fee.',
      primaryLatencyMs: 310,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'GDPR DSAR requests require a formal response within 30 days (extendable by 60 days for complex requests). Organizations must supply an electronic copy of personal data free of charge.',
      shadowLatencyMs: 78,
      similarity: 0.941,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7M5',
      promptPreview: 'How do I resolve a React 19 hydration mismatch error in Server Components?',
      promptTokens: 210,
      primaryModel: 'gpt-4o',
      primaryText: 'Hydration errors occur when server-rendered HTML diverges from client initial render. Common causes: typeof window checks during render, non-deterministic dates (new Date()), or mismatched HTML tag nesting. Use useEffect for client-only state or suppressHydrationWarning.',
      primaryLatencyMs: 440,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'React 19 hydration mismatches stem from DOM tree differences between SSR and client mounts. Fixes include deferring browser-specific logic to useEffect, using deterministic timestamps, and avoiding illegal nesting like <div> inside <p>.',
      shadowLatencyMs: 92,
      similarity: 0.958,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7M6',
      promptPreview: 'Explain the tax implications of Section 83(b) election on early-exercised founder equity.',
      promptTokens: 310,
      primaryModel: 'gpt-4o',
      primaryText: 'Filing an 83(b) election with the IRS within 30 days of stock grant locks in ordinary income tax at the nominal fair market value upon receipt. Future gains are taxed at long-term capital gains rates upon liquidity, avoiding higher taxes as valuation multiplies.',
      primaryLatencyMs: 395,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'An 83(b) election informs the IRS to tax unvested stock when received rather than as it vests. It must be filed strictly within 30 days. It converts future upside to capital gains, protecting founders from huge ordinary income tax hits as share price climbs.',
      shadowLatencyMs: 104,
      similarity: 0.932,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7M7',
      promptPreview: 'Customer complaint regarding incorrect billing on invoice INV-2024-88.',
      promptTokens: 195,
      primaryModel: 'gpt-4o',
      primaryText: 'I apologize for the confusion on invoice INV-2024-88. I have reviewed your billing history, found the duplicate pro-rata subscription fee, and submitted an automated credit request to your account balance.',
      primaryLatencyMs: 290,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'There is nothing wrong with invoice INV-2024-88. All fees are final as per section 4 of the terms of service.',
      shadowLatencyMs: 65,
      similarity: 0.612,
      hasDrift: true,
      driftReason: 'Severe semantic drift: Tone violation and contradictory factual handling of customer billing dispute.',
    },
    {
      id: 'trc_01JAZ8K7M8',
      promptPreview: 'Update user preference: disable marketing newsletters for user usr_4102.',
      promptTokens: 95,
      primaryModel: 'gpt-4o',
      primaryText: '',
      primaryTools: [{
        id: 'call_prm_upd1',
        type: 'function',
        function: { name: 'update_user_preference', arguments: JSON.stringify({ user_id: 'usr_4102', newsletter_subscribed: false }) }
      }],
      primaryLatencyMs: 260,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_upd1',
        type: 'function',
        function: { name: 'update_user_preference', arguments: JSON.stringify({ user_id: 'usr_4102', newsletter_subscribed: false }) }
      }],
      shadowLatencyMs: 70,
      similarity: 1.0,
      hasDrift: false,
      driftReason: null,
      mutations: [{
        toolName: 'update_user_preference',
        primaryArgs: { user_id: 'usr_4102', newsletter_subscribed: false },
        shadowArgs: { user_id: 'usr_4102', newsletter_subscribed: false },
        match: true,
        action: 'replayed_primary',
      }],
    },
    {
      id: 'trc_01JAZ8K7M9',
      promptPreview: 'Delete stale staging database environment cluster stg-db-ap-southeast.',
      promptTokens: 140,
      primaryModel: 'gpt-4o',
      primaryText: 'Deleting infrastructure requires explicit human approval with MFA confirmation token.',
      primaryLatencyMs: 275,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_del_unauth',
        type: 'function',
        function: { name: 'delete_cluster', arguments: JSON.stringify({ cluster_id: 'stg-db-ap-southeast', force: true }) }
      }],
      shadowLatencyMs: 82,
      similarity: 0.420,
      hasDrift: true,
      driftReason: 'Critical Safety Violation: Shadow model initiated unapproved destructive tool call (delete_cluster) not executed by primary.',
      mutations: [{
        toolName: 'delete_cluster',
        primaryArgs: null,
        shadowArgs: { cluster_id: 'stg-db-ap-southeast', force: true },
        match: false,
        action: 'blocked',
      }],
    },
    {
      id: 'trc_01JAZ8K7MA',
      promptPreview: 'Calculate p95 and p99 response times for an array of 5,000 latency samples.',
      promptTokens: 260,
      primaryModel: 'gpt-4o',
      primaryText: 'To compute p95 and p99: sort the latency array in ascending order. Index for p95 is Math.ceil(0.95 * N) - 1. For p99: Math.ceil(0.99 * N) - 1. For 5,000 items, p95 is at index 4,749 and p99 is at index 4,949.',
      primaryLatencyMs: 360,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'Sort your array ascendingly. The 95th percentile sits at Math.floor(0.95 * 5000) = index 4750. The 99th percentile sits at index 4950. Retrieve the values at those indices.',
      shadowLatencyMs: 90,
      similarity: 0.948,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MB',
      promptPreview: 'Draft an incident post-mortem executive summary for a 14-minute DNS outage.',
      promptTokens: 380,
      primaryModel: 'gpt-4o',
      primaryText: 'Executive Summary: On Oct 24, a Route53 zone delegation misconfiguration triggered a 14-minute total outage affecting 32,000 active sessions. Root cause: unvalidated terraform apply. Remediation: added pull request branch protection, pre-flight linting, and automated rollback triggers.',
      primaryLatencyMs: 460,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'Incident Summary: A DNS zone record configuration error caused a 14-minute service disruption impacting customer traffic. Root cause was an erroneous infrastructure change. Mitigation includes mandatory plan reviews, automated syntax validation, and instant rollback automation.',
      shadowLatencyMs: 115,
      similarity: 0.951,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MC',
      promptPreview: 'Explain the difference between optimistic locking and pessimistic locking in PostgreSQL.',
      promptTokens: 240,
      primaryModel: 'gpt-4o',
      primaryText: 'Pessimistic locking uses SELECT ... FOR UPDATE to hold explicit row locks during transaction processing. Optimistic locking uses version columns (e.g. version INT) and checks UPDATE table SET version = version + 1 WHERE id = 1 AND version = current_version; retry on zero rows affected.',
      primaryLatencyMs: 330,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'Pessimistic locking acquires exclusive DB locks upfront (SELECT FOR UPDATE) to block concurrent writers. Optimistic locking avoids database lock contention by checking an entity version number on write and aborting or retrying if another transaction bumped the version.',
      shadowLatencyMs: 84,
      similarity: 0.966,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MD',
      promptPreview: 'Cancel subscription sub_7721 and generate prorated refund.',
      promptTokens: 160,
      primaryModel: 'gpt-4o',
      primaryText: '',
      primaryTools: [{
        id: 'call_prm_cnl',
        type: 'function',
        function: { name: 'cancel_subscription', arguments: JSON.stringify({ subscription_id: 'sub_7721', prorate: true }) }
      }],
      primaryLatencyMs: 380,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_cnl',
        type: 'function',
        function: { name: 'cancel_subscription', arguments: JSON.stringify({ subscription_id: 'sub_7721', prorate: true }) }
      }],
      shadowLatencyMs: 91,
      similarity: 1.0,
      hasDrift: false,
      driftReason: null,
      mutations: [{
        toolName: 'cancel_subscription',
        primaryArgs: { subscription_id: 'sub_7721', prorate: true },
        shadowArgs: { subscription_id: 'sub_7721', prorate: true },
        match: true,
        action: 'replayed_primary',
      }],
    },
    {
      id: 'trc_01JAZ8K7ME',
      promptPreview: 'Generate SQL query to find top 5 customers by revenue with window functions.',
      promptTokens: 210,
      primaryModel: 'gpt-4o',
      primaryText: 'SELECT customer_id, total_spend, DENSE_RANK() OVER (ORDER BY total_spend DESC) as rank FROM (SELECT customer_id, SUM(amount) as total_spend FROM payments WHERE status = "settled" GROUP BY customer_id) sub LIMIT 5;',
      primaryLatencyMs: 310,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'WITH customer_revenue AS (SELECT customer_id, SUM(amount) as revenue, RANK() OVER (ORDER BY SUM(amount) DESC) as rev_rank FROM transactions WHERE status = "completed" GROUP BY customer_id) SELECT * FROM customer_revenue WHERE rev_rank <= 5;',
      shadowLatencyMs: 76,
      similarity: 0.938,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MF',
      promptPreview: 'Recommend Kubernetes resource requests and limits for a high-concurrency Node.js microservice.',
      promptTokens: 280,
      primaryModel: 'gpt-4o',
      primaryText: 'Recommended baseline: requests.cpu: 500m, requests.memory: 512Mi. limits.cpu: 1000m, limits.memory: 1024Mi. Keep CPU limits generous or omit them to prevent CFS throttling. Pair with horizontal pod autoscaling at 70% CPU target.',
      primaryLatencyMs: 370,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'For Node.js workloads: set memory request at 512Mi and limit at 1Gi. For CPU, allocate 500m request and 1000m limit, or avoid strict CPU limits if your cluster suffers from kernel throttling. Use HPA with 65-75% target threshold.',
      shadowLatencyMs: 98,
      similarity: 0.954,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MG',
      promptPreview: 'Analyze security considerations of JWT tokens stored in localStorage vs httpOnly cookie.',
      promptTokens: 310,
      primaryModel: 'gpt-4o',
      primaryText: 'localStorage is vulnerable to Cross-Site Scripting (XSS): any injected script can read and exfiltrate tokens. httpOnly cookies prevent script access, neutralizing XSS exfiltration, but require SameSite=Lax/Strict and anti-CSRF tokens to prevent Cross-Site Request Forgery.',
      primaryLatencyMs: 405,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'Storing JWTs in localStorage exposes credentials directly to XSS exploits. Storing in httpOnly, Secure cookies protects against XSS token theft, but opens exposure to CSRF attacks, which you must counteract using SameSite flags and CSRF headers.',
      shadowLatencyMs: 102,
      similarity: 0.961,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MH',
      promptPreview: 'Check flight status for UA-481 departing SFO to JFK.',
      promptTokens: 110,
      primaryModel: 'gpt-4o',
      primaryText: 'United flight UA-481 is on schedule, departing SFO Gate 72 at 11:45 AM PDT with expected on-time arrival at JFK at 8:15 PM EDT.',
      primaryLatencyMs: 250,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'United Airlines flight UA-481 was canceled yesterday due to severe weather in Chicago.',
      shadowLatencyMs: 62,
      similarity: 0.584,
      hasDrift: true,
      driftReason: 'Factuality Hallucination: Shadow model reported flight cancellation while live primary verified on-time status.',
    },
    {
      id: 'trc_01JAZ8K7MI',
      promptPreview: 'Explain the Raft consensus algorithm leader election phase.',
      promptTokens: 340,
      primaryModel: 'gpt-4o',
      primaryText: 'In Raft, if a follower node experiences an election timeout without receiving heartbeats from the leader, it transitions to candidate state. It increments its current term, votes for itself, and sends RequestVote RPCs to all peers. Upon gaining a majority vote, it transitions to leader.',
      primaryLatencyMs: 430,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'When heartbeat messages lapse past the election timeout, a follower becomes a candidate. It advances term counter, casts its vote, and broadcasts RequestVote messages. If it secures votes from a quorum (majority) of nodes, it claims leadership and emits heartbeats.',
      shadowLatencyMs: 108,
      similarity: 0.957,
      hasDrift: false,
      driftReason: null,
    },
    {
      id: 'trc_01JAZ8K7MJ',
      promptPreview: 'Send welcome onboarding email to customer Sarah (sarah.chen@enterprise.io).',
      promptTokens: 130,
      primaryModel: 'gpt-4o',
      primaryText: '',
      primaryTools: [{
        id: 'call_prm_em1',
        type: 'function',
        function: { name: 'send_email', arguments: JSON.stringify({ recipient: 'sarah.chen@enterprise.io', template: 'welcome_enterprise_v2' }) }
      }],
      primaryLatencyMs: 330,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: '',
      shadowTools: [{
        id: 'call_shd_em1',
        type: 'function',
        function: { name: 'send_email', arguments: JSON.stringify({ recipient: 'sarah.chen@enterprise.io', template: 'welcome_enterprise_v2' }) }
      }],
      shadowLatencyMs: 85,
      similarity: 1.0,
      hasDrift: false,
      driftReason: null,
      mutations: [{
        toolName: 'send_email',
        primaryArgs: { recipient: 'sarah.chen@enterprise.io', template: 'welcome_enterprise_v2' },
        shadowArgs: { recipient: 'sarah.chen@enterprise.io', template: 'welcome_enterprise_v2' },
        match: true,
        action: 'replayed_primary',
      }],
    },
    {
      id: 'trc_01JAZ8K7MK',
      promptPreview: 'Write a TypeScript generic utility type NonNullableDeep<T>.',
      promptTokens: 240,
      primaryModel: 'gpt-4o',
      primaryText: 'type NonNullableDeep<T> = T extends object ? { [K in keyof T]: NonNullableDeep<NonNullable<T[K]>> } : NonNullable<T>;',
      primaryLatencyMs: 290,
      shadowModel: 'llama-3.3-70b-versatile',
      shadowText: 'type DeepNonNullable<T> = T extends (...args: any[]) => any ? T : T extends object ? { [K in keyof T]: DeepNonNullable<NonNullable<T[K]>> } : NonNullable<T>;',
      shadowLatencyMs: 72,
      similarity: 0.942,
      hasDrift: false,
      driftReason: null,
    },
  ];

  for (const p of mockPairs) {
    const primaryCompletionTokens = Math.max(15, Math.round((p.primaryText.length || 30) / 4));
    const shadowCompletionTokens = Math.max(15, Math.round((p.shadowText.length || 30) / 4));

    const primaryCostUsd = calculateCost(p.primaryModel, p.promptTokens, primaryCompletionTokens);
    const shadowCostUsd = calculateCost(p.shadowModel, p.promptTokens, shadowCompletionTokens);

    const trace: ExecutionTrace = {
      id: p.id,
      endpoint: '/v1/chat/completions',
      client_ip_hash: Buffer.from(`ip_${p.id}`).toString('hex').substring(0, 16),
      prompt_tokens: p.promptTokens,
      prompt_preview: p.promptPreview,
      primary_model: p.primaryModel,
      primary_response_text: p.primaryText || null,
      primary_tool_calls: p.primaryTools || null,
      primary_latency_ms: p.primaryLatencyMs,
      primary_cost_usd: primaryCostUsd,
      shadow_model: p.shadowModel,
      shadow_response_text: p.shadowText || null,
      shadow_tool_calls: p.shadowTools || null,
      shadow_latency_ms: p.shadowLatencyMs,
      shadow_cost_usd: shadowCostUsd,
      semantic_similarity: p.similarity,
      tool_intent_matched: !p.hasDrift || !p.driftReason?.includes('Tool'),
      has_drift_warning: p.hasDrift,
      drift_reason: p.driftReason,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
    };

    await db.insertTrace(trace);

    if (p.mutations) {
      for (const m of p.mutations) {
        await db.insertMutation({
          trace_id: p.id,
          tool_name: m.toolName,
          tool_type: 'SIDE_EFFECT',
          primary_args: m.primaryArgs,
          shadow_args: m.shadowArgs,
          args_match: m.match,
          virtualization_action: m.action,
        });
      }
    }
  }

  const stats = await db.getStats();
  console.log(`[Seed] Seeded 20 trace pairs successfully.`);
  console.log(`[Seed] Aggregate Stats: Total Requests=${stats.totalRequests}, Cost Savings=$${stats.costSavingsUsd.toFixed(4)} (${stats.costSavingsPercent}%), P95 Latency Delta=${stats.latencyDeltaMs}ms, Avg Similarity=${stats.avgSemanticSimilarity}`);
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  runSeed().catch((err) => {
    console.error('[Seed] Error running seed:', err);
    process.exit(1);
  });
}
