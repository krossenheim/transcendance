import type {RawData} from "ws";

export function rawDataToString(data: RawData): string | undefined {
  if (typeof data === "string") {
    return data;
  } else if (data instanceof Buffer) {
    return data.toString();
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString();
  } else if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  console.log("Unknown message type");
  return undefined;
}