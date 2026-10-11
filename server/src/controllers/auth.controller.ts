import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key_queueflow_2026_dev';

export class AuthController {
  /**
   * Google OAuth verification: accepts Google ID token from frontend
   */
  static async googleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { credential } = req.body;
      if (!credential) {
        res.status(400).json({ error: 'Credential token is required' });
        return;
      }

      let email: string;
      let name: string;
      let avatar: string | undefined;

      if (process.env.GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          res.status(400).json({ error: 'Invalid Google payload' });
          return;
        }
        email = payload.email;
        name = payload.name || payload.email.split('@')[0];
        avatar = payload.picture;
      } else {
        // Dev fallback if Google Client ID not yet populated
        const decoded: any = jwt.decode(credential);
        email = decoded?.email || 'test.developer@queueflow.io';
        name = decoded?.name || 'Aditya Patel';
        avatar = decoded?.picture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aditya';
      }

      // Upsert user in Postgres
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, avatar },
        create: { email, name, avatar },
      });

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({ token, user });
    } catch (err: any) {
      console.error('[Auth] Google Login failed:', err.message);
      res.status(500).json({ error: 'Authentication failed', details: err.message });
    }
  }

  /**
   * Fast Dev/Test Login endpoint for seamless local testing without Google credentials
   */
  static async devLogin(req: Request, res: Response): Promise<void> {
    try {
      const email = req.body.email || 'aditya.patel@outboxlabs.assignment';
      const name = req.body.name || 'Aditya Patel';
      const avatar = req.body.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aditya';

      const user = await prisma.user.upsert({
        where: { email },
        update: { name, avatar },
        create: { email, name, avatar },
      });

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({ token, user });
    } catch (err: any) {
      res.status(500).json({ error: 'Dev login failed', details: err.message });
    }
  }

  /**
   * Return currently authenticated user profile
   */
  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          slackIntegration: {
            select: { isActive: true, channelName: true, channelId: true },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch user', details: err.message });
    }
  }
}
