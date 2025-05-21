import { app, InvocationContext } from "@azure/functions";
import { writeFile, mkdir } from "fs/promises";
import { promisify } from "util";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import randomString from "../utils/randomString";
import { generateSASUrl, getOrCreateBlob, uploadMP4Blob } from "../utils/blob";
import axios from "axios";
import VideoProcessQueueItem from "../types/VideoProcessQueueItem";
import { getOrCreateTable } from "../utils/table";
import {
  PROCESSES_VIDEO_TABLE,
  VIDEO_PROCESS_REQUESTS_TABLE,
} from "../utils/constant";
import hash from "../utils/hash";

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = "videos";

interface UpdateVideoProcessResultParams {
  partitionKey: string;
  rowKey: string;
  status?: string;
}

interface InsertVideoProcessRequestParams {
  partitionKey: string;
  rowKey: string;
  sasUrl: string;
}

export async function updateVideoProcessResult({
  partitionKey,
  rowKey,
  status,
}: UpdateVideoProcessResultParams) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);
  return client.updateEntity(
    {
      partitionKey,
      rowKey,
      status,
    },
    "Merge"
  );
}

export async function insertProcessedVideo({
  partitionKey,
  rowKey,
  sasUrl,
}: InsertVideoProcessRequestParams) {
  const client = await getOrCreateTable(PROCESSES_VIDEO_TABLE);
  return client.createEntity({
    partitionKey,
    rowKey,
    sasUrl,
  });
}

export async function videoProcessor(
  { partitionKey, rowKey, mediaUrl, blobId }: VideoProcessQueueItem,
  context: InvocationContext
): Promise<void> {
  const baseUrl = `${mediaUrl.substring(0, mediaUrl.lastIndexOf("/") + 1)}`;
  const filename = mediaUrl.substring(mediaUrl.lastIndexOf("/") + 1);
  const downloadedSegments: string[] = [];

  let filenameFormat: string = null;
  if (filename.startsWith("media_")) {
    let parts = filename.split("_");
    parts[parts.length - 1] = "{n}.ts";
    filenameFormat = parts.join("_");
  }

  if (filename.startsWith("segment")) {
    let parts = filename.split("-");
    parts[1] = "{n}";
    filenameFormat = parts.join("-");
  }

  if (filenameFormat === null) {
    await updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "FILRNAME_FORMAT_FAULT",
    });
    return;
  } else {
    await updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "DOWNLOADING",
    });
  }

  const tempDirName = randomString(6);
  const tempDir = path.join("/tmp", tempDirName);
  await mkdir(tempDir, { recursive: true });

  let i = 1;
  while (true) {
    const segmentId = filenameFormat.replace("{n}", i++ + "");
    const segmentFilePath = path.join(tempDir, segmentId);

    try {
      const res = await axios.get(baseUrl + segmentId, {
        responseType: "arraybuffer",
        validateStatus: () => true,
      });

      if (res.status === 404) {
        break;
      }

      if (res.status >= 200 && res.status < 300) {
        const buffer = Buffer.from(res.data);
        await writeFile(segmentFilePath, buffer);
        downloadedSegments.push(segmentId);
        continue;
      }

      await updateVideoProcessResult({
        partitionKey,
        rowKey,
        status: "DOWNLOAD_FAILED_WITH_" + res.status,
      });
      return;
    } catch (ex) {
      await updateVideoProcessResult({
        partitionKey,
        rowKey,
        status: "DOWNLOAD_FAILED_NETWORK_ERROR",
      });
      return;
    }
  }

  const fileListPath = path.join(tempDir, "filelist.txt");
  await writeFile(
    fileListPath,
    downloadedSegments.map((fullPath) => `file '${fullPath}'`).join("\n"),
    "utf-8"
  );

  const ffmpegPath = path.join(__dirname, "..", "bin", "ffmpeg");
  const outputPath = path.join(tempDir, "output.mp4");
  await updateVideoProcessResult({
    partitionKey,
    rowKey,
    status: "ENCODING",
  });

  try {
    await execFileAsync(ffmpegPath, [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      fileListPath,
      "-c",
      "copy",
      outputPath,
    ]);
  } catch (ex) {
    context.error("FFmpeg execution failed", ex);
    await updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "ENCODING_FAULT",
    });
    return;
  }

  const fileBuffer = await fs.promises.readFile(outputPath);
  const containerClient = await getOrCreateBlob(CONTAINER_NAME);
  const uploadedBlobName = await uploadMP4Blob(containerClient, fileBuffer);
  const sasUrl = await generateSASUrl(CONTAINER_NAME, uploadedBlobName);
  await Promise.all([
    updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "COMPLETED",
    }),
    insertProcessedVideo({
      partitionKey: hash(mediaUrl),
      rowKey: blobId,
      sasUrl,
    }),
  ]);
}

app.storageQueue("videoProcessor", {
  queueName: "video-downloads",
  connection: "STORAGE_CONNECTION",
  handler: videoProcessor,
});
