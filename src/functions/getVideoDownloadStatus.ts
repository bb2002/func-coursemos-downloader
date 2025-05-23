import { app } from "@azure/functions";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";
import { RequestGetVideoDownloadStatus } from "../dtos/GetVideoDownloadStatus";
import { getVideoProcessRequest } from "../utils/table";
import { InternalServerError, NotFoundError } from "../utils/httpException";

async function fun({ body }: HttpRequestParams<RequestGetVideoDownloadStatus>) {
  try {
    const videoProcessRequest = await getVideoProcessRequest(
      body.installationId,
      body.requestId
    );
    return {
      installationId: videoProcessRequest.partitionKey,
      requestId: videoProcessRequest.rowKey,
      blobId: videoProcessRequest.blobId,
      status: videoProcessRequest.status,
      timestamp: videoProcessRequest.timestamp,
    };
  } catch (ex) {
    if (ex.statusCode === 404) {
      throw new NotFoundError();
    } else {
      throw new InternalServerError();
    }
  }
}

app.http("getVideoDownloadStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: httpRequest<RequestGetVideoDownloadStatus>(
    RequestGetVideoDownloadStatus,
    fun,
    (request) => ({
      installationId: request.query.get("installtionId"),
      requestId: request.query.get("requestId"),
    })
  ),
});
