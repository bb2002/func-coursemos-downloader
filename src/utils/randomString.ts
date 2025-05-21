import { randomBytes } from "crypto";

export default function randomString(len: number) {
  return randomBytes(len).toString("hex");
}
