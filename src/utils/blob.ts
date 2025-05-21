import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import randomString from "./randomString";

const STORAGE_CONNECTION = process.env.STORAGE_CONNECTION;

export async function getOrCreateBlob(contName: string) {
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(STORAGE_CONNECTION);
  const containerClient = blobServiceClient.getContainerClient(contName);
  await containerClient.createIfNotExists();

  return containerClient;
}

export async function uploadMP4Blob(client: ContainerClient, buf: Buffer) {
  const blobName = randomString(32);
  const blockBlobClient = client.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: "video/mp4",
    },
  });
  return blobName;
}

export async function generateSASUrl(containerName: string, blobName: string) {
  const parsed = /AccountName=(.*?);AccountKey=(.*?);/.exec(STORAGE_CONNECTION);
  const accountName = parsed[1];
  const accountKey = parsed[2];
  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey
  );

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 20 * 60 * 60 * 1000),
      protocol: SASProtocol.Https,
    },
    sharedKeyCredential
  ).toString();
  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
}
