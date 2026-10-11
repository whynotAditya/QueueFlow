import { useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import type { User, EmailJob } from './types';
import { authApi, emailApi } from './services/api';
import { Header } from './components/Header';
import { EmailTable } from './components/EmailTable';
import { ComposeModal } from './components/ComposeModal';
import { SearchBar } from './components/SearchBar';
import { LoginModal } from './components/LoginModal';
import { AboutModal } from './components/AboutModal';
import { Plus, Clock, Send, AlertCircle, CheckCircle2 } from 'lucide-react';

export function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<EmailJob[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailJob[]>([]);
  const [searchResults, setSearchResults] = useState<EmailJob[] | null>(null);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check URL query params for Slack OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack_connected') === 'true') {
      setBanner({
        type: 'success',
        message: 'Slack workspace successfully connected! Rate-limit alerts will now be sent to your channel.',
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('slack_error')) {
      setBanner({
        type: 'error',
        message: `Slack connection failed: ${params.get('slack_error')}`,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Check existing session
  useEffect(() => {
    const token = localStorage.getItem('queueflow_token');
    if (token) {
      authApi
        .getMe()
        .then((res) => setUser(res.data.user))
        .catch(() => localStorage.removeItem('queueflow_token'));
    }
  }, []);

  // Fetch emails
  const loadEmails = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [scheduledRes, sentRes] = await Promise.all([
        emailApi.getScheduledEmails(),
        emailApi.getSentEmails(),
      ]);
      setScheduledEmails(scheduledRes.data.emails || []);
      setSentEmails(sentRes.data.emails || []);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadEmails();
      // Auto-refresh every 5 seconds to track queue progress
      const interval = setInterval(loadEmails, 5000);
      return () => clearInterval(interval);
    }
  }, [user, loadEmails]);

  // Elasticsearch search handler
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await emailApi.searchEmails(query);
      setSearchResults(res.data.hits || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('queueflow_token');
    setUser(null);
  };

  if (!user) {
    return <LoginModal onLoginSuccess={(u) => setUser(u)} />;
  }

  // Determine emails to render based on tab or active search
  const displayedEmails =
    searchResults !== null
      ? searchResults.filter((e) =>
          activeTab === 'scheduled'
            ? ['SCHEDULED', 'PENDING', 'PROCESSING', 'DELAYED_RATE_LIMIT'].includes(e.status)
            : ['SENT', 'FAILED'].includes(e.status)
        )
      : activeTab === 'scheduled'
      ? scheduledEmails
      : sentEmails;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        user={user}
        onLogout={handleLogout}
        onRefresh={loadEmails}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      {/* Slack Banner Notification */}
      {banner && (
        <div
          className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
              : 'bg-red-50 text-red-800 border-b border-red-200'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center space-x-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{banner.message}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Control Bar: Tabs, Search Bar, Compose Button */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Navigation Tabs */}
          <div className="flex space-x-1 bg-gray-200/60 p-1 rounded-xl">
            <button
              onClick={() => {
                setActiveTab('scheduled');
                setSearchResults(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'scheduled'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Scheduled Emails</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                {scheduledEmails.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('sent');
                setSearchResults(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sent'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sent Emails</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                {sentEmails.length}
              </span>
            </button>
          </div>

          {/* Search Bar + Compose CTA */}
          <div className="flex items-center space-x-3 flex-1 md:justify-end">
            <SearchBar onSearch={handleSearch} isSearching={isSearching} />

            <button
              onClick={() => setIsComposeOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Compose New Email</span>
            </button>
          </div>
        </div>

        {/* Search status banner if active */}
        {searchResults !== null && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between text-xs text-indigo-800">
            <span>
              Elasticsearch results: found <strong>{searchResults.length}</strong> matching email(s).
            </span>
            <button
              onClick={() => setSearchResults(null)}
              className="font-semibold underline hover:text-indigo-950"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Email Data Table */}
        <EmailTable
          type={activeTab}
          emails={displayedEmails}
          loading={loading}
          onRefresh={loadEmails}
        />
      </main>

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onScheduled={loadEmails}
      />

      {/* System Architecture & Engineering Specs Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

export default function App() {
  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '108398457291-exampleclientid.apps.googleusercontent.com';

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}
