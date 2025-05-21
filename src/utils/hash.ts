import { createHash } from "crypto";

export default function hash(mediaUrl: string) {
  return createHash("md5").update(mediaUrl).digest("hex");
}
