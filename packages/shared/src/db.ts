import pg from 'pg';
import {
  CanaryConfig,
  CanaryStats,
  ExecutionTrace,
  VirtualizedToolMutation,
} from './types.js';

const { Pool } = pg;

export interface IDatabase {
  init(): Promise<void>;
  getCanaryConfig(): Promise<CanaryConfig>;
  updateCanaryConfig(updates: Partial<CanaryConfig>): Promise<CanaryConfig>;
  insertTrace(trace: ExecutionTrace): Promise<void>;
  updateTrace(id: string, updates: Partial<ExecutionTrace>): Promise<void>;
  getTraces(limit?: number, offset?: number, driftOnly?: boolean): Promise<ExecutionTrace[]>;
  getTraceById(id: string): Promise<ExecutionTrace | null>;
  insertMutation(mutation: Omit<VirtualizedToolMutation, 'id' | 'created_at'>): Promise<VirtualizedToolMutation>;
  getMutations(traceId?: string): Promise<VirtualizedToolMutation[]>;
  getStats(): Promise<CanaryStats>;
  promoteShadow(): Promise<CanaryConfig>;
}

const DEFAULT_CONFIG: CanaryConfig = {
  id: 'cfg_default',
  is_active: true,
  sample_rate: 0.50,
  primary_provider: process.env.PRIMARY_PROVIDER || 'mock',
  primary_model: process.env.PRIMARY_MODEL || 'gpt-4o',
  primary_base_url: process.env.PRIMARY_BASE_URL || 'https://api.openai.com/v1',
  shadow_provider: process.env.SHADOW_PROVIDER || 'mock',
  shadow_model: process.env.SHADOW_MODEL || 'llama-3.3-70b-versatile',
  shadow_base_url: process.env.SHADOW_BASE_URL || 'https://api.groq.com/openai/v1',
  system_prompt_override: null,
  drift_alert_threshold: 0.85,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Memory Database implementation for offline zero-credential local dev & tests.
 */
class MemoryDatabase implements IDatabase {
  private config: CanaryConfig = { ...DEFAULT_CONFIG };
  private traces: Map<string, ExecutionTrace> = new Map();
  private mutations: VirtualizedToolMutation[] = [];
  private mutationSeq = 1;

  async init(): Promise<void> {
    console.log('[Database] Running in-memory database (offline fallback mode)');
  }

  async getCanaryConfig(): Promise<CanaryConfig> {
    return { ...this.config };
  }

  async updateCanaryConfig(updates: Partial<CanaryConfig>): Promise<CanaryConfig> {
    this.config = {
      ...this.config,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return { ...this.config };
  }

  async insertTrace(trace: ExecutionTrace): Promise<void> {
    this.traces.set(trace.id, { ...trace });
  }

  async updateTrace(id: string, updates: Partial<ExecutionTrace>): Promise<void> {
    const existing = this.traces.get(id);
    if (existing) {
      this.traces.set(id, { ...existing, ...updates });
    }
  }

  async getTraces(limit = 50, offset = 0, driftOnly = false): Promise<ExecutionTrace[]> {
    const list = Array.from(this.traces.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const filtered = driftOnly ? list.filter((t) => t.has_drift_warning) : list;
    return filtered.slice(offset, offset + limit);
  }

  async getTraceById(id: string): Promise<ExecutionTrace | null> {
    return this.traces.get(id) || null;
  }

  async insertMutation(mutation: Omit<VirtualizedToolMutation, 'id' | 'created_at'>): Promise<VirtualizedToolMutation> {
    const created: VirtualizedToolMutation = {
      id: this.mutationSeq++,
      created_at: new Date().toISOString(),
      ...mutation,
    };
    this.mutations.push(created);
    return created;
  }

  async getMutations(traceId?: string): Promise<VirtualizedToolMutation[]> {
    if (traceId) {
      return this.mutations.filter((m) => m.trace_id === traceId);
    }
    return [...this.mutations].reverse().slice(0, 100);
  }

  async getStats(): Promise<CanaryStats> {
    const traces = Array.from(this.traces.values());
    const totalRequests = traces.length;
    const shadowTraces = traces.filter((t) => t.shadow_model !== null);
    const shadowSampleCount = shadowTraces.length;

    let totalSim = 0;
    let simCount = 0;
    let driftCount = 0;
    let totalPrimaryCost = 0;
    let totalShadowCost = 0;

    const primaryLatencies: number[] = [];
    const shadowLatencies: number[] = [];

    for (const t of traces) {
      totalPrimaryCost += Number(t.primary_cost_usd || 0);
      if (t.primary_latency_ms) primaryLatencies.push(t.primary_latency_ms);

      if (t.shadow_model) {
        totalShadowCost += Number(t.shadow_cost_usd || 0);
        if (t.shadow_latency_ms) shadowLatencies.push(t.shadow_latency_ms);

        if (t.semantic_similarity !== null && t.semantic_similarity !== undefined) {
          totalSim += Number(t.semantic_similarity);
          simCount++;
        }
        if (t.has_drift_warning) {
          driftCount++;
        }
      }
    }

    primaryLatencies.sort((a, b) => a - b);
    shadowLatencies.sort((a, b) => a - b);

    const getPercentile = (arr: number[], pct: number) => {
      if (arr.length === 0) return 0;
      const idx = Math.min(arr.length - 1, Math.floor((pct / 100) * arr.length));
      return arr[idx];
    };

    const costSavingsUsd = Math.max(0, totalPrimaryCost - totalShadowCost);
    const costSavingsPercent =
      totalPrimaryCost > 0 ? (costSavingsUsd / totalPrimaryCost) * 100 : 0;

    const p95Primary = getPercentile(primaryLatencies, 95);
    const p95Shadow = getPercentile(shadowLatencies, 95);

    return {
      totalRequests,
      shadowSampleCount,
      sampleRate: this.config.sample_rate,
      avgSemanticSimilarity: simCount > 0 ? Number((totalSim / simCount).toFixed(3)) : 1.0,
      driftWarningCount: driftCount,
      driftWarningRate: shadowSampleCount > 0 ? Number((driftCount / shadowSampleCount).toFixed(3)) : 0,
      totalPrimaryCostUsd: Number(totalPrimaryCost.toFixed(6)),
      totalShadowCostUsd: Number(totalShadowCost.toFixed(6)),
      costSavingsUsd: Number(costSavingsUsd.toFixed(6)),
      costSavingsPercent: Number(costSavingsPercent.toFixed(1)),
      p50PrimaryLatencyMs: getPercentile(primaryLatencies, 50),
      p95PrimaryLatencyMs: p95Primary,
      p50ShadowLatencyMs: getPercentile(shadowLatencies, 50),
      p95ShadowLatencyMs: p95Shadow,
      latencyDeltaMs: p95Primary - p95Shadow,
      virtualizedMutationCount: this.mutations.length,
    };
  }

  async promoteShadow(): Promise<CanaryConfig> {
    this.config = {
      ...this.config,
      primary_provider: this.config.shadow_provider,
      primary_model: this.config.shadow_model,
      primary_base_url: this.config.shadow_base_url,
      updated_at: new Date().toISOString(),
    };
    return { ...this.config };
  }
}

/**
 * PostgreSQL Database implementation for Neon Serverless / Local Postgres.
 */
class PostgresDatabase implements IDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS canary_configs (
          id VARCHAR(64) PRIMARY KEY,
          is_active BOOLEAN DEFAULT TRUE,
          sample_rate NUMERIC(3, 2) DEFAULT 0.50,
          primary_provider VARCHAR(50) NOT NULL,
          primary_model VARCHAR(100) NOT NULL,
          primary_base_url TEXT DEFAULT 'https://api.openai.com/v1',
          shadow_provider VARCHAR(50) NOT NULL,
          shadow_model VARCHAR(100) NOT NULL,
          shadow_base_url TEXT DEFAULT 'https://api.groq.com/openai/v1',
          system_prompt_override TEXT,
          drift_alert_threshold NUMERIC(3, 2) DEFAULT 0.85,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS execution_traces (
          id VARCHAR(64) PRIMARY KEY,
          endpoint VARCHAR(100) NOT NULL,
          client_ip_hash VARCHAR(64),
          prompt_tokens INT DEFAULT 0,
          prompt_preview TEXT,
          primary_model VARCHAR(100) NOT NULL,
          primary_response_text TEXT,
          primary_tool_calls JSONB,
          primary_latency_ms INT,
          primary_cost_usd NUMERIC(10, 6),
          shadow_model VARCHAR(100),
          shadow_response_text TEXT,
          shadow_tool_calls JSONB,
          shadow_latency_ms INT,
          shadow_cost_usd NUMERIC(10, 6),
          semantic_similarity NUMERIC(4, 3),
          tool_intent_matched BOOLEAN,
          has_drift_warning BOOLEAN DEFAULT FALSE,
          drift_reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_traces_created_at ON execution_traces(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_traces_drift ON execution_traces(has_drift_warning) WHERE has_drift_warning = TRUE;

        CREATE TABLE IF NOT EXISTS virtualized_tool_mutations (
          id BIGSERIAL PRIMARY KEY,
          trace_id VARCHAR(64) REFERENCES execution_traces(id) ON DELETE CASCADE,
          tool_name VARCHAR(100) NOT NULL,
          tool_type VARCHAR(20) DEFAULT 'SIDE_EFFECT',
          primary_args JSONB,
          shadow_args JSONB,
          args_match BOOLEAN DEFAULT TRUE,
          virtualization_action VARCHAR(50) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Seed default config if none exists
      const res = await client.query('SELECT COUNT(*) FROM canary_configs');
      if (parseInt(res.rows[0].count, 10) === 0) {
        await client.query(
          `INSERT INTO canary_configs (
            id, is_active, sample_rate, primary_provider, primary_model, primary_base_url,
            shadow_provider, shadow_model, shadow_base_url, system_prompt_override, drift_alert_threshold
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            DEFAULT_CONFIG.id,
            DEFAULT_CONFIG.is_active,
            DEFAULT_CONFIG.sample_rate,
            DEFAULT_CONFIG.primary_provider,
            DEFAULT_CONFIG.primary_model,
            DEFAULT_CONFIG.primary_base_url,
            DEFAULT_CONFIG.shadow_provider,
            DEFAULT_CONFIG.shadow_model,
            DEFAULT_CONFIG.shadow_base_url,
            DEFAULT_CONFIG.system_prompt_override,
            DEFAULT_CONFIG.drift_alert_threshold,
          ]
        );
      }
      console.log('[Database] PostgreSQL schema migration complete');
    } finally {
      client.release();
    }
  }

  async getCanaryConfig(): Promise<CanaryConfig> {
    const res = await this.pool.query('SELECT * FROM canary_configs ORDER BY created_at DESC LIMIT 1');
    if (res.rows.length === 0) return DEFAULT_CONFIG;
    const row = res.rows[0];
    return {
      id: row.id,
      is_active: row.is_active,
      sample_rate: parseFloat(row.sample_rate),
      primary_provider: row.primary_provider,
      primary_model: row.primary_model,
      primary_base_url: row.primary_base_url,
      shadow_provider: row.shadow_provider,
      shadow_model: row.shadow_model,
      shadow_base_url: row.shadow_base_url,
      system_prompt_override: row.system_prompt_override,
      drift_alert_threshold: parseFloat(row.drift_alert_threshold),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async updateCanaryConfig(updates: Partial<CanaryConfig>): Promise<CanaryConfig> {
    const current = await this.getCanaryConfig();
    const merged = { ...current, ...updates, updated_at: new Date().toISOString() };
    await this.pool.query(
      `UPDATE canary_configs SET
        is_active = $1,
        sample_rate = $2,
        primary_provider = $3,
        primary_model = $4,
        primary_base_url = $5,
        shadow_provider = $6,
        shadow_model = $7,
        shadow_base_url = $8,
        system_prompt_override = $9,
        drift_alert_threshold = $10,
        updated_at = NOW()
      WHERE id = $11`,
      [
        merged.is_active,
        merged.sample_rate,
        merged.primary_provider,
        merged.primary_model,
        merged.primary_base_url,
        merged.shadow_provider,
        merged.shadow_model,
        merged.shadow_base_url,
        merged.system_prompt_override,
        merged.drift_alert_threshold,
        merged.id,
      ]
    );
    return merged;
  }

  async insertTrace(trace: ExecutionTrace): Promise<void> {
    await this.pool.query(
      `INSERT INTO execution_traces (
        id, endpoint, client_ip_hash, prompt_tokens, prompt_preview,
        primary_model, primary_response_text, primary_tool_calls, primary_latency_ms, primary_cost_usd,
        shadow_model, shadow_response_text, shadow_tool_calls, shadow_latency_ms, shadow_cost_usd,
        semantic_similarity, tool_intent_matched, has_drift_warning, drift_reason, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO NOTHING`,
      [
        trace.id,
        trace.endpoint,
        trace.client_ip_hash || null,
        trace.prompt_tokens,
        trace.prompt_preview || null,
        trace.primary_model,
        trace.primary_response_text,
        trace.primary_tool_calls ? JSON.stringify(trace.primary_tool_calls) : null,
        trace.primary_latency_ms,
        trace.primary_cost_usd,
        trace.shadow_model,
        trace.shadow_response_text,
        trace.shadow_tool_calls ? JSON.stringify(trace.shadow_tool_calls) : null,
        trace.shadow_latency_ms,
        trace.shadow_cost_usd,
        trace.semantic_similarity,
        trace.tool_intent_matched,
        trace.has_drift_warning,
        trace.drift_reason,
        trace.created_at || new Date().toISOString(),
      ]
    );
  }

  async updateTrace(id: string, updates: Partial<ExecutionTrace>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;
      fields.push(`${key} = $${idx++}`);
      if (key.endsWith('tool_calls') && value !== null && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }

    if (fields.length === 0) return;
    values.push(id);
    await this.pool.query(
      `UPDATE execution_traces SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  async getTraces(limit = 50, offset = 0, driftOnly = false): Promise<ExecutionTrace[]> {
    const query = `
      SELECT * FROM execution_traces
      ${driftOnly ? 'WHERE has_drift_warning = TRUE' : ''}
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const res = await this.pool.query(query, [limit, offset]);
    return res.rows.map(this.mapTraceRow);
  }

  async getTraceById(id: string): Promise<ExecutionTrace | null> {
    const res = await this.pool.query('SELECT * FROM execution_traces WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapTraceRow(res.rows[0]);
  }

  private mapTraceRow(row: any): ExecutionTrace {
    return {
      id: row.id,
      endpoint: row.endpoint,
      client_ip_hash: row.client_ip_hash,
      prompt_tokens: row.prompt_tokens,
      prompt_preview: row.prompt_preview,
      primary_model: row.primary_model,
      primary_response_text: row.primary_response_text,
      primary_tool_calls: row.primary_tool_calls ? (typeof row.primary_tool_calls === 'string' ? JSON.parse(row.primary_tool_calls) : row.primary_tool_calls) : null,
      primary_latency_ms: row.primary_latency_ms,
      primary_cost_usd: parseFloat(row.primary_cost_usd || '0'),
      shadow_model: row.shadow_model,
      shadow_response_text: row.shadow_response_text,
      shadow_tool_calls: row.shadow_tool_calls ? (typeof row.shadow_tool_calls === 'string' ? JSON.parse(row.shadow_tool_calls) : row.shadow_tool_calls) : null,
      shadow_latency_ms: row.shadow_latency_ms ? parseInt(row.shadow_latency_ms, 10) : null,
      shadow_cost_usd: row.shadow_cost_usd ? parseFloat(row.shadow_cost_usd) : null,
      semantic_similarity: row.semantic_similarity ? parseFloat(row.semantic_similarity) : null,
      tool_intent_matched: row.tool_intent_matched,
      has_drift_warning: row.has_drift_warning,
      drift_reason: row.drift_reason,
      created_at: row.created_at.toISOString(),
    };
  }

  async insertMutation(mutation: Omit<VirtualizedToolMutation, 'id' | 'created_at'>): Promise<VirtualizedToolMutation> {
    const res = await this.pool.query(
      `INSERT INTO virtualized_tool_mutations (
        trace_id, tool_name, tool_type, primary_args, shadow_args, args_match, virtualization_action
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        mutation.trace_id,
        mutation.tool_name,
        mutation.tool_type,
        mutation.primary_args ? JSON.stringify(mutation.primary_args) : null,
        mutation.shadow_args ? JSON.stringify(mutation.shadow_args) : null,
        mutation.args_match,
        mutation.virtualization_action,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      trace_id: row.trace_id,
      tool_name: row.tool_name,
      tool_type: row.tool_type,
      primary_args: row.primary_args,
      shadow_args: row.shadow_args,
      args_match: row.args_match,
      virtualization_action: row.virtualization_action,
      created_at: row.created_at.toISOString(),
    };
  }

  async getMutations(traceId?: string): Promise<VirtualizedToolMutation[]> {
    const query = traceId
      ? 'SELECT * FROM virtualized_tool_mutations WHERE trace_id = $1 ORDER BY created_at ASC'
      : 'SELECT * FROM virtualized_tool_mutations ORDER BY created_at DESC LIMIT 100';
    const params = traceId ? [traceId] : [];
    const res = await this.pool.query(query, params);
    return res.rows.map((row) => ({
      id: row.id,
      trace_id: row.trace_id,
      tool_name: row.tool_name,
      tool_type: row.tool_type,
      primary_args: row.primary_args,
      shadow_args: row.shadow_args,
      args_match: row.args_match,
      virtualization_action: row.virtualization_action,
      created_at: row.created_at.toISOString(),
    }));
  }

  async getStats(): Promise<CanaryStats> {
    const config = await this.getCanaryConfig();
    const countRes = await this.pool.query(`
      SELECT
        COUNT(*) as total_requests,
        COUNT(shadow_model) as shadow_sample_count,
        AVG(semantic_similarity) as avg_similarity,
        COUNT(*) FILTER (WHERE has_drift_warning = TRUE) as drift_count,
        COALESCE(SUM(primary_cost_usd), 0) as total_primary_cost,
        COALESCE(SUM(shadow_cost_usd), 0) as total_shadow_cost,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY primary_latency_ms) as p50_primary,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY primary_latency_ms) as p95_primary,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY shadow_latency_ms) as p50_shadow,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY shadow_latency_ms) as p95_shadow
      FROM execution_traces
    `);

    const mutationCountRes = await this.pool.query('SELECT COUNT(*) as count FROM virtualized_tool_mutations');

    const row = countRes.rows[0];
    const totalRequests = parseInt(row.total_requests || '0', 10);
    const shadowSampleCount = parseInt(row.shadow_sample_count || '0', 10);
    const totalPrimaryCost = parseFloat(row.total_primary_cost || '0');
    const totalShadowCost = parseFloat(row.total_shadow_cost || '0');
    const costSavingsUsd = Math.max(0, totalPrimaryCost - totalShadowCost);
    const costSavingsPercent = totalPrimaryCost > 0 ? (costSavingsUsd / totalPrimaryCost) * 100 : 0;
    const driftCount = parseInt(row.drift_count || '0', 10);
    const p95Primary = Math.round(parseFloat(row.p95_primary || '0'));
    const p95Shadow = Math.round(parseFloat(row.p95_shadow || '0'));

    return {
      totalRequests,
      shadowSampleCount,
      sampleRate: config.sample_rate,
      avgSemanticSimilarity: row.avg_similarity ? parseFloat(parseFloat(row.avg_similarity).toFixed(3)) : 1.0,
      driftWarningCount: driftCount,
      driftWarningRate: shadowSampleCount > 0 ? parseFloat((driftCount / shadowSampleCount).toFixed(3)) : 0,
      totalPrimaryCostUsd: parseFloat(totalPrimaryCost.toFixed(6)),
      totalShadowCostUsd: parseFloat(totalShadowCost.toFixed(6)),
      costSavingsUsd: parseFloat(costSavingsUsd.toFixed(6)),
      costSavingsPercent: parseFloat(costSavingsPercent.toFixed(1)),
      p50PrimaryLatencyMs: Math.round(parseFloat(row.p50_primary || '0')),
      p95PrimaryLatencyMs: p95Primary,
      p50ShadowLatencyMs: Math.round(parseFloat(row.p50_shadow || '0')),
      p95ShadowLatencyMs: p95Shadow,
      latencyDeltaMs: p95Primary - p95Shadow,
      virtualizedMutationCount: parseInt(mutationCountRes.rows[0].count || '0', 10),
    };
  }

  async promoteShadow(): Promise<CanaryConfig> {
    const current = await this.getCanaryConfig();
    return this.updateCanaryConfig({
      primary_provider: current.shadow_provider,
      primary_model: current.shadow_model,
      primary_base_url: current.shadow_base_url,
    });
  }
}

let dbInstance: IDatabase | null = null;

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.trim() !== '') {
    try {
      console.log('[Database] Connecting to PostgreSQL at', dbUrl.split('@')[1] || 'configured host');
      const pgDb = new PostgresDatabase(dbUrl);
      await pgDb.init();
      dbInstance = pgDb;
      return dbInstance;
    } catch (err) {
      console.warn('[Database] Failed connecting to Postgres, falling back to MemoryDatabase:', err);
    }
  }

  const memDb = new MemoryDatabase();
  await memDb.init();
  dbInstance = memDb;
  return dbInstance;
}
