import { QueueClient, QueueServiceClient } from "@azure/storage-queue";

export async function getOrCreateQueue(queueName: string) {
  const queueServiceClient = QueueServiceClient.fromConnectionString(
    process.env.STORAGE_CONNECTION
  );
  const queueClient = queueServiceClient.getQueueClient(queueName);
  await queueClient.createIfNotExists();
  return queueClient;
}

export function sendMessage(queueClient: QueueClient, message: object) {
  return queueClient.sendMessage(
    Buffer.from(JSON.stringify(message)).toString("base64")
  );
}
