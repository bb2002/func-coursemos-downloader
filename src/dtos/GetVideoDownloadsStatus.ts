import { IsUUID } from "class-validator";

export class RequestGetVideoDownloadsStatus {
  @IsUUID()
  installationId: string;
}
