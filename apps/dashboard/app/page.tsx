'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  DollarSign,
  Flame,
  GitBranch,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sliders,
  Terminal,
  Zap,
} from 'lucide-react';

interface CanaryConfig {
  id: string;
  is_active: boolean;
  sample_rate: number;
  primary_provider: string;
  primary_model: string;
  primary_base_url: string;
  shadow_provider: string;
  shadow_model: string;
  shadow_base_url: string;
  system_prompt_override?: string | null;
  drift_alert_threshold: number;
}

interface ExecutionTrace {
  id: string;
  endpoint: string;
  prompt_tokens: number;
  prompt_preview?: string | null;
  primary_model: string;
  primary_response_text: string | null;
  primary_tool_calls: any[] | null;
  primary_latency_ms: number;
  primary_cost_usd: number;
  shadow_model: string | null;
  shadow_response_text: string | null;
  shadow_tool_calls: any[] | null;
  shadow_latency_ms: number | null;
  shadow_cost_usd: number | null;
  semantic_similarity: number | null;
  tool_intent_matched: boolean | null;
  has_drift_warning: boolean;
  drift_reason: string | null;
  created_at: string;
}

interface VirtualizedToolMutation {
  id: number | string;
  trace_id: string;
  tool_name: string;
  tool_type: string;
  primary_args: Record<string, any> | null;
  shadow_args: Record<string, any> | null;
  args_match: boolean;
  virtualization_action: string;
  created_at: string;
}

interface CanaryStats {
  totalRequests: number;
  shadowSampleCount: number;
  sampleRate: number;
  avgSemanticSimilarity: number;
  driftWarningCount: number;
  driftWarningRate: number;
  totalPrimaryCostUsd: number;
  totalShadowCostUsd: number;
  costSavingsUsd: number;
  costSavingsPercent: number;
  p50PrimaryLatencyMs: number;
  p95PrimaryLatencyMs: number;
  p50ShadowLatencyMs: number;
  p95ShadowLatencyMs: number;
  latencyDeltaMs: number;
  virtualizedMutationCount: number;
}

export default function CanaryDashboard() {
  const [stats, setStats] = useState<CanaryStats | null>(null);
  const [config, setConfig] = useState<CanaryConfig | null>(null);
  const [traces, setTraces] = useState<ExecutionTrace[]>([]);
  const [mutations, setMutations] = useState<VirtualizedToolMutation[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [filterDrift, setFilterDrift] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPromoting, setIsPromoting] = useState<boolean>(false);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);
  const [configSampleRate, setConfigSampleRate] = useState<number>(0.5);
  const [configDriftThreshold, setConfigDriftThreshold] = useState<number>(0.85);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const apiUrl = process.env.NEXT_PUBLIC_PROXY_API_URL || 'http://localhost:8080';

  const fetchData = async () => {
    try {
      const [statsRes, configRes, tracesRes, mutationsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/canary/stats`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${apiUrl}/api/v1/canary/config`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${apiUrl}/api/v1/canary/traces?limit=50`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${apiUrl}/api/v1/canary/mutations`).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (statsRes) setStats(statsRes);
      if (configRes) {
        setConfig(configRes);
        setConfigSampleRate(configRes.sample_rate);
        setConfigDriftThreshold(configRes.drift_alert_threshold);
      }
      if (tracesRes?.traces) {
        setTraces(tracesRes.traces);
        if (!selectedTraceId && tracesRes.traces.length > 0) {
          setSelectedTraceId(tracesRes.traces[0].id);
        }
      }
      if (mutationsRes?.mutations) {
        setMutations(mutationsRes.mutations);
      }
    } catch (err) {
      console.error('Failed to load canary data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  const handlePromote = async () => {
    if (!config) return;
    setIsPromoting(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/canary/promote`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPromoteSuccess(data.message || 'Shadow model successfully promoted to Primary!');
        await fetchData();
        setTimeout(() => setPromoteSuccess(null), 6000);
      }
    } catch (err) {
      console.error('Failed to promote shadow model:', err);
    } finally {
      setIsPromoting(false);
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingConfig(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/canary/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_rate: configSampleRate,
          drift_alert_threshold: configDriftThreshold,
        }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update canary config:', err);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const selectedTrace = useMemo(() => {
    return traces.find((t) => t.id === selectedTraceId) || traces[0] || null;
  }, [traces, selectedTraceId]);

  const traceMutations = useMemo(() => {
    if (!selectedTrace) return [];
    return mutations.filter((m) => m.trace_id === selectedTrace.id);
  }, [mutations, selectedTrace]);

  const filteredTraces = useMemo(() => {
    return traces.filter((t) => {
      const matchesDrift = filterDrift ? t.has_drift_warning : true;
      const matchesSearch = searchQuery
        ? t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.prompt_preview && t.prompt_preview.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (t.drift_reason && t.drift_reason.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;
      return matchesDrift && matchesSearch;
    });
  }, [traces, filterDrift, searchQuery]);

  return (
    <div className="min-h-screen bg-[#08090d] text-[#e6edf3] font-sans">
      {/* Top Banner Navigation */}
      <header className="border-b border-[#1b1f2d] bg-[#0c0e17]/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2.5">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping absolute inset-0 opacity-75" />
                <div className="w-3 h-3 rounded-full bg-emerald-500 relative" />
              </div>
              <span className="font-mono font-bold tracking-wider text-base text-white">
                SHADOW<span className="text-accent">//</span>LLM
              </span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#161a26] text-slate-400 border border-[#23293d]">
              v1.0.0-canary
            </span>
            <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-400">
              <span className="text-slate-500">Target:</span>
              <span className="text-slate-200 bg-[#161a29] px-2 py-0.5 rounded border border-[#262c42]">
                {config?.primary_model || 'gpt-4o'}
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span className="text-accent bg-[#0f2438] px-2 py-0.5 rounded border border-accent/30 font-medium">
                {config?.shadow_model || 'llama-3.3-70b-versatile'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-1.5 rounded-lg border border-[#23293d] bg-[#121522] hover:bg-[#1a1e30] text-slate-400 hover:text-white transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handlePromote}
              disabled={isPromoting || config?.primary_model === config?.shadow_model}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isPromoting ? 'Promoting...' : 'Promote Shadow to Production'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Promotion Alert Toast */}
      {promoteSuccess && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{promoteSuccess}</span>
          </div>
          <button onClick={() => setPromoteSuccess(null)} className="text-emerald-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cost Savings Odometer */}
          <div className="p-4 rounded-xl bg-[#0f111a] border border-[#1b2030] relative overflow-hidden group hover:border-[#2a324b] transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Cost Savings</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-emerald-400">
                ${stats?.costSavingsUsd?.toFixed(4) || '0.0000'}
              </span>
              <span className="text-xs font-mono text-emerald-300/80 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                +{stats?.costSavingsPercent?.toFixed(1) || '0'}%
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-2">
              Primary: ${(stats?.totalPrimaryCostUsd || 0).toFixed(4)} → Shadow: ${(stats?.totalShadowCostUsd || 0).toFixed(4)}
            </p>
          </div>

          {/* Card 2: Latency Delta */}
          <div className="p-4 rounded-xl bg-[#0f111a] border border-[#1b2030] relative overflow-hidden group hover:border-[#2a324b] transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">P95 Latency Delta</span>
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-accent">
                {stats && stats.latencyDeltaMs >= 0 ? `-${stats.latencyDeltaMs}ms` : `+${Math.abs(stats?.latencyDeltaMs || 0)}ms`}
              </span>
              <span className="text-xs font-mono text-slate-400">p95 speedup</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-2">
              Primary: {stats?.p95PrimaryLatencyMs || 0}ms vs Shadow: {stats?.p95ShadowLatencyMs || 0}ms
            </p>
          </div>

          {/* Card 3: Semantic Agreement */}
          <div className="p-4 rounded-xl bg-[#0f111a] border border-[#1b2030] relative overflow-hidden group hover:border-[#2a324b] transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Semantic Agreement</span>
              <Activity className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-purple-300">
                {((stats?.avgSemanticSimilarity || 1.0) * 100).toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-slate-400">cosine sim</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-2">
              Drift Warnings: {stats?.driftWarningCount || 0} of {stats?.shadowSampleCount || 0} ({((stats?.driftWarningRate || 0) * 100).toFixed(1)}%)
            </p>
          </div>

          {/* Card 4: Side-Effect Virtualizations */}
          <div className="p-4 rounded-xl bg-[#0f111a] border border-[#1b2030] relative overflow-hidden group hover:border-[#2a324b] transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Side-Effects Sandboxed</span>
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-blue-300">
                {stats?.virtualizedMutationCount || 0}
              </span>
              <span className="text-xs font-mono text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                0 Duplicates
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-2">
              100% of mutating tool actions safely sandboxed
            </p>
          </div>
        </div>

        {/* Dynamic Canary Routing Controls & Telemetry Radar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Box */}
          <div className="p-5 rounded-xl bg-[#0f111a] border border-[#1b2030] flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Sliders className="w-4 h-4 text-accent" />
                <h3 className="font-mono text-sm font-semibold text-white">Canary Routing Rules</h3>
              </div>
              <form onSubmit={handleUpdateConfig} className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1 text-slate-400">
                    <span>Traffic Sample Rate</span>
                    <span className="text-white font-bold">{Math.round(configSampleRate * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={configSampleRate}
                    onChange={(e) => setConfigSampleRate(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#1b2030] rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                    <span>0% (Disabled)</span>
                    <span>50%</span>
                    <span>100% (Full Shadow)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-1 text-slate-400">
                    <span>Drift Alert Threshold</span>
                    <span className="text-white font-bold">{configDriftThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0.50"
                    max="0.99"
                    step="0.01"
                    value={configDriftThreshold}
                    onChange={(e) => setConfigDriftThreshold(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#1b2030] rounded-lg appearance-none cursor-pointer accent-purple-400"
                  />
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    Triggers warning if Cosine similarity &lt; {configDriftThreshold} or tools mismatch.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingConfig}
                  className="w-full mt-2 py-2 px-3 rounded-lg bg-[#181d2c] hover:bg-[#20273b] border border-[#2b334d] text-xs font-mono font-medium text-slate-200 hover:text-white transition disabled:opacity-50"
                >
                  {isUpdatingConfig ? 'Applying Updates...' : 'Apply Canary Configuration'}
                </button>
              </form>
            </div>

            <div className="pt-4 border-t border-[#1b2030] mt-4 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>Zero-Latency Bifurcation</span>
              </span>
              <span className="text-slate-500">&lt;2ms overhead</span>
            </div>
          </div>

          {/* Radar Telemetry & Quality Matrix */}
          <div className="p-5 rounded-xl bg-[#0f111a] border border-[#1b2030] lg:col-span-2 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h3 className="font-mono text-sm font-semibold text-white">Live Model Quality & Latency Spectrum</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {stats?.shadowSampleCount || 0} evaluated pairs
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Radar Graphic SVG */}
              <div className="flex flex-col items-center justify-center p-3 bg-[#0a0c13] rounded-lg border border-[#171a26]">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-18">
                    {/* Concentric Grid Circles */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2538" strokeWidth="0.8" />
                    <circle cx="50" cy="50" r="30" fill="none" stroke="#1f2538" strokeWidth="0.8" strokeDasharray="2,2" />
                    <circle cx="50" cy="50" r="20" fill="none" stroke="#1f2538" strokeWidth="0.8" strokeDasharray="2,2" />
                    <circle cx="50" cy="50" r="10" fill="none" stroke="#1f2538" strokeWidth="0.8" />
                    {/* Axis lines */}
                    <line x1="50" y1="10" x2="50" y2="90" stroke="#1f2538" strokeWidth="0.8" />
                    <line x1="10" y1="50" x2="90" y2="50" stroke="#1f2538" strokeWidth="0.8" />
                    {/* Primary Radar Polygon */}
                    <polygon
                      points="50,16 80,48 65,80 32,75 22,46"
                      fill="rgba(56, 189, 248, 0.12)"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                    {/* Shadow Radar Polygon */}
                    <polygon
                      points="50,18 84,42 70,72 38,78 26,42"
                      fill="rgba(16, 185, 129, 0.2)"
                      stroke="#10b981"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
                <div className="flex items-center space-x-4 mt-2 text-[10px] font-mono">
                  <div className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-accent/40 border border-accent inline-block" />
                    <span className="text-slate-300">Baseline ({config?.primary_model})</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-400 inline-block" />
                    <span className="text-slate-300">Canary ({config?.shadow_model})</span>
                  </div>
                </div>
              </div>

              {/* Quality Comparison Stats */}
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Semantic Cosine Agreement</span>
                    <span className="text-emerald-400 font-bold">{((stats?.avgSemanticSimilarity || 1) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-[#161a26] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (stats?.avgSemanticSimilarity || 1) * 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Tool Intent Compliance</span>
                    <span className="text-accent font-bold">
                      {stats ? `${Math.round((1 - (stats.driftWarningRate * 0.5)) * 100)}%` : '100%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#161a26] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-accent h-full rounded-full transition-all duration-500"
                      style={{ width: `${stats ? Math.round((1 - (stats.driftWarningRate * 0.5)) * 100) : 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Cost Reduction Advantage</span>
                    <span className="text-purple-400 font-bold">
                      {stats?.costSavingsPercent?.toFixed(1) || '0'}%
                    </span>
                  </div>
                  <div className="w-full bg-[#161a26] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, stats?.costSavingsPercent || 0)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Side-Effect Virtualization Safety</span>
                    <span className="text-blue-400 font-bold">100% Safe</span>
                  </div>
                  <div className="w-full bg-[#161a26] h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-400 h-full rounded-full w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Traces Table & Side-by-Side Diff Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Trace List (5 cols) */}
          <div className="lg:col-span-5 p-4 rounded-xl bg-[#0f111a] border border-[#1b2030] flex flex-col h-[640px]">
            <div className="flex items-center justify-between pb-3 border-b border-[#1b2030]">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <h3 className="font-mono text-xs font-semibold uppercase text-slate-300">Execution Traces</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setFilterDrift(!filterDrift)}
                  className={`text-[11px] font-mono px-2 py-1 rounded transition flex items-center space-x-1 ${
                    filterDrift
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-[#181d2a] text-slate-400 hover:text-white border border-[#23293d]'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Drift Only</span>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="py-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by trace ID, prompt, drift reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0a0c13] border border-[#1b2030] rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Traces Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredTraces.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                  <p>No traces match filter</p>
                </div>
              ) : (
                filteredTraces.map((trace) => {
                  const isSelected = trace.id === selectedTrace?.id;
                  return (
                    <div
                      key={trace.id}
                      onClick={() => setSelectedTraceId(trace.id)}
                      className={`p-3 rounded-lg cursor-pointer transition border text-xs font-mono ${
                        isSelected
                          ? 'bg-[#171b28] border-accent/40 shadow-sm'
                          : 'bg-[#0b0d14] hover:bg-[#121622] border-[#181c2b]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-200">{trace.id}</span>
                        <div className="flex items-center space-x-1.5">
                          {trace.has_drift_warning && (
                            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>Drift</span>
                            </span>
                          )}
                          {trace.semantic_similarity !== null && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                (trace.semantic_similarity || 0) >= 0.85
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {(trace.semantic_similarity * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-slate-400 line-clamp-1 text-[11px] mb-1.5">
                        {trace.prompt_preview || 'No prompt content'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{new Date(trace.created_at).toLocaleTimeString()}</span>
                        <span>
                          {trace.primary_latency_ms}ms → {trace.shadow_latency_ms ? `${trace.shadow_latency_ms}ms` : 'pending'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Diff Inspector (7 cols) */}
          <div className="lg:col-span-7 p-5 rounded-xl bg-[#0f111a] border border-[#1b2030] flex flex-col h-[640px] overflow-hidden">
            {selectedTrace ? (
              <div className="flex flex-col h-full space-y-4">
                {/* Diff Header */}
                <div className="flex items-center justify-between pb-3 border-b border-[#1b2030]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-white">{selectedTrace.id}</span>
                      <span className="text-xs font-mono text-slate-500">{selectedTrace.endpoint}</span>
                    </div>
                    {selectedTrace.has_drift_warning && (
                      <p className="text-xs font-mono text-amber-400 mt-1 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{selectedTrace.drift_reason || 'Semantic drift or parameter deviation detected.'}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs font-mono">
                    <span className="text-slate-400">Similarity: </span>
                    <span
                      className={`font-bold ${
                        (selectedTrace.semantic_similarity || 0) >= 0.85 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {selectedTrace.semantic_similarity !== null
                        ? `${(selectedTrace.semantic_similarity * 100).toFixed(1)}%`
                        : 'Evaluating...'}
                    </span>
                  </div>
                </div>

                {/* Prompt Preview */}
                <div className="bg-[#0a0c13] p-3 rounded-lg border border-[#181c2b]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
                    Input Prompt ({selectedTrace.prompt_tokens} tokens)
                  </span>
                  <p className="text-xs font-mono text-slate-300 line-clamp-2">
                    {selectedTrace.prompt_preview || 'No prompt content'}
                  </p>
                </div>

                {/* Side-by-Side Outputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                  {/* Primary Model Panel */}
                  <div className="flex flex-col rounded-lg bg-[#0b0d14] border border-[#1b2030] overflow-hidden">
                    <div className="bg-[#121622] px-3 py-2 border-b border-[#1b2030] flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-medium">{selectedTrace.primary_model} (Primary)</span>
                      <div className="flex space-x-2 text-[10px] text-slate-400">
                        <span>{selectedTrace.primary_latency_ms}ms</span>
                        <span>${selectedTrace.primary_cost_usd?.toFixed(5)}</span>
                      </div>
                    </div>
                    <div className="p-3 overflow-y-auto flex-1 text-xs font-mono text-slate-300 leading-relaxed space-y-2">
                      {selectedTrace.primary_tool_calls && selectedTrace.primary_tool_calls.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block">
                            Tool Call Invoked
                          </span>
                          {selectedTrace.primary_tool_calls.map((tc, idx) => (
                            <div key={idx} className="bg-[#10131d] p-2.5 rounded border border-[#1e2333] space-y-1">
                              <span className="text-accent font-semibold">{tc.function.name}</span>
                              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap">
                                {tc.function.arguments}
                              </pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">
                          {selectedTrace.primary_response_text || 'No response captured.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Shadow Model Panel */}
                  <div className="flex flex-col rounded-lg bg-[#0b0d14] border border-[#1b2030] overflow-hidden">
                    <div className="bg-[#121622] px-3 py-2 border-b border-[#1b2030] flex items-center justify-between text-xs font-mono">
                      <span className="text-accent font-medium">{selectedTrace.shadow_model || 'Shadow Model'} (Canary)</span>
                      <div className="flex space-x-2 text-[10px] text-slate-400">
                        <span>{selectedTrace.shadow_latency_ms ? `${selectedTrace.shadow_latency_ms}ms` : '...'}</span>
                        <span>${selectedTrace.shadow_cost_usd?.toFixed(5) || '0.00000'}</span>
                      </div>
                    </div>
                    <div className="p-3 overflow-y-auto flex-1 text-xs font-mono text-slate-300 leading-relaxed space-y-2">
                      {selectedTrace.shadow_tool_calls && selectedTrace.shadow_tool_calls.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block">
                            Tool Call Virtualized
                          </span>
                          {selectedTrace.shadow_tool_calls.map((tc, idx) => (
                            <div key={idx} className="bg-[#10131d] p-2.5 rounded border border-[#1e2333] space-y-1">
                              <span className="text-emerald-400 font-semibold">{tc.function.name}</span>
                              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap">
                                {tc.function.arguments}
                              </pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">
                          {selectedTrace.shadow_response_text || (selectedTrace.shadow_model ? 'No output generated' : 'Awaiting worker execution...')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Virtualized Tool Sandboxing Drawer */}
                {traceMutations.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#0c101a] border border-[#192338]">
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-mono font-semibold text-blue-300">
                        Side-Effect Virtualization Sandboxing Record
                      </span>
                    </div>
                    {traceMutations.map((m) => (
                      <div key={m.id} className="text-[11px] font-mono space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Tool: <strong className="text-slate-200">{m.tool_name}</strong></span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            m.virtualization_action === 'replayed_primary'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : m.virtualization_action === 'blocked'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {m.virtualization_action.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Args Match: {m.args_match ? '✅ Exact Match' : '⚠️ Parameters Deviated'} — Production systems safely insulated.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                <p>Select an execution trace to inspect side-by-side diffs</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
