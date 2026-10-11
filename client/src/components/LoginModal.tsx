import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { authApi } from '../services/api';
import type { User } from '../types';
import { Mail, Zap, ShieldCheck } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: User, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.loginWithGoogle(credentialResponse.credential);
      const { user, token } = res.data;
      localStorage.setItem('queueflow_token', token);
      onLoginSuccess(user, token);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.loginWithDev(
        'Aditya Patel',
        'aditya.patel@outboxlabs.assignment'
      );
      const { user, token } = res.data;
      localStorage.setItem('queueflow_token', token);
      onLoginSuccess(user, token);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 bg-opacity-75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-gray-100 text-center">
        {/* Brand Icon */}
        <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-indigo-200">
          QF
        </div>

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome to QueueFlow</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          ReachInbox Distributed Asynchronous Task Scheduler & Email Infrastructure
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Real Google OAuth Login */}
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google OAuth initialization error')}
              useOneTap={false}
              shape="pill"
              theme="filled_blue"
            />
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400 font-medium">Or instant developer access</span>
            </div>
          </div>

          {/* 1-Click Dev Evaluation Login */}
          <button
            onClick={handleDevLogin}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Continue as Aditya Patel (Dev Mode)</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-left space-y-2">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>BullMQ persistent queue with zero-drop rate limiting</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <Mail className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span>Virtual SMTP via Ethereal Email with preview links</span>
          </div>
        </div>
      </div>
    </div>
  );
};
