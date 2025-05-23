import { IsString, Length } from "class-validator";

export class RequestGetVideoDownloadUrl {
  @IsString()
  @Length(32)
  blobId: string;
}
