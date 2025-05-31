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
import { pipeline } from "stream";

const execFileAsync = promisify(execFile);
const streamPipeline = promisify(pipeline);
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

async function executeTS(
  { partitionKey, rowKey, mediaUrl }: VideoProcessQueueItem,
  context: InvocationContext
) {
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
    return null;
  } else {
    await updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "DOWNLOADING",
    });
  }

  const tempDir = path.join("/tmp", randomString(6));
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

      if (res.status >= 200 && res.status < 300) {
        // 블록 다운로드 성공, 다음 세그먼트 읽기기
        const buffer = Buffer.from(res.data);
        await writeFile(segmentFilePath, buffer);
        downloadedSegments.push(segmentId);
        continue;
      } else if (res.status >= 400 && res.status < 500) {
        // 모든 블록을 다운로드 함
        break;
      } else if (res.status >= 500 && res.status < 600) {
        // 다운로드 오류
        await updateVideoProcessResult({
          partitionKey,
          rowKey,
          status: "DOWNLOAD_FAILED_WITH_" + res.status,
        });
        return null;
      }
    } catch (ex) {
      await updateVideoProcessResult({
        partitionKey,
        rowKey,
        status: "DOWNLOAD_FAILED_NETWORK_ERROR",
      });
      return null;
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
    return null;
  }

  return outputPath;
}

async function executeMP4(
  { partitionKey, rowKey, mediaUrl }: VideoProcessQueueItem,
  context: InvocationContext
) {
  const tempDir = path.join("/tmp", randomString(6));
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, "output.mp4");
  await updateVideoProcessResult({
    partitionKey,
    rowKey,
    status: "DOWNLOADING",
  });

  try {
    const response = await axios.get(mediaUrl, { responseType: "stream" });
    await streamPipeline(response.data, fs.createWriteStream(outputPath));
    return outputPath;
  } catch (ex) {
    context.error("Downloading failed", ex);
    await updateVideoProcessResult({
      partitionKey,
      rowKey,
      status: "DOWNLOAD_FAILED_NETWORK_ERROR",
    });
    return null;
  }
}

export async function videoProcessor(
  { partitionKey, rowKey, mediaUrl, blobId }: VideoProcessQueueItem,
  context: InvocationContext
): Promise<void> {
  const mediaUrlObj = new URL(mediaUrl);
  let tempDir: string | null = null;
  let outputPath: string | null = null;

  switch (path.extname(mediaUrlObj.pathname).toLowerCase()) {
    case ".ts":
      outputPath = await executeTS(
        { partitionKey, rowKey, mediaUrl, blobId },
        context
      );
      if (outputPath) {
        tempDir = path.dirname(outputPath);
      }
      break;
    case ".mp4":
      outputPath = await executeMP4(
        { partitionKey, rowKey, mediaUrl, blobId },
        context
      );
      if (outputPath) {
        tempDir = path.dirname(outputPath);
      }
      break;
    default:
      await updateVideoProcessResult({
        partitionKey,
        rowKey,
        status: "MEDIA_FORMAT_ERROR",
      });
  }

  if (outputPath === null || tempDir === null) {
    return;
  }

  try {
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
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (ex) {
        context.error(ex);
      }
    }
  }
}

app.storageQueue("videoProcessor", {
  queueName: "video-downloads",
  connection: "STORAGE_CONNECTION",
  handler: videoProcessor,
});
