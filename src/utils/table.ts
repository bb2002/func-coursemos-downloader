import { TableClient } from "@azure/data-tables";
import {
  PROCESSES_VIDEO_TABLE,
  VIDEO_PROCESS_REQUESTS_TABLE,
} from "./constant";

export async function getOrCreateTable(tableName: string) {
  const tableClient = TableClient.fromConnectionString(
    process.env.STORAGE_CONNECTION,
    tableName
  );
  await tableClient.createTable();
  return tableClient;
}

export async function getVideoProcessRequests(installationId: string) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);
  const iterator = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${installationId}'`,
    },
  });

  const entities = [];
  for await (const entity of iterator) {
    entities.push(entity);
  }

  entities.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeB - timeA;
  });

  return entities;
}

export async function getVideoProcessRequest(
  installationId: string,
  requestId: string
) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);
  return client.getEntity<any>(installationId, requestId);
}

export async function getProcessedVideo(blobId: string) {
  const client = await getOrCreateTable(PROCESSES_VIDEO_TABLE);
  const iterator = client.listEntities({
    queryOptions: {
      filter: `RowKey eq '${blobId}'`,
    },
  });

  for await (const entity of iterator) {
    return entity;
  }

  return null;
}
