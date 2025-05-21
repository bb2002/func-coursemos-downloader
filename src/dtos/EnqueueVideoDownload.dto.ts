import { IsString, IsUrl, IsUUID, Matches } from "class-validator";

export class RequestEnqueueVideoDownload {
  @IsUUID()
  installationId: string;

  @IsUrl()
  @Matches(/\.(mp4|ts)$/i, { message: "mediaUrl must end with .mp4 or .ts" })
  mediaUrl: string;
}
