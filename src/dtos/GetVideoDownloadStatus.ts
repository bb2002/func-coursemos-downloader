import { IsUUID } from "class-validator";

export class RequestGetVideoDownloadStatus {
  @IsUUID()
  installationId: string;

  @IsUUID()
  requestId: string;
}
