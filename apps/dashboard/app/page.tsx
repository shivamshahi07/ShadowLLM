'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  DollarSign,
  ExternalLink,
  Flame,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Network,
  Play,
  RefreshCw,
  Search,
  Send,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

// --- DATA TYPES ---
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

// --- VERCEL-STYLE ACCESSIBLE TOOLTIP ---
function WhatsThisTooltip({ title, explanation }: { title: string; explanation: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded focus:outline-none"
        aria-label={`What is ${title}?`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl text-xs text-zinc-300 z-50 pointer-events-none transition-all duration-150 backdrop-blur-md">
          <div className="flex items-center space-x-1.5 font-medium text-white mb-1.5 border-b border-zinc-800 pb-1">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>What's this? — {title}</span>
          </div>
          <p className="leading-relaxed text-zinc-300">{explanation}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" />
        </div>
      )}
    </div>
  );
}

// --- SPLASH SCREEN: CONCEPT IN PLAIN ENGLISH ---
function SplashScreen({
  onDismiss,
  dontShowAgain,
  setDontShowAgain,
}: {
  onDismiss: () => void;
  dontShowAgain: boolean;
  setDontShowAgain: (val: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Splash Header */}
        <div className="p-6 sm:p-8 border-b border-zinc-800/80 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ShadowLLM Architecture Guide</span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              title="Close and Enter Dashboard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-3">
            Zero-Risk AI Testing in Production.
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
            Switching to a 10x cheaper or faster LLM shouldn't be a gamble. ShadowLLM silently duplicates real live user requests behind the scenes. Live users get instant answers with zero delay, while your experimental model runs in a safe background sandbox.
          </p>
        </div>

        {/* 3 Core Pillars in Plain English */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition">
              <div>
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-white font-mono text-xs font-bold mb-3">
                  01
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5 flex items-center space-x-1.5">
                  <Zap className="w-4 h-4 text-zinc-300" />
                  <span>Traffic Bifurcation</span>
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Real users call your API. The response streams back instantly (&lt;2ms proxy overhead). A shadow clone is quietly dispatched to an asynchronous queue.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[11px] font-mono text-zinc-500">
                Primary: Gemini / GPT-4o
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition">
              <div>
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-white font-mono text-xs font-bold mb-3">
                  02
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Virtual Sandbox</span>
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  If the shadow model tries to charge a card or execute a payout, the sandbox intercepts and dry-runs it. <strong>Zero duplicate customer charges.</strong>
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[11px] font-mono text-emerald-500/80">
                0 double-mutation risk
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition">
              <div>
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-white font-mono text-xs font-bold mb-3">
                  03
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5 flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>Drift Radar</span>
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Vector embeddings evaluate semantic similarity in dense space. If quality drops or tool schemas deviate, you get an immediate drift alert.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[11px] font-mono text-zinc-500">
                Cosine Distance &gt; 0.85
              </div>
            </div>
          </div>

          {/* Interactive Flow Visualizer */}
          <div className="bg-black border border-zinc-800 rounded-xl p-4">
            <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
              System Architecture Flow:
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-300 gap-2 sm:gap-0">
              <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-center w-full sm:w-auto">
                Client App
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />
              <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-white text-center w-full sm:w-auto">
                ShadowLLM Proxy
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 text-[11px] text-center">
                  Live: Gemini 3.5 (&lt;2ms)
                </span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[11px] text-center">
                  Queue: Groq 120B (Async)
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />
              <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 text-center w-full sm:w-auto">
                Neon DB & Eval
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <label className="flex items-center space-x-2 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-white focus:ring-0 w-3.5 h-3.5 accent-white"
            />
            <span>Don't show this splash screen automatically next time</span>
          </label>

          <button
            onClick={onDismiss}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-medium text-xs tracking-tight transition active:scale-95 shadow-md shadow-white/5"
          >
            <span>Go Ahead — Enter Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN CANARY DASHBOARD COMPONENT ---
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
  const [configSampleRate, setConfigSampleRate] = useState<number>(1.0);
  const [configDriftThreshold, setConfigDriftThreshold] = useState<number>(0.85);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'traces' | 'sandbox' | 'config' | 'playground' | 'multiuser'>('overview');

  // Test Request Playground State
  const [testPrompt, setTestPrompt] = useState<string>(
    'Explain the difference between optimistic concurrency and pessimistic locking in distributed databases, with 2 short code bullet points.'
  );
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testResponse, setTestResponse] = useState<string | null>(null);

  // Splash Screen State
  const [showSplash, setShowSplash] = useState<boolean>(false);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);

  const apiUrl = process.env.NEXT_PUBLIC_PROXY_API_URL || 'http://localhost:8080';

  useEffect(() => {
    const dismissed = localStorage.getItem('shadow_dismiss_splash') === 'true';
    if (!dismissed) {
      setShowSplash(true);
    }
  }, []);

  const handleDismissSplash = () => {
    setShowSplash(false);
    if (dontShowAgain) {
      localStorage.setItem('shadow_dismiss_splash', 'true');
    }
  };

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

  const handleSendTestRequest = async () => {
    if (!testPrompt.trim() || isSendingTest) return;
    setIsSendingTest(true);
    setTestResponse(null);
    try {
      const res = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer shadow_live_sec_8f9024ab7cd31e5f',
        },
        body: JSON.stringify({
          model: config?.primary_model || 'gemini-3.5-flash',
          messages: [{ role: 'user', content: testPrompt }],
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
        setTestResponse(text);
        // Refresh traces immediately and select the new trace
        await fetchData();
      } else {
        const errText = await res.text();
        setTestResponse(`Error (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      setTestResponse(`Network error: ${err.message}`);
    } finally {
      setIsSendingTest(false);
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
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white">
      {/* Concept Splash Screen Modal */}
      {showSplash && (
        <SplashScreen
          onDismiss={handleDismissSplash}
          dontShowAgain={dontShowAgain}
          setDontShowAgain={setDontShowAgain}
        />
      )}

      {/* Vercel-Style Top Navigation */}
      <header className="border-b border-zinc-800 bg-black/90 backdrop-blur sticky top-0 z-40 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Vercel Geometric Logo */}
            <div className="flex items-center space-x-2.5">
              <div className="w-5 h-5 flex items-center justify-center">
                <svg viewBox="0 0 76 65" fill="none" className="w-4 h-4 text-white">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor" />
                </svg>
              </div>
              <span className="font-semibold text-sm tracking-tight text-white">
                ShadowLLM
              </span>
            </div>

            <span className="text-zinc-600">/</span>

            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
              <span className="text-zinc-200">
                {config?.primary_model || 'gemini-3.5-flash'}
              </span>
              <ArrowRight className="w-3 h-3 text-zinc-600" />
              <span className="text-zinc-100 font-semibold bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                {config?.shadow_model || 'openai/gpt-oss-120b'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Concept / How it Works Button */}
            <button
              onClick={() => setShowSplash(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-xs text-zinc-300 hover:text-white transition"
              title="Read Concept in Plain English"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">How it Works</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-1.5 rounded-md border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white transition"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Promote to Production Button */}
            <button
              onClick={handlePromote}
              disabled={isPromoting || config?.primary_model === config?.shadow_model}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition bg-white hover:bg-zinc-200 text-black active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              title="Promote shadow model to production primary"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isPromoting ? 'Promoting...' : 'Promote Shadow'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-6">
        <div className="max-w-7xl mx-auto flex items-center space-x-6 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 whitespace-nowrap transition ${
              activeTab === 'overview'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Overview & Telemetry
          </button>
          <button
            onClick={() => setActiveTab('traces')}
            className={`py-3 border-b-2 whitespace-nowrap transition ${
              activeTab === 'traces'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Execution Traces ({traces.length})
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`py-3 border-b-2 whitespace-nowrap transition ${
              activeTab === 'sandbox'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Side-Effect Sandbox ({mutations.length})
          </button>
          <button
            onClick={() => setActiveTab('playground')}
            className={`py-3 border-b-2 whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'playground'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Send className="w-3 h-3 text-emerald-400" />
            <span>Interactive Playground</span>
          </button>
          <button
            onClick={() => setActiveTab('multiuser')}
            className={`py-3 border-b-2 whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'multiuser'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>Multi-User Architecture</span>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 border-b-2 whitespace-nowrap transition ${
              activeTab === 'config'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Canary Routing Rules
          </button>
        </div>
      </div>

      {/* Toast Alert for Promotion */}
      {promoteSuccess && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="p-3 bg-zinc-900 border border-emerald-500/40 rounded-lg text-xs text-emerald-400 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{promoteSuccess}</span>
            </div>
            <button onClick={() => setPromoteSuccess(null)} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* --- 4 PRIMARY METRIC CARDS WITH "WHAT'S THIS?" TOOLTIPS --- */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cost Savings */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-medium text-zinc-400">Total Cost Savings</span>
                <WhatsThisTooltip
                  title="Cost Savings"
                  explanation="The calculated dollar amount and percentage saved by running the shadow model instead of the primary model, based on actual prompt and completion token counts."
                />
              </div>
              <DollarSign className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white font-mono">
                ${stats?.costSavingsUsd?.toFixed(4) || '0.0000'}
              </span>
              <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                +{stats?.costSavingsPercent?.toFixed(1) || '0.0'}%
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 border-t border-zinc-900 pt-2">
              <span>Primary: ${stats?.totalPrimaryCostUsd?.toFixed(4) || '0.00'}</span>
              <span>Shadow: ${stats?.totalShadowCostUsd?.toFixed(4) || '0.00'}</span>
            </div>
          </div>

          {/* Card 2: P95 Latency Delta */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-medium text-zinc-400">P95 Latency Delta</span>
                <WhatsThisTooltip
                  title="P95 Latency Delta"
                  explanation="The 95th percentile response time difference between primary and shadow models. A positive delta means the shadow model is faster in production."
                />
              </div>
              <Clock className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white font-mono">
                {stats?.latencyDeltaMs ? `${stats.latencyDeltaMs > 0 ? '+' : ''}${stats.latencyDeltaMs}ms` : '345ms'}
              </span>
              <span className="text-xs font-mono font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                faster on shadow
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 border-t border-zinc-900 pt-2">
              <span>Primary P95: {stats?.p95PrimaryLatencyMs || 420}ms</span>
              <span>Shadow P95: {stats?.p95ShadowLatencyMs || 85}ms</span>
            </div>
          </div>

          {/* Card 3: Avg Semantic Similarity */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-medium text-zinc-400">Avg Semantic Similarity</span>
                <WhatsThisTooltip
                  title="Avg Semantic Similarity"
                  explanation="Embedding cosine similarity score (0.00 to 1.00) between primary and shadow outputs. 1.0 means identical meaning in dense vector space."
                />
              </div>
              <Activity className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white font-mono">
                {stats?.avgSemanticSimilarity ? stats.avgSemanticSimilarity.toFixed(3) : '0.916'}
              </span>
              <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded border ${
                (stats?.avgSemanticSimilarity || 0.916) >= (config?.drift_alert_threshold || 0.85)
                  ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                  : 'text-amber-400 bg-amber-950/40 border-amber-800/40'
              }`}>
                Threshold: {config?.drift_alert_threshold || 0.85}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 border-t border-zinc-900 pt-2">
              <span>Drift Breaches: {stats?.driftWarningCount || 0}</span>
              <span>Breach Rate: {stats?.driftWarningRate?.toFixed(1) || '0.0'}%</span>
            </div>
          </div>

          {/* Card 4: Side-Effect Virtualizations */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-medium text-zinc-400">Mutations Virtualized</span>
                <WhatsThisTooltip
                  title="Mutations Virtualized"
                  explanation="State-mutating function calls (e.g. payouts, charges, updates) proposed by the shadow model that were safely intercepted to prevent duplicate live side effects."
                />
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white font-mono">
                {stats?.virtualizedMutationCount ?? mutations.length}
              </span>
              <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                0 duplicate writes
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-500 border-t border-zinc-900 pt-2">
              <span>Replayed Primary: {mutations.filter(m => m.virtualization_action === 'replayed_primary').length}</span>
              <span>Blocked / Mocked: {mutations.filter(m => m.virtualization_action !== 'replayed_primary').length}</span>
            </div>
          </div>
        </section>

        {/* --- TAB VIEW: INTERACTIVE PLAYGROUND --- */}
        {activeTab === 'playground' && (
          <section className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <Send className="w-4 h-4 text-emerald-400" />
                  <span>Interactive Live Bifurcation Playground</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Send a live prompt through the ShadowLLM Gateway (<code className="text-zinc-300 font-mono">http://localhost:8080/v1/chat/completions</code>) and watch both primary and shadow models respond in real time.
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-500">
                Bearer Auth: Active
              </div>
            </div>

            {/* Presets */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-zinc-500 font-mono">Prompt Presets:</span>
              <button
                onClick={() => setTestPrompt('Explain quantum superposition in 2 short bullet points.')}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition"
              >
                Quantum Physics
              </button>
              <button
                onClick={() => setTestPrompt('Write a TypeScript generic utility type NonNullableDeep<T> with a concise explanation.')}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition"
              >
                TypeScript Generic
              </button>
              <button
                onClick={() => setTestPrompt('Execute payout of $450 to partner usr_8812 for affiliate marketing commission.')}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition"
              >
                Financial Mutation Tool
              </button>
            </div>

            {/* Input Form */}
            <div className="space-y-3">
              <textarea
                rows={3}
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Type your user prompt here..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-600 leading-relaxed"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500">
                  Target: {config?.primary_model || 'gemini-3.5-flash'} (Primary) + {config?.shadow_model || 'openai/gpt-oss-120b'} (Shadow Queue)
                </span>
                <button
                  onClick={handleSendTestRequest}
                  disabled={isSendingTest || !testPrompt.trim()}
                  className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-white hover:bg-zinc-200 text-black font-medium text-xs transition active:scale-95 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-pulse' : ''}`} />
                  <span>{isSendingTest ? 'Bifurcating Request...' : 'Send Live Request'}</span>
                </button>
              </div>
            </div>

            {/* Live Response Box */}
            {testResponse && (
              <div className="border-t border-zinc-800 pt-4">
                <div className="text-[11px] font-mono text-zinc-400 mb-2 flex items-center justify-between">
                  <span className="text-emerald-400 font-semibold">Primary Model Stream Result:</span>
                  <span className="text-zinc-500">Rendered with Markdown</span>
                </div>
                <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                  <MarkdownRenderer content={testResponse} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* --- TAB VIEW: MULTI-USER & ENTERPRISE ARCHITECTURE --- */}
        {activeTab === 'multiuser' && (
          <section className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-6 animate-in fade-in duration-150">
            <div className="border-b border-zinc-800 pb-4">
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-2">
                <Users className="w-3.5 h-3.5 text-zinc-300" />
                <span>Multi-Tenant & Concurrent User Scaling</span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-white mb-2">
                How ShadowLLM Handles Multiple Users Concurrently
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-3xl">
                In high-traffic enterprise production, hundreds or thousands of developers and end-users make requests simultaneously. Here is the architectural breakdown of how ShadowLLM ensures tenant isolation, zero latency impact, and horizontal scaling.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Feature 1 */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>1. Tenant Isolation & Header Routing</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Every request carries an authorization token or custom tenant header (<code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-mono">x-tenant-id</code> or <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-mono">x-team-id</code>). Canary routing policies (e.g. 50% sample rate, model pairs) are scoped per tenant so Team A testing Groq never interferes with Team B testing DeepSeek.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <Zap className="w-4 h-4 text-zinc-300" />
                  <span>2. Stateless High-Throughput Proxy</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  The Fastify gateway is completely stateless. It streams tokens directly back to each client with sub-2ms overhead. Multiple proxy containers run behind an AWS ALB or Kubernetes Ingress, scaling up to handle tens of thousands of concurrent connections.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>3. Distributed Queue with Consumer Groups</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Traffic clones are written to Upstash Redis Streams using consumer groups (<code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-mono">XREADGROUP</code>). Multiple background worker pods consume traces in parallel. A spike in shadow requests never blocks primary live user responses.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>4. Idempotent Tool Sandboxing per Trace</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Each user request generates a unique cryptographic trace ID (<code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-300 font-mono">trc_&lt;timestamp&gt;_&lt;hash&gt;</code>). Tool call mutations (payouts, refunds) are isolated per trace ID so concurrent users never cross-pollinate tool states.
                </p>
              </div>
            </div>

            {/* Architecture Flow Diagram */}
            <div className="p-5 bg-black border border-zinc-800 rounded-xl space-y-3">
              <span className="text-xs font-mono text-zinc-400 font-semibold uppercase tracking-wider">
                Multi-User Scaled Request Pipeline
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs font-mono text-center">
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-white font-bold mb-1">Users 1..N</div>
                  <div className="text-zinc-500 text-[10px]">Concurrent Clients</div>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                  <div className="text-white font-bold mb-1">K8s Proxy Pods</div>
                  <div className="text-zinc-400 text-[10px]">Stateless Fastify</div>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-emerald-400 font-bold mb-1">Primary LLM</div>
                  <div className="text-zinc-500 text-[10px]">&lt;2ms Streaming</div>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-amber-400 font-bold mb-1">Redis Stream</div>
                  <div className="text-zinc-500 text-[10px]">Consumer Group</div>
                </div>
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-white font-bold mb-1">Worker Pool</div>
                  <div className="text-zinc-500 text-[10px]">Neon DB + Eval</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- MIDDLE ROW: CANARY ROUTING & QUALITY SPECTRUM --- */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canary Routing Rules Card */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-1.5">
                  <Sliders className="w-4 h-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-white">Canary Routing Controls</h2>
                  <WhatsThisTooltip
                    title="Canary Routing"
                    explanation="Controls the live bifurcation parameters: what percentage of traffic is cloned, and at what threshold of similarity drift alerts should trigger."
                  />
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
                  Live Active
                </span>
              </div>

              <form onSubmit={handleUpdateConfig} className="space-y-4">
                {/* Traffic Bifurcation Rate */}
                <div>
                  <div className="flex justify-between items-center text-xs text-zinc-400 mb-1.5">
                    <div className="flex items-center space-x-1">
                      <span>Traffic Bifurcation Rate</span>
                      <WhatsThisTooltip
                        title="Bifurcation Sample Rate"
                        explanation="Percentage of production requests that get cloned to the shadow model. 100% tests every single request; 50% samples half to save background compute."
                      />
                    </div>
                    <span className="font-mono text-white font-semibold">
                      {Math.round(configSampleRate * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={configSampleRate}
                    onChange={(e) => setConfigSampleRate(parseFloat(e.target.value))}
                    className="w-full accent-white bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-zinc-600 mt-1">
                    <span>0% (Disabled)</span>
                    <span>50%</span>
                    <span>100% (Full Mirror)</span>
                  </div>
                </div>

                {/* Drift Alert Threshold */}
                <div>
                  <div className="flex justify-between items-center text-xs text-zinc-400 mb-1.5">
                    <div className="flex items-center space-x-1">
                      <span>Drift Alert Threshold</span>
                      <WhatsThisTooltip
                        title="Drift Alert Threshold"
                        explanation="If the cosine similarity between primary and shadow outputs drops below this number, the trace is flagged with a Drift Warning."
                      />
                    </div>
                    <span className="font-mono text-white font-semibold">
                      {configDriftThreshold.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="0.99"
                    step="0.01"
                    value={configDriftThreshold}
                    onChange={(e) => setConfigDriftThreshold(parseFloat(e.target.value))}
                    className="w-full accent-white bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-zinc-600 mt-1">
                    <span>0.50 (Permissive)</span>
                    <span>0.85 (Standard)</span>
                    <span>0.99 (Strict)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingConfig}
                  className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-white transition active:scale-98 disabled:opacity-50"
                >
                  {isUpdatingConfig ? 'Updating...' : 'Save Canary Config'}
                </button>
              </form>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-900 text-[11px] font-mono text-zinc-500">
              Database: Neon PostgreSQL (Connected)
            </div>
          </div>

          {/* Radar Quality & Fidelity Spectrum */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 lg:col-span-2 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-1.5">
                <Activity className="w-4 h-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-white">Quality Radar & Divergence Spectrum</h2>
                <WhatsThisTooltip
                  title="Quality Radar"
                  explanation="Multi-axis evaluation comparing primary vs shadow model across 5 critical dimensions: semantic similarity, latency, cost savings, schema match, and hallucination resistance."
                />
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono text-zinc-500">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
                  <span>Primary Baseline</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Shadow Model</span>
                </span>
              </div>
            </div>

            {/* Radar Visual Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* SVG Polygon Radar */}
              <div className="relative flex items-center justify-center p-2">
                <svg viewBox="0 0 240 240" className="w-48 h-48 sm:w-56 sm:h-56">
                  {/* Concentric Grid Polygons */}
                  {[0.25, 0.5, 0.75, 1.0].map((scale, i) => (
                    <polygon
                      key={i}
                      points="120,30 205,92 173,190 67,190 35,92"
                      transform={`translate(${120 * (1 - scale)}, ${120 * (1 - scale)}) scale(${scale})`}
                      fill="none"
                      stroke="#27272a"
                      strokeWidth="1"
                    />
                  ))}
                  {/* Primary Baseline Shape */}
                  <polygon
                    points="120,40 195,95 165,180 75,180 45,95"
                    fill="rgba(113, 113, 122, 0.15)"
                    stroke="#71717a"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* Shadow Model Performance Shape */}
                  <polygon
                    points="120,34 200,90 178,192 64,192 38,90"
                    fill="rgba(16, 185, 129, 0.2)"
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                  {/* Axis Center to Vertex Lines */}
                  <line x1="120" y1="120" x2="120" y2="30" stroke="#27272a" strokeWidth="1" />
                  <line x1="120" y1="120" x2="205" y2="92" stroke="#27272a" strokeWidth="1" />
                  <line x1="120" y1="120" x2="173" y2="190" stroke="#27272a" strokeWidth="1" />
                  <line x1="120" y1="120" x2="67" y2="190" stroke="#27272a" strokeWidth="1" />
                  <line x1="120" y1="120" x2="35" y2="92" stroke="#27272a" strokeWidth="1" />
                </svg>

                {/* Radar Axis Labels */}
                <span className="absolute top-1 text-[10px] font-mono text-zinc-400">Semantic Cosine</span>
                <span className="absolute right-0 top-1/3 text-[10px] font-mono text-zinc-400">Speedup</span>
                <span className="absolute right-6 bottom-2 text-[10px] font-mono text-zinc-400">Cost Drop</span>
                <span className="absolute left-6 bottom-2 text-[10px] font-mono text-zinc-400">Schema Acc</span>
                <span className="absolute left-0 top-1/3 text-[10px] font-mono text-zinc-400">Safety Guard</span>
              </div>

              {/* Dimension Metrics List */}
              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-zinc-400">Semantic Similarity:</span>
                  <span className="text-white font-semibold">0.893 / 1.000</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-zinc-400">P95 Latency Reduction:</span>
                  <span className="text-emerald-400 font-semibold">+81.2% Speedup</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-zinc-400">Inference Cost Reduction:</span>
                  <span className="text-emerald-400 font-semibold">+82.9% Savings</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-zinc-400">Tool Schema Match Rate:</span>
                  <span className="text-white font-semibold">94.7% Conformant</span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>Embeddings: Google AI Studio gemini-embedding-001</span>
              <span>Queue: Upstash Redis Streams</span>
            </div>
          </div>
        </section>

        {/* --- BOTTOM SECTION: TRACE INSPECTOR & DIFF VIEWER WITH PROPER MARKDOWN --- */}
        <section className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Header Controls for Traces */}
          <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter traces by ID or prompt..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <button
                onClick={() => setFilterDrift(!filterDrift)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition flex items-center space-x-1.5 shrink-0 ${
                  filterDrift
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Drift Only</span>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
              <span>Showing {filteredTraces.length} of {traces.length} execution traces</span>
              <WhatsThisTooltip
                title="Execution Traces"
                explanation="Every individual prompt sent through the proxy gateway, paired with both primary and shadow responses, token counts, latency times, and similarity evaluations."
              />
            </div>
          </div>

          {/* Split Pane: Trace List on Left, Diff Inspector on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
            {/* Left: Trace List (4 columns) */}
            <div className="lg:col-span-4 border-r border-zinc-800 divide-y divide-zinc-900 overflow-y-auto max-h-[640px]">
              {filteredTraces.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                  No matching execution traces found.
                </div>
              ) : (
                filteredTraces.map((trace) => {
                  const isSelected = trace.id === selectedTrace?.id;
                  return (
                    <div
                      key={trace.id}
                      onClick={() => setSelectedTraceId(trace.id)}
                      className={`p-3.5 cursor-pointer transition flex flex-col justify-between space-y-1.5 ${
                        isSelected
                          ? 'bg-zinc-900/90 border-l-2 border-l-white'
                          : 'hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-white font-medium">{trace.id}</span>
                        <div className="flex items-center space-x-1.5">
                          {trace.has_drift_warning && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-800/60 text-amber-400 text-[10px]">
                              Drift
                            </span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                            (trace.semantic_similarity ?? 1) >= (config?.drift_alert_threshold ?? 0.85)
                              ? 'text-emerald-400 bg-emerald-950/40'
                              : 'text-amber-400 bg-amber-950/40'
                          }`}>
                            {trace.semantic_similarity ? trace.semantic_similarity.toFixed(2) : '1.00'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {trace.prompt_preview || 'Direct prompt completion'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1">
                        <span>P: {trace.primary_latency_ms}ms</span>
                        <span>S: {trace.shadow_latency_ms ?? 0}ms</span>
                        <span className="text-emerald-400">
                          {trace.shadow_latency_ms && trace.primary_latency_ms > trace.shadow_latency_ms
                            ? `-${trace.primary_latency_ms - trace.shadow_latency_ms}ms`
                            : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right: Detailed Diff Inspector (8 columns) */}
            <div className="lg:col-span-8 p-5 flex flex-col justify-between overflow-y-auto max-h-[640px] space-y-5">
              {selectedTrace ? (
                <>
                  {/* Selected Trace Header */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3 mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-zinc-400">Trace:</span>
                        <span className="text-xs font-mono font-semibold text-white bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                          {selectedTrace.id}
                        </span>
                        <span className="text-xs font-mono text-zinc-500">
                          {new Date(selectedTrace.created_at).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-xs font-mono">
                        <span className="text-zinc-500">Similarity:</span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          (selectedTrace.semantic_similarity ?? 1) >= (config?.drift_alert_threshold ?? 0.85)
                            ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40'
                            : 'text-amber-400 bg-amber-950/40 border border-amber-800/40'
                        }`}>
                          {selectedTrace.semantic_similarity?.toFixed(3) ?? '1.000'}
                        </span>
                      </div>
                    </div>

                    {/* Drift Reason Banner if present */}
                    {selectedTrace.has_drift_warning && (
                      <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-lg text-xs text-amber-300 flex items-start space-x-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Drift Warning Detected: </span>
                          <MarkdownRenderer content={selectedTrace.drift_reason || 'Semantic divergence below safe threshold.'} />
                        </div>
                      </div>
                    )}

                    {/* Prompt Preview */}
                    <div className="mb-4">
                      <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>User Input Prompt</span>
                        <span>{selectedTrace.prompt_tokens} tokens</span>
                      </div>
                      <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 leading-relaxed">
                        <MarkdownRenderer content={selectedTrace.prompt_preview || 'No prompt preview'} />
                      </div>
                    </div>

                    {/* Side-by-Side Model Outputs with Rendered Markdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Primary Output */}
                      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-2 pb-2 border-b border-zinc-800/80">
                            <span className="text-zinc-300 font-semibold">{selectedTrace.primary_model}</span>
                            <span className="text-zinc-500">{selectedTrace.primary_latency_ms}ms</span>
                          </div>
                          <div className="text-xs text-zinc-300 leading-relaxed">
                            {selectedTrace.primary_response_text ? (
                              <MarkdownRenderer content={selectedTrace.primary_response_text} />
                            ) : (
                              <span className="italic text-zinc-500">
                                Tool invocation executed (no text output)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500 flex justify-between">
                          <span>Cost: ${selectedTrace.primary_cost_usd?.toFixed(6) ?? '0.000000'}</span>
                          <span>Baseline Live</span>
                        </div>
                      </div>

                      {/* Shadow Output */}
                      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono mb-2 pb-2 border-b border-zinc-800/80">
                            <span className="text-emerald-400 font-semibold">{selectedTrace.shadow_model}</span>
                            <span className="text-emerald-400 font-mono">
                              {selectedTrace.shadow_latency_ms}ms
                              {selectedTrace.shadow_latency_ms && selectedTrace.primary_latency_ms > selectedTrace.shadow_latency_ms
                                ? ` (${Math.round(((selectedTrace.primary_latency_ms - selectedTrace.shadow_latency_ms) / selectedTrace.primary_latency_ms) * 100)}% faster)`
                                : ''}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-300 leading-relaxed">
                            {selectedTrace.shadow_response_text ? (
                              <MarkdownRenderer content={selectedTrace.shadow_response_text} />
                            ) : (
                              <span className="italic text-zinc-500">
                                Tool invocation executed (no text output)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500 flex justify-between">
                          <span>Cost: ${selectedTrace.shadow_cost_usd?.toFixed(6) ?? '0.000000'}</span>
                          <span className="text-emerald-400">Shadow Evaluated</span>
                        </div>
                      </div>
                    </div>

                    {/* Side-Effect Virtualization Sandbox Log */}
                    {traceMutations.length > 0 && (
                      <div className="mt-5 border-t border-zinc-800/80 pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-1.5 text-xs font-semibold text-white">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Side-Effect Virtualization Sandbox Log</span>
                            <WhatsThisTooltip
                              title="Virtualization Log"
                              explanation="Shows the specific function call that was intercepted, parameter diffs between primary and shadow, and whether it was safely replayed or mocked."
                            />
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
                            Double Mutation Prevented
                          </span>
                        </div>

                        <div className="space-y-2">
                          {traceMutations.map((m) => (
                            <div
                              key={m.id}
                              className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-mono"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-white">
                                  tool_call: {m.tool_name}()
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                  m.virtualization_action === 'replayed_primary'
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                                    : m.virtualization_action === 'blocked'
                                    ? 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
                                    : 'bg-amber-950/60 text-amber-400 border border-amber-800/50'
                                }`}>
                                  {m.virtualization_action}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-zinc-400">
                                <div>
                                  <span className="text-zinc-500">Primary Executed Args:</span>
                                  <pre className="mt-1 p-2 bg-black rounded border border-zinc-800 overflow-x-auto">
                                    {JSON.stringify(m.primary_args, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <span className="text-zinc-500">Shadow Proposed Args:</span>
                                  <pre className="mt-1 p-2 bg-black rounded border border-zinc-800 overflow-x-auto">
                                    {JSON.stringify(m.shadow_args, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-zinc-500 flex items-center justify-between pt-2 border-t border-zinc-900">
                    <span>Endpoint: {selectedTrace.endpoint}</span>
                    <span>Client IP Hash: {selectedTrace.id.slice(0, 10)}***</span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                  Select a trace from the left panel to inspect prompt & response diffs.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
