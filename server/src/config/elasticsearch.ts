import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';

dotenv.config();

const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

export const esClient = new Client({
  node: esNode,
});

export const EMAIL_INDEX = 'queueflow_emails';

export async function initElasticsearchIndex() {
  try {
    const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: EMAIL_INDEX,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            createdAt: { type: 'date' },
          },
        },
      });
      console.log(`[Elasticsearch] Index '${EMAIL_INDEX}' created successfully.`);
    } else {
      console.log(`[Elasticsearch] Index '${EMAIL_INDEX}' already exists.`);
    }
  } catch (error: any) {
    console.warn(`[Elasticsearch] Note: Elasticsearch setup warning (${error.message}). Will retry indexing when search requests occur.`);
  }
}
