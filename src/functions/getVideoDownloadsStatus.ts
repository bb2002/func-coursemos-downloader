import { app } from "@azure/functions";
import { RequestGetVideoDownloadsStatus } from "../dtos/GetVideoDownloadsStatus";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";
import { getVideoProcessRequests } from "../utils/table";
import { isAfter, subHours } from "date-fns";

async function fun({
  body,
}: HttpRequestParams<RequestGetVideoDownloadsStatus>) {
  const videoProcessRequests = await getVideoProcessRequests(
    body.installationId
  );

  return videoProcessRequests
    .filter((r) => isAfter(new Date(r.timestamp), subHours(new Date(), 20)))
    .map((r) => ({
      installationId: r.partitionKey,
      requestId: r.rowKey,
      blobId: r.blobId,
      status: r.status,
      timestamp: r.timestamp,
    }));
}

app.http("getVideoDownloadsStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: httpRequest<RequestGetVideoDownloadsStatus>(
    RequestGetVideoDownloadsStatus,
    fun,
    (request) => ({ installationId: request.query.get("installtionId") })
  ),
});
