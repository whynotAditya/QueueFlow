export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  slackIntegration?: {
    isActive: boolean;
    channelName?: string;
    channelId?: string;
  };
}

export interface SenderAccount {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  isEthereal: boolean;
}

export type EmailStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'DELAYED_RATE_LIMIT';

export interface EmailJob {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  etherealPreviewUrl?: string | null;
  failedReason?: string | null;
  createdAt: string;
  sender?: {
    name: string;
    email: string;
  };
}
