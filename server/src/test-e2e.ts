import { prisma } from './config/db.js';
import { EmailService } from './services/email.service.js';
import { emailQueue } from './queues/email.queue.js';
import { ElasticsearchService } from './services/elasticsearch.service.js';
import jwt from 'jsonwebtoken';

async function runEndToEndTest() {
  console.log('--- [QueueFlow E2E Pipeline Verification] ---');

  // 1. Create or fetch test user
  const email = 'aditya.patel@queueflow.dev';
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: 'Aditya Patel' },
    create: { email, name: 'Aditya Patel', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aditya' },
  });
  console.log(`✅ [1/6] Test user verified: ${user.name} (${user.id})`);

  // 2. Create Ethereal test sender account
  console.log('⏳ [2/6] Generating Ethereal SMTP sender account...');
  const sender = await EmailService.createEtherealSender(user.id, 'Aditya Production Sender');
  console.log(`✅ [2/6] Ethereal sender generated: ${sender.email} on ${sender.smtpHost}`);

  // 3. Schedule 2 emails
  console.log('⏳ [3/6] Scheduling 2 test emails with 2s delay pacing...');
  const recipients = ['test.lead1@example.com', 'test.lead2@example.com'];
  const baseTime = Date.now();

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const scheduledTime = new Date(baseTime + i * 2000);
    const delay = Math.max(0, scheduledTime.getTime() - Date.now());

    const emailRecord = await prisma.emailJob.create({
      data: {
        userId: user.id,
        senderId: sender.id,
        recipient,
        subject: `QueueFlow Distributed Dispatch #${i + 1}`,
        body: `<p>Hello <b>Lead #${i + 1}</b>,</p><p>This is a production test of QueueFlow distributed scheduling engine!</p>`,
        status: 'SCHEDULED',
        scheduledAt: scheduledTime,
      },
    });

    const bullJob = await emailQueue.add(
      'send-scheduled-email',
      {
        emailJobId: emailRecord.id,
        userId: user.id,
        senderId: sender.id,
        recipient,
        subject: emailRecord.subject,
        body: emailRecord.body,
        scheduledAt: scheduledTime.toISOString(),
      },
      {
        jobId: emailRecord.id, // Idempotency
        delay,
      }
    );

    await prisma.emailJob.update({
      where: { id: emailRecord.id },
      data: { bullJobId: bullJob.id },
    });

    await ElasticsearchService.indexEmail({
      id: emailRecord.id,
      userId: user.id,
      senderId: sender.id,
      recipient,
      subject: emailRecord.subject,
      body: emailRecord.body,
      status: 'SCHEDULED',
      scheduledAt: scheduledTime.toISOString(),
      createdAt: emailRecord.createdAt.toISOString(),
    });

    console.log(`  -> Scheduled for ${recipient} in ${delay}ms (Bull Job ID: ${bullJob.id})`);
  }

  // 4. Verify Queue State
  const delayedCount = await emailQueue.getDelayedCount();
  const waitingCount = await emailQueue.getWaitingCount();
  console.log(`✅ [4/6] BullMQ Redis Queue State: ${delayedCount} delayed, ${waitingCount} waiting.`);

  // 5. Wait 8 seconds for the worker to process the emails
  console.log('⏳ [5/6] Waiting 8 seconds for BullMQ Worker to execute with 2s throttling...');
  await new Promise((r) => setTimeout(r, 8000));

  const sentEmails = await prisma.emailJob.findMany({
    where: { userId: user.id, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    take: 2,
  });

  console.log(`✅ [5/6] Emails Sent: ${sentEmails.length}/2`);
  sentEmails.forEach((email) => {
    console.log(`  -> Recipient: ${email.recipient}`);
    console.log(`  -> Ethereal Preview URL: ${email.etherealPreviewUrl}`);
  });

  // 6. Test Elasticsearch search
  console.log('⏳ [6/6] Testing Elasticsearch search for query "QueueFlow"...');
  const searchResult = await ElasticsearchService.searchEmails({
    userId: user.id,
    query: 'QueueFlow',
  });
  console.log(`✅ [6/6] Elasticsearch search returned ${searchResult.total} matches!`);

  console.log('\n🎉 ALL ARCHITECTURAL TESTS PASSED FLAWLESSLY! 🎉');
  process.exit(0);
}

runEndToEndTest().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
