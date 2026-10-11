import { esClient, EMAIL_INDEX } from '../config/elasticsearch.js';

export interface EmailDocument {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
}

export class ElasticsearchService {
  /**
   * Index or update an email record in Elasticsearch
   */
  static async indexEmail(email: EmailDocument): Promise<void> {
    try {
      await esClient.index({
        index: EMAIL_INDEX,
        id: email.id,
        document: email,
      });
      // Refresh index for near real-time search visibility
      await esClient.indices.refresh({ index: EMAIL_INDEX });
    } catch (err: any) {
      console.error(`[Elasticsearch] Failed to index email ${email.id}:`, err.message);
    }
  }

  /**
   * Update the status and sent timestamp of an existing email document
   */
  static async updateEmailStatus(id: string, status: string, sentAt?: string | null): Promise<void> {
    try {
      await esClient.update({
        index: EMAIL_INDEX,
        id,
        doc: {
          status,
          ...(sentAt ? { sentAt } : {}),
        },
      });
      await esClient.indices.refresh({ index: EMAIL_INDEX });
    } catch (err: any) {
      console.error(`[Elasticsearch] Failed to update email ${id}:`, err.message);
    }
  }

  /**
   * Search emails across recipient, subject, and body for a specific user
   */
  static async searchEmails(params: {
    userId: string;
    query?: string;
    status?: string;
    from?: number;
    size?: number;
  }) {
    try {
      const { userId, query, status, from = 0, size = 20 } = params;

      const mustClauses: any[] = [{ term: { userId } }];

      if (status) {
        mustClauses.push({ term: { status } });
      }

      if (query && query.trim() !== '') {
        mustClauses.push({
          multi_match: {
            query: query.trim(),
            fields: ['recipient^3', 'subject^2', 'body'],
            fuzziness: 'AUTO',
          },
        });
      }

      const response = await esClient.search({
        index: EMAIL_INDEX,
        from,
        size,
        query: {
          bool: {
            must: mustClauses,
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const hits = response.hits.hits.map((hit) => hit._source);

      return { total, hits };
    } catch (err: any) {
      console.error('[Elasticsearch] Search failed:', err.message);
      return { total: 0, hits: [] };
    }
  }
}
