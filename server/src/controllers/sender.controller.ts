import { Response } from 'express';
import { prisma } from '../config/db.js';
import { EmailService } from '../services/email.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export class SenderController {
  /**
   * List all senders configured for the user
   */
  static async listSenders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const senders = await prisma.senderAccount.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ senders });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list senders', details: err.message });
    }
  }

  /**
   * Automatically generate and save a new Ethereal SMTP test account
   */
  static async createEtherealSender(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { name } = req.body;
      const senderName = name || `Outreach Sender #${Date.now().toString().slice(-4)}`;

      const sender = await EmailService.createEtherealSender(userId, senderName);
      res.status(201).json({ message: 'Ethereal sender created successfully', sender });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create Ethereal sender', details: err.message });
    }
  }
}
