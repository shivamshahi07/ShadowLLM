'use client';

import React, { useState } from 'react';
import {
  Award,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Cpu,
  Flame,
  HelpCircle,
  Play,
  RotateCcw,
  Scale,
  Sparkles,
  Split,
  Trophy,
  Zap,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Tooltip } from './Tooltip';

export type PromptTestMode =
  | 'same_model_diff_prompt'
  | 'diff_model_same_prompt'
  | 'diff_model_diff_prompt';

interface PromptTargetResult {
  model: string;
  prompt: string;
  systemPrompt?: string;
  content: string;
  latencyMs: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  costUsd: number;
  rating?: number;
  feedback?: string;
}

interface JudgeResult {
  winner: 'target_a' | 'target_b' | 'tie';
  verdict: string;
  summary: string;
  targetARating: number;
  targetBRating: number;
  targetAFeedback: string;
  targetBFeedback: string;
  criteriaAnalysis: {
    accuracy: string;
    clarity: string;
    adherence: string;
    efficiency: string;
  };
  judgeModel: string;
  latencyMs: number;
}

interface ComparisonResponse {
  mode: PromptTestMode;
  targetA: PromptTargetResult;
  targetB: PromptTargetResult;
  judge: JudgeResult;
  timestamp: string;
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Google)', group: 'Primary / Production' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (Google)', group: 'Fast & Lightweight' },
  { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B (Groq)', group: 'Open Weights' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', group: 'Open Weights' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Groq)', group: 'Fast & Lightweight' },
  { id: 'gpt-4o', label: 'GPT-4o (OpenAI)', group: 'Flagship' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)', group: 'Fast & Lightweight' },
];

const PRESET_SCENARIOS: Record<
  PromptTestMode,
  {
    title: string;
    description: string;
    targetA: { model: string; systemPrompt: string; prompt: string };
    targetB: { model: string; systemPrompt: string; prompt: string };
  }
> = {
  same_model_diff_prompt: {
    title: 'Same Model, Different Prompts',
    description:
      'Compare how two prompt variations (e.g., loose baseline vs strictly structured chain-of-thought) perform on the exact same model.',
    targetA: {
      model: 'gemini-3.5-flash',
      systemPrompt: 'You are a general technical assistant.',
      prompt:
        'Explain distributed database sharding strategies and what pitfalls teams encounter.',
    },
    targetB: {
      model: 'gemini-3.5-flash',
      systemPrompt:
        'You are a staff distributed systems architect. Provide concise, bulleted, actionable insights with a comparative trade-off matrix.',
      prompt:
        'Compare Hash Sharding vs Range Sharding in distributed databases. Provide 2 bullet pros/cons and 1 operational failure mode.',
    },
  },
  diff_model_same_prompt: {
    title: 'Different Models, Same Prompt',
    description:
      'Evaluate whether a cost-effective open-source or flash model matches the output quality and reasoning of a primary model on identical input.',
    targetA: {
      model: 'gemini-3.5-flash',
      systemPrompt: 'You are a precise backend engineer.',
      prompt:
        'Write a robust TypeScript helper that implements an exponential backoff retry wrapper for HTTP requests with jitter. Keep it under 25 lines.',
    },
    targetB: {
      model: 'openai/gpt-oss-120b',
      systemPrompt: 'You are a precise backend engineer.',
      prompt:
        'Write a robust TypeScript helper that implements an exponential backoff retry wrapper for HTTP requests with jitter. Keep it under 25 lines.',
    },
  },
  diff_model_diff_prompt: {
    title: 'Different Models, Different Prompts',
    description:
      'Benchmark model-specific prompt engineering (e.g. customized system instructions tuned for Groq Llama vs Gemini).',
    targetA: {
      model: 'gemini-3.5-flash',
      systemPrompt:
        'You are an AI platform optimizer. Focus on raw mathematical throughput and minimal token output.',
      prompt:
        'Summarize the CAP theorem and explain why PACELC is a more realistic model for modern cloud databases.',
    },
    targetB: {
      model: 'openai/gpt-oss-120b',
      systemPrompt:
        'You are an expert systems mentor. Use clear analogies and structured section headers.',
      prompt:
        'Explain the trade-offs of the CAP theorem and how PACELC extends it for latency in normal operations. Give a concrete real-world example.',
    },
  },
};

export function PromptTester({ apiUrl }: { apiUrl: string }) {
  const [mode, setMode] = useState<PromptTestMode>('same_model_diff_prompt');

  // Target A state
  const [modelA, setModelA] = useState<string>(PRESET_SCENARIOS.same_model_diff_prompt.targetA.model);
  const [systemPromptA, setSystemPromptA] = useState<string>(
    PRESET_SCENARIOS.same_model_diff_prompt.targetA.systemPrompt
  );
  const [promptA, setPromptA] = useState<string>(
    PRESET_SCENARIOS.same_model_diff_prompt.targetA.prompt
  );

  // Target B state
  const [modelB, setModelB] = useState<string>(PRESET_SCENARIOS.same_model_diff_prompt.targetB.model);
  const [systemPromptB, setSystemPromptB] = useState<string>(
    PRESET_SCENARIOS.same_model_diff_prompt.targetB.systemPrompt
  );
  const [promptB, setPromptB] = useState<string>(
    PRESET_SCENARIOS.same_model_diff_prompt.targetB.prompt
  );

  // Judge state
  const [judgeModel] = useState<string>('gemini-3.5-flash-lite');

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Switch mode handler
  const handleSelectMode = (newMode: PromptTestMode) => {
    setMode(newMode);
    const preset = PRESET_SCENARIOS[newMode];
    setModelA(preset.targetA.model);
    setSystemPromptA(preset.targetA.systemPrompt);
    setPromptA(preset.targetA.prompt);
    setModelB(preset.targetB.model);
    setSystemPromptB(preset.targetB.systemPrompt);
    setPromptB(preset.targetB.prompt);
    setResult(null);
    setError(null);
  };

  // Reset to current mode defaults
  const handleReset = () => {
    const preset = PRESET_SCENARIOS[mode];
    setModelA(preset.targetA.model);
    setSystemPromptA(preset.targetA.systemPrompt);
    setPromptA(preset.targetA.prompt);
    setModelB(preset.targetB.model);
    setSystemPromptB(preset.targetB.systemPrompt);
    setPromptB(preset.targetB.prompt);
    setResult(null);
    setError(null);
  };

  // When in diff_model_same_prompt mode, typing in Prompt A can sync with Prompt B if desired
  const handlePromptAChange = (val: string) => {
    setPromptA(val);
    if (mode === 'diff_model_same_prompt') {
      setPromptB(val);
    }
  };

  // Run evaluation
  const handleRunEvaluation = async () => {
    if (!promptA.trim() || !promptB.trim() || isRunning) return;

    setIsRunning(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/prompt-test/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          targetA: {
            model: modelA,
            systemPrompt: systemPromptA,
            prompt: promptA,
          },
          targetB: {
            model: mode === 'same_model_diff_prompt' ? modelA : modelB,
            systemPrompt: systemPromptB,
            prompt: mode === 'diff_model_same_prompt' ? promptA : promptB,
          },
          judgeModel,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Evaluation failed (${res.status}): ${errText}`);
      }

      const data: ComparisonResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error('Prompt evaluation error:', err);
      setError(err.message || 'Failed to complete evaluation');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Explainer */}
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="p-1 rounded bg-black text-white dark:bg-white dark:text-black">
                <Scale className="w-3.5 h-3.5" />
              </span>
              <h2 className="text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
                Multi-Prompt & Cross-Model Evaluator
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80">
                LLM-as-a-Judge Powered
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Test candidate prompts and models side-by-side with instantaneous dual execution. An automated{' '}
              <strong className="text-zinc-900 dark:text-zinc-200 font-semibold">Gemini 3.5 Flash Lite Judge</strong> acts as an impartial reviewer—scoring accuracy, conciseness, and instruction adherence.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Tooltip content="Reset prompts and models to scenario presets" position="bottom">
              <button
                onClick={handleReset}
                disabled={isRunning}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Presets</span>
              </button>
            </Tooltip>

            <Tooltip content="Execute Target A and Target B in parallel, then invoke the Flash Lite Judge" position="bottom" align="right">
              <button
                onClick={handleRunEvaluation}
                disabled={isRunning || !promptA.trim() || !promptB.trim()}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-medium transition shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <BrainCircuit className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating with Judge...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Comparison</span>
                  </>
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Mode Selector Tabs (The 3 combinations requested) */}
        <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
            Select Evaluation Combination
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Mode 1 */}
            <Tooltip content="Keep model identical, test 2 different prompt variations or system prompts">
              <button
                type="button"
                onClick={() => handleSelectMode('same_model_diff_prompt')}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                  mode === 'same_model_diff_prompt'
                    ? 'border-black bg-zinc-50 dark:border-white dark:bg-zinc-900 font-medium text-zinc-950 dark:text-white shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Same Model, Different Prompt</span>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                  Benchmark prompt iterations & system prompt variants
                </div>
              </button>
            </Tooltip>

            {/* Mode 2 */}
            <Tooltip content="Keep prompt identical, test 2 different LLM engines (e.g. Gemini vs Groq OSS)">
              <button
                type="button"
                onClick={() => handleSelectMode('diff_model_same_prompt')}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                  mode === 'diff_model_same_prompt'
                    ? 'border-black bg-zinc-50 dark:border-white dark:bg-zinc-900 font-medium text-zinc-950 dark:text-white shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Different Model, Same Prompt</span>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                  Verify output quality & cost delta on identical input
                </div>
              </button>
            </Tooltip>

            {/* Mode 3 */}
            <Tooltip content="Test 2 distinct models each paired with their own tailored prompt">
              <button
                type="button"
                onClick={() => handleSelectMode('diff_model_diff_prompt')}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                  mode === 'diff_model_diff_prompt'
                    ? 'border-black bg-zinc-50 dark:border-white dark:bg-zinc-900 font-medium text-zinc-950 dark:text-white shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">Different Model, Different Prompt</span>
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                  Model-specific prompt optimization & agent loop testing
                </div>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300">
          <strong>Evaluation Error:</strong> {error}
        </div>
      )}

      {/* Target Configuration Side-by-Side Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Target A Card */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                Target A
              </span>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {mode === 'same_model_diff_prompt' ? 'Prompt Variant 1' : 'Baseline Candidate'}
              </span>
            </div>
            <div className="w-48">
              <select
                value={modelA}
                onChange={(e) => {
                  setModelA(e.target.value);
                  if (mode === 'same_model_diff_prompt') {
                    setModelB(e.target.value);
                  }
                }}
                className="w-full text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-100 focus:outline-none"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={`a-${m.id}`} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">
              System Instructions (Optional)
            </label>
            <input
              type="text"
              value={systemPromptA}
              onChange={(e) => setSystemPromptA(e.target.value)}
              placeholder="e.g. You are a senior software architect..."
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">
              User Prompt
            </label>
            <textarea
              rows={4}
              value={promptA}
              onChange={(e) => handlePromptAChange(e.target.value)}
              placeholder="Enter prompt for Target A..."
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Target B Card */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                Target B
              </span>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {mode === 'same_model_diff_prompt' ? 'Prompt Variant 2' : 'Experimental Candidate'}
              </span>
            </div>
            <div className="w-48">
              <select
                disabled={mode === 'same_model_diff_prompt'}
                value={mode === 'same_model_diff_prompt' ? modelA : modelB}
                onChange={(e) => setModelB(e.target.value)}
                className="w-full text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-100 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={`b-${m.id}`} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">
              System Instructions (Optional)
            </label>
            <input
              type="text"
              value={systemPromptB}
              onChange={(e) => setSystemPromptB(e.target.value)}
              placeholder="e.g. You are a concise, bulleted documentation writer..."
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-zinc-500">
                User Prompt {mode === 'diff_model_same_prompt' && '(Synced with Target A)'}
              </label>
              {mode === 'diff_model_same_prompt' && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  Identical prompt locked
                </span>
              )}
            </div>
            <textarea
              rows={4}
              disabled={mode === 'diff_model_same_prompt'}
              value={mode === 'diff_model_same_prompt' ? promptA : promptB}
              onChange={(e) => setPromptB(e.target.value)}
              placeholder="Enter prompt for Target B..."
              className="w-full text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none font-mono disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* 1. Flash Lite Judge Verdict Card */}
          <div className="bg-gradient-to-r from-amber-500/10 via-zinc-500/5 to-transparent dark:from-amber-400/10 dark:via-zinc-900/50 border border-amber-300/60 dark:border-amber-500/30 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-amber-200/50 dark:border-amber-500/20 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-amber-500 text-white dark:bg-amber-400 dark:text-black">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-950 dark:text-white uppercase tracking-wider">
                      Judge LLM Verdict
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {result.judge.judgeModel}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      evaluated in {result.judge.latencyMs}ms
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {result.judge.verdict}
                  </h3>
                </div>
              </div>

              {/* Winner Badge */}
              <div>
                {result.judge.winner === 'target_a' && (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                    <Award className="w-3.5 h-3.5" />
                    <span>Target A Won</span>
                  </span>
                )}
                {result.judge.winner === 'target_b' && (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                    <Award className="w-3.5 h-3.5" />
                    <span>Target B Won</span>
                  </span>
                )}
                {result.judge.winner === 'tie' && (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700">
                    <span>Equally Matched (Tie)</span>
                  </span>
                )}
              </div>
            </div>

            {/* Judge Summary */}
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
              {result.judge.summary}
            </p>

            {/* Criteria Analysis Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
              <div className="bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                  1. Accuracy & Correctness
                </span>
                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">
                  {result.judge.criteriaAnalysis.accuracy}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                  2. Clarity & Style
                </span>
                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">
                  {result.judge.criteriaAnalysis.clarity}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                  3. Instruction Adherence
                </span>
                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">
                  {result.judge.criteriaAnalysis.adherence}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                  4. Token & Latency Efficiency
                </span>
                <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">
                  {result.judge.criteriaAnalysis.efficiency}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Side-by-Side Outputs with Scores and Markdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target A Output */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                      Target A
                    </span>
                    <span className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {result.targetA.model}
                    </span>
                  </div>

                  {/* Rating Badge */}
                  <div className="flex items-center space-x-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      {result.targetA.rating ?? 8.5} / 10
                    </span>
                  </div>
                </div>

                {/* Feedback Note from Judge */}
                {result.targetA.feedback && (
                  <div className="mb-3 p-2 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <strong className="text-zinc-900 dark:text-zinc-200">Judge Feedback:</strong>{' '}
                    {result.targetA.feedback}
                  </div>
                )}

                {/* Markdown Output */}
                <div className="p-3 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/80 rounded-lg max-h-96 overflow-y-auto">
                  <MarkdownRenderer content={result.targetA.content} />
                </div>
              </div>

              {/* Metrics Footer */}
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{result.targetA.latencyMs}ms</span>
                </span>
                <span>
                  {result.targetA.tokens.prompt} prompt / {result.targetA.tokens.completion} compl.
                </span>
                <span className="flex items-center space-x-1 text-zinc-700 dark:text-zinc-300">
                  <Coins className="w-3 h-3" />
                  <span>${result.targetA.costUsd.toFixed(6)}</span>
                </span>
              </div>
            </div>

            {/* Target B Output */}
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                      Target B
                    </span>
                    <span className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {result.targetB.model}
                    </span>
                  </div>

                  {/* Rating Badge */}
                  <div className="flex items-center space-x-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      {result.targetB.rating ?? 8.5} / 10
                    </span>
                  </div>
                </div>

                {/* Feedback Note from Judge */}
                {result.targetB.feedback && (
                  <div className="mb-3 p-2 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
                    <strong className="text-zinc-900 dark:text-zinc-200">Judge Feedback:</strong>{' '}
                    {result.targetB.feedback}
                  </div>
                )}

                {/* Markdown Output */}
                <div className="p-3 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/80 rounded-lg max-h-96 overflow-y-auto">
                  <MarkdownRenderer content={result.targetB.content} />
                </div>
              </div>

              {/* Metrics Footer */}
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{result.targetB.latencyMs}ms</span>
                </span>
                <span>
                  {result.targetB.tokens.prompt} prompt / {result.targetB.tokens.completion} compl.
                </span>
                <span className="flex items-center space-x-1 text-zinc-700 dark:text-zinc-300">
                  <Coins className="w-3 h-3" />
                  <span>${result.targetB.costUsd.toFixed(6)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
