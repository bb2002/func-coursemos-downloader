import { app } from "@azure/functions";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";
import { RequestGetVideoDownloadUrl } from "../dtos/GetVideoDownloadUrl";
import { getProcessedVideo } from "../utils/table";
import { NotFoundError } from "../utils/httpException";

async function fun({ body }: HttpRequestParams<RequestGetVideoDownloadUrl>) {
  console.log(body);
  const processedVideo = await getProcessedVideo(body.blobId);
  if (!processedVideo || !processedVideo.sasUrl) {
    throw new NotFoundError();
  }

  return {
    sasUrl: processedVideo.sasUrl,
  };
}

app.http("getVideoDownloadUrl", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: httpRequest<RequestGetVideoDownloadUrl>(
    RequestGetVideoDownloadUrl,
    fun,
    (request) => ({
      blobId: request.query.get("blobId"),
    })
  ),
});
