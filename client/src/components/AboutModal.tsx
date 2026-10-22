import React from 'react';
import { X, Server, ShieldCheck, Cpu, MessageSquare, Zap, Layers } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-gray-100 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center font-bold text-white shadow-md">
              QF
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">System Architecture & Engineering Specs</h2>
              <p className="text-xs text-indigo-200">
                QueueFlow — Distributed Asynchronous Scheduler for Outreach Infrastructure
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6 text-xs text-gray-600">
          {/* Executive Overview */}
          <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl text-indigo-950 space-y-1">
            <h3 className="font-bold text-sm flex items-center space-x-1.5 text-indigo-900">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Core Architectural Mission</span>
            </h3>
            <p className="leading-relaxed">
              Engineered to decouple high-volume email ingestion from SMTP delivery, eliminating HTTP timeouts and memory starvation. Built for high-throughput outreach infrastructure requiring sub-second response times, fault-tolerant persistence across worker restarts, strict rate-limiting compliance, and isolated Dead Letter Queues (DLQ).
            </p>
          </div>

          {/* Architecture Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pillar 1: Persistent Queueing */}
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-2">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold">
                <Server className="w-4 h-4" />
                <span>1. Persistent Delayed Scheduling (No Cron)</span>
              </div>
              <p className="leading-relaxed text-gray-600">
                Jobs are stored natively in Redis <strong>Sorted Sets (ZSET)</strong> using BullMQ. Timers use the Unix timestamp as the score. Redis evaluates due timers via atomic Lua scripts in <span className="font-mono text-gray-800">O(log N)</span> time.
              </p>
              <div className="text-[11px] text-gray-500 bg-white p-2 rounded border border-gray-200">
                <strong>Why Not Cron:</strong> Eliminates cron stampedes, locking deadlocks, and polling overhead.
              </div>
            </div>

            {/* Pillar 2: Restart Resilience */}
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-700 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>2. Zero-Loss Restart Resilience</span>
              </div>
              <p className="leading-relaxed text-gray-600">
                Redis is configured with <strong>Append-Only File (AOF)</strong> persistence, writing every command to disk. PostgreSQL acts as the relational source of truth. If the Node.js server crashes, Redis retains timers and workers resume without losing a single job.
              </p>
              <div className="text-[11px] text-gray-500 bg-white p-2 rounded border border-gray-200">
                <strong>Idempotency:</strong> BullMQ Job IDs are mapped directly to Postgres UUIDs, preventing duplicate sends.
              </div>
            </div>

            {/* Pillar 3: Rate Limiting & Zero-Drop Rescheduling */}
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-2">
              <div className="flex items-center space-x-2 text-amber-700 font-bold">
                <Cpu className="w-4 h-4" />
                <span>3. Atomic Sliding-Hour Rate Limiting</span>
              </div>
              <p className="leading-relaxed text-gray-600">
                Multi-worker concurrency safe counter keyed by <span className="font-mono text-gray-800">rate:sender:&#123;id&#125;:&#123;hourKey&#125;</span> using atomic Redis <span className="font-mono">INCR</span>. When the limit is hit, <strong>jobs are NEVER dropped</strong>.
              </p>
              <div className="text-[11px] text-gray-500 bg-white p-2 rounded border border-gray-200">
                <strong>Auto-Rescheduling:</strong> Worker automatically moves jobs to the next hour window and continues execution.
              </div>
            </div>

            {/* Pillar 4: Real-time Slack Alerts & Search */}
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-2">
              <div className="flex items-center space-x-2 text-purple-700 font-bold">
                <MessageSquare className="w-4 h-4" />
                <span>4. Slack OAuth Alerts & Elasticsearch</span>
              </div>
              <p className="leading-relaxed text-gray-600">
                Real OAuth flow to connect user Slack workspace. Fires instant rate-limit breach alerts. All emails are indexed in Elasticsearch with fuzzy multi-match searching across recipient, subject, and body.
              </p>
              <div className="text-[11px] text-gray-500 bg-white p-2 rounded border border-gray-200">
                <strong>Virtual SMTP:</strong> Ethereal Email SMTP generates live preview URLs for each sent email.
              </div>
            </div>
          </div>

          {/* Tech Stack Matrix */}
          <div className="pt-2 border-t border-gray-200">
            <h4 className="font-bold text-gray-800 mb-2 flex items-center space-x-1">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Production Stack Details</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
              <div className="p-2 bg-gray-100 rounded-lg">
                <div className="font-bold text-gray-800">Runtime</div>
                <div className="text-gray-500">Node.js + TS (Strict)</div>
              </div>
              <div className="p-2 bg-gray-100 rounded-lg">
                <div className="font-bold text-gray-800">Queue & Cache</div>
                <div className="text-gray-500">BullMQ + Redis 7 (AOF)</div>
              </div>
              <div className="p-2 bg-gray-100 rounded-lg">
                <div className="font-bold text-gray-800">Primary Database</div>
                <div className="text-gray-500">PostgreSQL (Prisma)</div>
              </div>
              <div className="p-2 bg-gray-100 rounded-lg">
                <div className="font-bold text-gray-800">Search Engine</div>
                <div className="text-gray-500">Elasticsearch 8.x</div>
              </div>
            </div>
          </div>

          {/* Author Footer */}
          <div className="pt-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-2">
            <div>
              Built by <strong className="text-gray-800">Aditya Patel</strong> | Final-Year B.Tech CSE (650+ DSA Problems in C++)
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-emerald-700 font-semibold">Production Grade Distributed Architecture</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
