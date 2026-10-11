import React from 'react';
import type { EmailJob, EmailStatus } from '../types';
import { ExternalLink, Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Mail } from 'lucide-react';

interface EmailTableProps {
  type: 'scheduled' | 'sent';
  emails: EmailJob[];
  loading: boolean;
  onRefresh: () => void;
}

const statusBadge = (status: EmailStatus) => {
  switch (status) {
    case 'SCHEDULED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3 h-3 mr-1" />
          Scheduled
        </span>
      );
    case 'PROCESSING':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          Processing
        </span>
      );
    case 'DELAYED_RATE_LIMIT':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Rate Limit Delayed
        </span>
      );
    case 'SENT':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Sent
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
};

export const EmailTable: React.FC<EmailTableProps> = ({ type, emails, loading, onRefresh }) => {
  const isScheduled = type === 'scheduled';

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Table Subheader */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            {isScheduled ? 'Scheduled Queue' : 'Dispatched Emails'}
          </h3>
          <p className="text-xs text-gray-500">
            {isScheduled
              ? 'Emails queued in BullMQ Redis delayed set awaiting dispatch'
              : 'Successfully delivered emails via Ethereal Virtual SMTP with live preview links'}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-lg hover:bg-gray-100 transition-colors"
          title="Refresh table"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="p-8 space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="animate-pulse flex space-x-4 items-center">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
              <div className="h-4 bg-gray-200 rounded w-1/6"></div>
            </div>
          ))}
        </div>
      ) : emails.length === 0 ? (
        /* Empty State */
        <div className="py-16 text-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900">
            {isScheduled ? 'No scheduled emails in queue' : 'No sent emails yet'}
          </h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
            {isScheduled
              ? 'Click "Compose New Email" above to schedule tasks with delayed BullMQ timers.'
              : 'Dispatched emails from the worker queue will appear here once processed.'}
          </p>
        </div>
      ) : (
        /* Data Table */
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3">Recipient</th>
                <th scope="col" className="px-6 py-3">Subject</th>
                <th scope="col" className="px-6 py-3">Sender</th>
                <th scope="col" className="px-6 py-3">
                  {isScheduled ? 'Scheduled For' : 'Sent At'}
                </th>
                <th scope="col" className="px-6 py-3">Status</th>
                {!isScheduled && (
                  <th scope="col" className="px-6 py-3 text-right">Ethereal Preview</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {email.recipient}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 max-w-xs truncate">
                    {email.subject}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {email.sender?.name || email.sender?.email || 'Default Sender'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {formatDate(isScheduled ? email.scheduledAt : email.sentAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {statusBadge(email.status)}
                  </td>
                  {!isScheduled && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {email.etherealPreviewUrl ? (
                        <a
                          href={email.etherealPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors"
                        >
                          <span>View Email</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
