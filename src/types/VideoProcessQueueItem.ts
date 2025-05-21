export default interface VideoProcessQueueItem {
  partitionKey: string;
  rowKey: string;
  mediaUrl: string;
  blobId: string;
}
