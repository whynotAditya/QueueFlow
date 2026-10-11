import axios from 'axios';

export const API_BASE_URL = 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('queueflow_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  loginWithGoogle: (credential: string) => api.post('/auth/google', { credential }),
  loginWithDev: (name = 'Aditya Patel', email = 'aditya.patel@outboxlabs.assignment') =>
    api.post('/auth/dev-login', { name, email }),
  getMe: () => api.get('/auth/me'),
};

export const senderApi = {
  listSenders: () => api.get('/senders'),
  createEtherealSender: (name?: string) => api.post('/senders/ethereal', { name }),
};

export const emailApi = {
  scheduleEmails: (data: {
    senderId: string;
    recipients: string[];
    subject: string;
    body: string;
    startTime?: string;
    delayBetweenEmailsMs: number;
  }) => api.post('/emails/schedule', data),
  getScheduledEmails: (page = 1, limit = 50) =>
    api.get(`/emails/scheduled?page=${page}&limit=${limit}`),
  getSentEmails: (page = 1, limit = 50) =>
    api.get(`/emails/sent?page=${page}&limit=${limit}`),
  searchEmails: (query: string, status?: string) =>
    api.get(`/emails/search?q=${encodeURIComponent(query)}${status ? `&status=${status}` : ''}`),
};

export const slackApi = {
  getOAuthUrl: () => api.get('/slack/oauth-url'),
  getStatus: () => api.get('/slack/status'),
  sendTestAlert: () => api.post('/slack/test-alert'),
  disconnect: () => api.post('/slack/disconnect'),
};
