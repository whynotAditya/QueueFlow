import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from '../config/db.js';

interface SendMailParams {
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
}

export class EmailService {
  private static transporterCache = new Map<string, Transporter>();

  /**
   * Retrieves or creates a Nodemailer transporter for a given sender account
   */
  private static async getTransporter(senderId: string): Promise<{ transporter: Transporter; senderEmail: string; senderName: string }> {
    const sender = await prisma.senderAccount.findUnique({
      where: { id: senderId },
    });

    if (!sender) {
      throw new Error(`Sender account not found for ID: ${senderId}`);
    }

    let transporter = this.transporterCache.get(senderId);
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: sender.smtpHost,
        port: sender.smtpPort,
        secure: sender.smtpPort === 465,
        auth: {
          user: sender.smtpUser,
          pass: sender.smtpPass,
        },
      });
      this.transporterCache.set(senderId, transporter);
    }

    return { transporter, senderEmail: sender.email, senderName: sender.name };
  }

  /**
   * Sends an email via the sender's SMTP and returns the preview URL (if Ethereal)
   */
  static async sendEmail(params: SendMailParams): Promise<{ messageId: string; previewUrl: string | null }> {
    const { senderId, recipient, subject, body } = params;
    const { transporter, senderEmail, senderName } = await this.getTransporter(senderId);

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: recipient,
      subject,
      html: body,
      text: body.replace(/<[^>]*>?/gm, ''), // Plain-text fallback
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      messageId: info.messageId,
      previewUrl: previewUrl ? String(previewUrl) : null,
    };
  }

  /**
   * Automatically generates a new Ethereal test account and stores it as a SenderAccount in DB
   */
  static async createEtherealSender(userId: string, senderName: string): Promise<any> {
    const testAccount = await nodemailer.createTestAccount();

    const sender = await prisma.senderAccount.create({
      data: {
        userId,
        name: senderName,
        email: testAccount.user,
        smtpHost: testAccount.smtp.host,
        smtpPort: testAccount.smtp.port,
        smtpUser: testAccount.user,
        smtpPass: testAccount.pass,
        isEthereal: true,
      },
    });

    return sender;
  }
}
