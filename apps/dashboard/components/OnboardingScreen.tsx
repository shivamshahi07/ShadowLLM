'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  Activity,
  Key,
  Lock,
  ExternalLink,
  ArrowRight,
  Split,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { saveEncryptedKeys } from './crypto-utils';

interface OnboardingScreenProps {
  userEmail: string;
  onComplete: (keys: { geminiApiKey: string; groqApiKey: string; openrouterApiKey: string }, showGuideModal: boolean) => void;
  initialKeys?: { geminiApiKey?: string; groqApiKey?: string; openrouterApiKey?: string };
}

export function OnboardingScreen({
  userEmail,
  onComplete,
  initialKeys,
}: OnboardingScreenProps) {
  const [geminiKey, setGeminiKey] = useState(initialKeys?.geminiApiKey || '');
  const [groqKey, setGroqKey] = useState(initialKeys?.groqApiKey || '');
  const [openRouterKey, setOpenRouterKey] = useState(initialKeys?.openrouterApiKey || '');

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showOpenRouter, setShowOpenRouter] = useState(false);

  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const hasAtLeastOne =
      geminiKey.trim().length > 0 ||
      groqKey.trim().length > 0 ||
      openRouterKey.trim().length > 0;

    if (!hasAtLeastOne) {
      setErrorMsg('Please provide at least one API key (Google AI Studio, Groq, or OpenRouter) to continue.');
      return;
    }

    setIsSaving(true);
    try {
      await saveEncryptedKeys(
        {
          geminiApiKey: geminiKey.trim(),
          groqApiKey: groqKey.trim(),
          openrouterApiKey: openRouterKey.trim(),
        },
        userEmail
      );

      // If user did NOT check "don't show again", show the How It Works modal
      const shouldShowGuideModal = !dontShowAgain;
      onComplete(
        {
          geminiApiKey: geminiKey.trim(),
          groqApiKey: groqKey.trim(),
          openrouterApiKey: openRouterKey.trim(),
        },
        shouldShowGuideModal
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save encrypted keys. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full mx-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          
          {/* LEFT COLUMN: How ShadowLLM Works Architecture & Concept */}
          <div className="lg:col-span-6 bg-zinc-900 text-zinc-100 p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-zinc-800">
            <div>
              <div className="flex items-center space-x-2.5 mb-8">
                <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold">
                  <Split className="w-4 h-4 rotate-90" />
                </div>
                <div>
                  <span className="font-bold text-base tracking-tight text-white block leading-none">
                    ShadowLLM
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Production Canary & Shadow Gateway
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-[11px] font-mono mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Interactive Architecture Tour</span>
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
                  How ShadowLLM Works
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Safely benchmark and transition to 10x cheaper open-weight models (Groq, OpenRouter) without risking production regressions or customer downtime.
                </p>
              </div>

              {/* 3 Core Pillars */}
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                  <div className="w-7 h-7 rounded-lg bg-zinc-700/70 text-zinc-200 flex items-center justify-center shrink-0 text-xs font-mono font-bold">
                    01
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Traffic Bifurcation (&lt;2ms Overhead)</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                      Live client calls stream directly to your primary LLM. The proxy duplicates the payload into an async queue with zero delay to the user.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                  <div className="w-7 h-7 rounded-lg bg-zinc-700/70 text-zinc-200 flex items-center justify-center shrink-0 text-xs font-mono font-bold">
                    02
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Side-Effect Virtualization Sandbox</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                      Mutating tools (Stripe payouts, database deletes, emails) called by the shadow model are intercepted and mocked. Zero duplicate writes.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                  <div className="w-7 h-7 rounded-lg bg-zinc-700/70 text-zinc-200 flex items-center justify-center shrink-0 text-xs font-mono font-bold">
                    03
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-blue-400" />
                      <span>Semantic Drift Radar & Flash-Lite Judge</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                      Dense vector embeddings calculate cosine similarity. An impartial Judge scores and compares prompt variants with zero-tie decisive feedback.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>Account: {userEmail}</span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Isolated Workspace</span>
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: Bring Your Own Keys (BYOK) Form */}
          <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <div className="mb-6">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 mb-2">
                  <Key className="w-3 h-3" />
                  <span>Bring Your Own Key (BYOK)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Configure Your Model Providers
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Enter your API keys below to unlock live models across Google Gemini, Groq Cloud, and OpenRouter.
                </p>
              </div>

              {/* Security Shield Banner */}
              <div className="mb-6 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-start space-x-2.5 text-xs text-blue-900 dark:text-blue-200">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong className="font-semibold block mb-0.5">Encrypted Client-Side (AES-GCM):</strong>
                  Your keys are encrypted in your browser vault before saving. They are strictly forwarded to authorized inference endpoints during test runs and are never stored or logged in plain text.
                </div>
              </div>

              {errorMsg && (
                <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 flex items-center space-x-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. Google AI Studio (Gemini) Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <span>1. Google AI Studio API Key</span>
                      <span className="text-[10px] font-mono text-zinc-400">(Gemini 3.5 & Judge)</span>
                    </label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <span>Get Free Key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showGemini ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy... or AQ..."
                      className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGemini(!showGemini)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showGemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* 2. Groq Cloud Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <span>2. Groq Cloud API Key</span>
                      <span className="text-[10px] font-mono text-zinc-400">(GPT-OSS 120B / Llama 3.3)</span>
                    </label>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <span>Get Groq Key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showGroq ? 'text' : 'password'}
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      placeholder="gsk_..."
                      className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGroq(!showGroq)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showGroq ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* 3. OpenRouter Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center space-x-1.5">
                      <span>3. OpenRouter API Key</span>
                      <span className="text-[10px] font-mono text-zinc-400">(Multi-Model Gateway)</span>
                    </label>
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <span>Get OpenRouter Key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showOpenRouter ? 'text' : 'password'}
                      value={openRouterKey}
                      onChange={(e) => setOpenRouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full px-3 py-2 pr-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenRouter(!showOpenRouter)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {showOpenRouter ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Checkbox: Don't show again */}
                <div className="pt-2 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="onboarding-dont-show"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-black dark:text-white focus:ring-black dark:focus:ring-white"
                  />
                  <label
                    htmlFor="onboarding-dont-show"
                    className="text-xs text-zinc-600 dark:text-zinc-400 select-none cursor-pointer"
                  >
                    Don't show the How It Works guide next time
                  </label>
                </div>

                {/* Submit Action */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black transition shadow-sm disabled:opacity-50"
                  >
                    <span>{isSaving ? 'Encrypting & Saving...' : 'Save Encrypted Keys & Continue'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[10px] text-center text-zinc-400 dark:text-zinc-500 mt-2">
                    Without API keys, live model testing cannot execute. You can update keys anytime in the top bar.
                  </p>
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
