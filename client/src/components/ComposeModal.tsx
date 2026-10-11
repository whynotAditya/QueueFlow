import React, { useState, useEffect } from 'react';
import type { SenderAccount } from '../types';
import { emailApi, senderApi } from '../services/api';
import { X, Upload, Sparkles, AlertCircle, Clock, Send, Users } from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onScheduled }) => {
  const [senders, setSenders] = useState<SenderAccount[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientsText, setRecipientsText] = useState('');
  const [detectedEmails, setDetectedEmails] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<'immediate' | 'custom'>('immediate');
  const [customStartTime, setCustomStartTime] = useState<string>('');
  const [delayBetweenEmailsSec, setDelayBetweenEmailsSec] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [creatingSender, setCreatingSender] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load senders on mount
  useEffect(() => {
    if (isOpen) {
      loadSenders();
    }
  }, [isOpen]);

  const loadSenders = async () => {
    try {
      const res = await senderApi.listSenders();
      const list: SenderAccount[] = res.data.senders;
      setSenders(list);
      if (list.length > 0 && !selectedSenderId) {
        setSelectedSenderId(list[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load senders:', err);
    }
  };

  const handleCreateEtherealSender = async () => {
    setCreatingSender(true);
    try {
      const res = await senderApi.createEtherealSender();
      const newSender = res.data.sender;
      setSenders((prev) => [newSender, ...prev]);
      setSelectedSenderId(newSender.id);
    } catch (err: any) {
      alert('Failed to generate Ethereal sender: ' + err.message);
    } finally {
      setCreatingSender(false);
    }
  };

  // Extract valid emails from textarea or CSV
  const parseEmails = (input: string): string[] => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = input.match(emailRegex) || [];
    // Deduplicate
    return Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRecipientsText(text);
    setDetectedEmails(parseEmails(text));
  };

  // CSV/Text file upload parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const emails = parseEmails(content);
      setDetectedEmails(emails);
      setRecipientsText(emails.join('\n'));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedSenderId) {
      setErrorMessage('Please select or generate a sender account');
      return;
    }

    if (detectedEmails.length === 0) {
      setErrorMessage('Please specify at least one valid recipient email');
      return;
    }

    if (!subject.trim()) {
      setErrorMessage('Subject line cannot be empty');
      return;
    }

    if (!body.trim()) {
      setErrorMessage('Email body cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const startTime =
        scheduleType === 'custom' && customStartTime
          ? new Date(customStartTime).toISOString()
          : undefined;

      await emailApi.scheduleEmails({
        senderId: selectedSenderId,
        recipients: detectedEmails,
        subject,
        body,
        startTime,
        delayBetweenEmailsMs: delayBetweenEmailsSec * 1000,
      });

      // Reset & notify
      onScheduled();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || err.message || 'Scheduling failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-700">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Compose New Email Campaign</h2>
              <p className="text-xs text-gray-500">Configure delayed BullMQ queueing with rate limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sender Account Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">From (Sender SMTP Account)</label>
              <button
                type="button"
                onClick={handleCreateEtherealSender}
                disabled={creatingSender}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>{creatingSender ? 'Generating...' : '+ Generate Ethereal Sender'}</span>
              </button>
            </div>
            {senders.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
                <span>No senders found. Generate an Ethereal SMTP test sender in one click:</span>
                <button
                  type="button"
                  onClick={handleCreateEtherealSender}
                  disabled={creatingSender}
                  className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700"
                >
                  Create Now
                </button>
              </div>
            ) : (
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email}) — {s.smtpHost}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Recipients / File Upload */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Recipients (Emails or CSV Upload)
              </label>
              {detectedEmails.length > 0 && (
                <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-200 flex items-center space-x-1">
                  <Users className="w-3 h-3" />
                  <span>{detectedEmails.length} email address{detectedEmails.length > 1 ? 'es' : ''} detected</span>
                </span>
              )}
            </div>

            <textarea
              rows={3}
              value={recipientsText}
              onChange={handleTextChange}
              placeholder="Paste recipient emails separated by comma or new lines (e.g. alex@example.com, sara@domain.io)"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
            />

            {/* CSV File Upload Dropzone */}
            <div className="mt-2 flex items-center space-x-3">
              <label className="cursor-pointer inline-flex items-center space-x-1.5 text-xs text-gray-600 hover:text-indigo-600 border border-gray-200 rounded-md px-3 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                <Upload className="w-3.5 h-3.5 text-gray-500" />
                <span>Upload CSV / TXT Leads</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-gray-400">
                Automatic regex extraction from CSV columns
              </span>
            </div>
          </div>

          {/* Subject Line */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quick question regarding Outbox Labs infrastructure"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Email Body (HTML / Plain Text)</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi there,<br><br>We loved your profile and wanted to reach out regarding our backend engineering opening..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Scheduling & Rate Limits Settings Grid */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Time Option */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Start Schedule
                </label>
                <div className="flex items-center space-x-3 text-xs mb-2">
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={scheduleType === 'immediate'}
                      onChange={() => setScheduleType('immediate')}
                      name="scheduleType"
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Immediate</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={scheduleType === 'custom'}
                      onChange={() => setScheduleType('custom')}
                      name="scheduleType"
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Custom DateTime</span>
                  </label>
                </div>

                {scheduleType === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                )}
              </div>

              {/* Delay between each email */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Delay Between Each Email
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={delayBetweenEmailsSec}
                    onChange={(e) => setDelayBetweenEmailsSec(Number(e.target.value))}
                    className="w-20 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-xs text-gray-600">seconds (provider throttling)</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Paces requests through BullMQ to avoid spam blacklists
                </p>
              </div>
            </div>

            {/* Rate limit badge info */}
            <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>Configured Hourly Limit: <strong>200 emails / hour per sender</strong></span>
              </span>
              <span className="text-[11px] text-indigo-600 font-medium">Auto-delayed on limit breach</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || detectedEmails.length === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Queueing in BullMQ...' : `Schedule ${detectedEmails.length} Email(s)`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
