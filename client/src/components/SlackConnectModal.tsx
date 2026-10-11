import React, { useState } from 'react';
import { slackApi } from '../services/api';
import { X, MessageSquare, ExternalLink, Check, AlertCircle, Link } from 'lucide-react';

interface SlackConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SlackConnectModal: React.FC<SlackConnectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('#outreach-alerts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOAuth = async () => {
    try {
      const res = await slackApi.getOAuthUrl();
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      setError('OAuth initiation failed. You can use direct Webhook URL below.');
    }
  };

  const handleWebhookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      setError('Please enter a valid Slack Incoming Webhook URL starting with https://hooks.slack.com/');
      return;
    }

    setLoading(true);
    try {
      await slackApi.connectWebhook(webhookUrl, channelName);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to connect webhook');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Connect Slack Alerts</h2>
              <p className="text-[11px] text-gray-400">Receive live rate-limit breach alerts</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Option A: Fast Webhook (Instant) */}
          <form onSubmit={handleWebhookSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Slack Incoming Webhook URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Create free webhook in your Slack channel (Right click channel &gt; Integrations &gt; WebHooks)
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Channel Label</label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="#outreach-alerts"
                className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !webhookUrl}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Connecting...' : 'Connect & Activate Alerts'}</span>
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white px-2 text-gray-400 font-medium">Or OAuth App</span>
            </div>
          </div>

          {/* Option B: Standard OAuth Button */}
          <button
            type="button"
            onClick={handleOAuth}
            className="w-full py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
          >
            <Link className="w-3.5 h-3.5 text-gray-500" />
            <span>Authorize via Slack App OAuth Flow</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
