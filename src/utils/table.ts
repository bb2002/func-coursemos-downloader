import { TableClient } from "@azure/data-tables";

export async function getOrCreateTable(tableName: string) {
  const tableClient = TableClient.fromConnectionString(
    process.env.STORAGE_CONNECTION,
    tableName
  );
  await tableClient.createTable();
  return tableClient;
}
