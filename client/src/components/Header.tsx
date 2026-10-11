import React, { useState } from 'react';
import type { User } from '../types';
import { slackApi } from '../services/api';
import { ExternalLink, MessageSquare, LogOut, CheckCircle2, BellRing, Activity } from 'lucide-react';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackMessage, setSlackMessage] = useState<string | null>(null);

  const isSlackConnected = user.slackIntegration?.isActive;

  const handleConnectSlack = async () => {
    try {
      const res = await slackApi.getOAuthUrl();
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      alert('Failed to get Slack OAuth URL: ' + err.message);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setSlackMessage(null);
    try {
      const res = await slackApi.sendTestAlert();
      setSlackMessage(res.data.message || 'Alert sent!');
      setTimeout(() => setSlackMessage(null), 4000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Slack alert test failed');
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
            QF
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-gray-900 text-lg tracking-tight">QueueFlow</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded-full border border-indigo-200">
                Outbox Labs Edition
              </span>
            </div>
            <p className="text-xs text-gray-500">Distributed Asynchronous Scheduler</p>
          </div>
        </div>

        {/* Actions & Integration Links */}
        <div className="flex items-center space-x-4">
          {/* Live BullMQ Dashboard Link */}
          <a
            href="http://localhost:5000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
            title="Open real-time BullMQ queue monitor"
          >
            <Activity className="w-3.5 h-3.5 text-amber-600" />
            <span>BullMQ Live Monitor</span>
            <ExternalLink className="w-3 h-3 text-amber-600" />
          </a>

          {/* Slack Integration Action */}
          {isSlackConnected ? (
            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                <span>Slack Connected</span>
              </span>
              <button
                onClick={handleTestSlack}
                disabled={testingSlack}
                className="text-xs flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                title="Send test rate-limit alert to Slack channel"
              >
                <BellRing className="w-3 h-3" />
                <span>{testingSlack ? 'Sending...' : 'Test Alert'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectSlack}
              className="flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Connect Slack</span>
            </button>
          )}

          {slackMessage && (
            <span className="text-xs text-emerald-600 font-medium animate-pulse">
              {slackMessage}
            </span>
          )}

          {/* User Profile Pill */}
          <div className="h-6 w-px bg-gray-200" />

          <div className="flex items-center space-x-3">
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50"
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-800 leading-tight">{user.name}</p>
              <p className="text-[11px] text-gray-500 leading-tight">{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-gray-100 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
