import { app } from "@azure/functions";
import { RequestGetVideoDownloadsStatus } from "../dtos/GetVideoDownloadsStatus";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";

async function fun({}: HttpRequestParams<RequestGetVideoDownloadsStatus>) {
  return {};
}

app.http("getVideoDownloadsStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: httpRequest<RequestGetVideoDownloadsStatus>(
    RequestGetVideoDownloadsStatus,
    fun
  ),
});
