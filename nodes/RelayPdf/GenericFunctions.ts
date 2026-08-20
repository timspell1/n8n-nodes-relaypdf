import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  INodeExecutionData,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError, NodeOperationError, sleep } from "n8n-workflow";

export const API_BASE = "https://api.relaypdf.com";

export type BinaryResponse = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  id: string;
  sizeBytes: number;
};

function asErrorPayload(error: unknown): { code?: string; message?: string } | undefined {
  const err = error as JsonObject & { context?: { data?: unknown } };
  const data = err.context?.data;
  const parse = (raw: unknown): { code?: string; message?: string } | undefined => {
    let obj: { error?: { code?: string; message?: string } } | undefined;
    if (typeof raw === "string") {
      try {
        obj = JSON.parse(raw) as { error?: { code?: string; message?: string } };
      } catch {
        return undefined;
      }
    } else if (Buffer.isBuffer(raw)) {
      try {
        obj = JSON.parse(raw.toString("utf8")) as { error?: { code?: string; message?: string } };
      } catch {
        return undefined;
      }
    } else if (raw && typeof raw === "object") {
      obj = raw as { error?: { code?: string; message?: string } };
    }
    if (obj?.error?.code || obj?.error?.message) {
      return { code: obj.error.code, message: obj.error.message };
    }
    return undefined;
  };
  return parse(data) ?? parse(err);
}

export function parseJsonObject(
	this: IExecuteFunctions,
	value: unknown,
	field: string,
	itemIndex: number,
): IDataObject {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as IDataObject;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return {};
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as IDataObject;
			}
		} catch {
			throw new NodeOperationError(this.getNode(), `${field} must be a JSON object.`, { itemIndex });
		}
	}
	throw new NodeOperationError(this.getNode(), `${field} must be a JSON object.`, { itemIndex });
}

export async function relayPdfRequest(
  this: IExecuteFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body?: IDataObject,
  binary = false,
): Promise<IDataObject | BinaryResponse> {
  const requestOptions: IHttpRequestOptions = {
    method,
    url: `${API_BASE}${endpoint}`,
    json: !binary,
    encoding: binary ? "arraybuffer" : undefined,
    returnFullResponse: binary,
    headers: {
      Accept: binary ? "application/pdf, application/octet-stream, image/*, */*" : "application/json",
    },
  };
  if (body && Object.keys(body).length > 0) {
    requestOptions.body = body;
  }

  try {
    const response = (await this.helpers.httpRequestWithAuthentication.call(
      this,
      "relayPdfApi",
      requestOptions,
    )) as unknown;

    if (!binary) {
      return response as IDataObject;
    }

    const full = response as { body?: unknown; headers?: IDataObject; statusCode?: number };
    const rawBody = full.body ?? response;
    const buffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody as ArrayBuffer);
    const headers = (full.headers ?? {}) as IDataObject;
    const disposition = String(headers["content-disposition"] ?? headers["Content-Disposition"] ?? "");
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const contentType = String(
      headers["content-type"] ?? headers["Content-Type"] ?? "application/octet-stream",
    ).split(";")[0];
    return {
      buffer,
      filename: filenameMatch?.[1]?.trim() || "document.bin",
      contentType,
      id: String(headers["x-relaypdf-id"] ?? headers["X-Relaypdf-Id"] ?? ""),
      sizeBytes: Number(headers["x-relaypdf-size"] ?? headers["X-Relaypdf-Size"] ?? buffer.length),
    };
  } catch (error) {
    const apiError = asErrorPayload(error);
    throw new NodeApiError(this.getNode(), error as JsonObject, {
      message: apiError?.message || (error as Error).message || "RelayPDF request failed",
      description: apiError?.code ? `Error code: ${apiError.code}` : undefined,
    });
  }
}

export async function binaryFromUrl(
  this: IExecuteFunctions,
  url: string,
  filename: string,
): Promise<BinaryResponse> {
  const response = (await this.helpers.httpRequest({
    method: "GET",
    url,
    encoding: "arraybuffer",
    json: false,
    returnFullResponse: true,
  })) as { body: unknown; headers?: IDataObject };
  const rawBody = response.body;
  const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody as ArrayBuffer);
  const headers = (response.headers ?? {}) as IDataObject;
  const contentType = String(headers["content-type"] ?? "application/pdf").split(";")[0];
  return {
    buffer,
    filename,
    contentType,
    id: String(headers["x-relaypdf-id"] ?? ""),
    sizeBytes: Number(headers["x-relaypdf-size"] ?? buffer.length),
  };
}

export async function waitForJob(
  this: IExecuteFunctions,
  jobId: string,
  timeoutMs: number,
): Promise<IDataObject> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = (await relayPdfRequest.call(this, "GET", `/v1/jobs/${jobId}`)) as IDataObject;
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      const err = (job.error as IDataObject | undefined) ?? {};
      throw new NodeOperationError(
        this.getNode(),
        String(err.message ?? "Job failed."),
        { description: String(err.code ?? "processing_failed") },
      );
    }
		await sleep(1000);
  }
  throw new NodeOperationError(this.getNode(), `Timed out waiting for job ${jobId}.`);
}

export function pdfOptionsFromNode(this: IExecuteFunctions, itemIndex: number): IDataObject | undefined {
  const additional = this.getNodeParameter("additionalOptions", itemIndex, {}) as IDataObject;
  const options: IDataObject = {};
  if (additional.format) options.format = additional.format;
  if (additional.landscape) options.landscape = additional.landscape;
  if (additional.printBackground !== undefined) options.printBackground = additional.printBackground;
  if (additional.preferCSSPageSize) options.preferCSSPageSize = additional.preferCSSPageSize;
  if (additional.scale !== undefined && additional.scale !== 1) options.scale = additional.scale;
  if (additional.waitUntil) options.waitUntil = additional.waitUntil;
  if (additional.timeout) options.timeout = additional.timeout;
  if (additional.pageRanges) options.pageRanges = additional.pageRanges;
  if (additional.width) options.width = additional.width;
  if (additional.height) options.height = additional.height;
  if (additional.headerTemplate) options.headerTemplate = additional.headerTemplate;
  if (additional.footerTemplate) options.footerTemplate = additional.footerTemplate;

  const marginTop = typeof additional.marginTop === "string" ? additional.marginTop.trim() : "";
  const marginRight = typeof additional.marginRight === "string" ? additional.marginRight.trim() : "";
  const marginBottom = typeof additional.marginBottom === "string" ? additional.marginBottom.trim() : "";
  const marginLeft = typeof additional.marginLeft === "string" ? additional.marginLeft.trim() : "";
  if (marginTop || marginRight || marginBottom || marginLeft) {
    options.margin = {
      ...(marginTop ? { top: marginTop } : {}),
      ...(marginRight ? { right: marginRight } : {}),
      ...(marginBottom ? { bottom: marginBottom } : {}),
      ...(marginLeft ? { left: marginLeft } : {}),
    };
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

export async function fileFromBinary(
  this: IExecuteFunctions,
  itemIndex: number,
  binaryPropertyName: string,
): Promise<{ file: string; fileName: string; mimeType: string }> {
  this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
  const binary = this.getInputData()[itemIndex]?.binary?.[binaryPropertyName];
  const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
  return {
    file: buffer.toString("base64"),
    fileName: binary?.fileName || "upload.bin",
    mimeType: binary?.mimeType || "application/octet-stream",
  };
}

export async function toExecutionData(
  this: IExecuteFunctions,
  itemIndex: number,
  payload: IDataObject | BinaryResponse,
  binaryPropertyName: string,
): Promise<INodeExecutionData> {
  if (Buffer.isBuffer((payload as BinaryResponse).buffer)) {
    const file = payload as BinaryResponse;
    const binaryData = await this.helpers.prepareBinaryData(file.buffer, file.filename, file.contentType);
    return {
      json: {
        success: true,
        id: file.id,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
      },
      binary: { [binaryPropertyName]: binaryData },
      pairedItem: { item: itemIndex },
    };
  }
  return { json: payload, pairedItem: { item: itemIndex } };
}

export async function generateAndReturn(
  this: IExecuteFunctions,
  itemIndex: number,
  endpoint: string,
  body: IDataObject,
): Promise<INodeExecutionData> {
  const responseMode = this.getNodeParameter("responseMode", itemIndex, "binary") as string;
  const binaryPropertyName = this.getNodeParameter("binaryPropertyName", itemIndex, "data") as string;
  const waitForCompletion = this.getNodeParameter("waitForCompletion", itemIndex, true) as boolean;
  const waitTimeoutMs = this.getNodeParameter("waitTimeoutMs", itemIndex, 120000) as number;

  if (responseMode === "url") {
    const json = (await relayPdfRequest.call(this, "POST", endpoint, { ...body, response: "url" })) as IDataObject;
    return toExecutionData.call(this, itemIndex, json, binaryPropertyName);
  }

  if (responseMode === "async") {
    const json = (await relayPdfRequest.call(this, "POST", endpoint, { ...body, response: "async" })) as IDataObject;
    if (!waitForCompletion) {
      return toExecutionData.call(this, itemIndex, json, binaryPropertyName);
    }
    const jobId = String(json.id ?? "");
    const job = await waitForJob.call(this, jobId, waitTimeoutMs);
    const url = String(job.url ?? "");
    const filename = String(job.filename ?? body.filename ?? "document.pdf");
    if (url) {
      const file = await binaryFromUrl.call(this, url, filename);
      return toExecutionData.call(this, itemIndex, { ...file, id: String(job.id ?? file.id) }, binaryPropertyName);
    }
    return toExecutionData.call(this, itemIndex, job, binaryPropertyName);
  }

  const binary = (await relayPdfRequest.call(this, "POST", endpoint, body, true)) as BinaryResponse;
  return toExecutionData.call(this, itemIndex, binary, binaryPropertyName);
}

export function verifyRelayPdfSignature(secret: string, rawBody: string, header: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const timestamp = Number(parts.t);
  const expected = parts.v1;
  if (!Number.isInteger(timestamp) || !expected) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSec) return false;
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const digestBuf = Buffer.from(digest, "utf8");
  if (expectedBuf.length !== digestBuf.length) return false;
  return timingSafeEqual(expectedBuf, digestBuf);
}
