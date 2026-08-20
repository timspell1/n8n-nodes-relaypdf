import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";
import { verifyRelayPdfSignature } from "../RelayPdf/GenericFunctions";

const EVENTS = [
  "job.completed",
  "job.failed",
  "wallet.topup",
  "wallet.auto_reload",
  "wallet.auto_reload_failed",
  "wallet.payment_required",
] as const;

export class RelayPdfTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "RelayPDF Trigger",
    name: "relayPdfTrigger",
    icon: { light: "file:relaypdf.light.svg", dark: "file:relaypdf.dark.svg" },
    group: ["trigger"],
    version: 1,
    subtitle: "Dashboard webhooks",
    description: "Start a workflow from signed RelayPDF dashboard webhooks",
    defaults: { name: "RelayPDF Trigger" },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Webhook Secret",
        name: "secret",
        type: "string",
        typeOptions: { password: true },
        default: "",
        required: true,
        description:
          "Secret shown once when you create the endpoint in the RelayPDF dashboard. Paste this node’s webhook URL into Dashboard → Webhooks.",
      },
      {
        displayName: "Events",
        name: "events",
        type: "multiOptions",
        default: [...EVENTS],
        options: EVENTS.map((value) => ({ name: value, value })),
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        return true;
      },
      async create(this: IHookFunctions): Promise<boolean> {
        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const secret = this.getNodeParameter("secret") as string;
    const events = this.getNodeParameter("events") as string[];
    const headers = this.getHeaderData() as IDataObject;
    const signature = String(
      headers["relaypdf-signature"] ?? headers["RelayPDF-Signature"] ?? "",
    );
    const event = String(headers["relaypdf-event"] ?? headers["RelayPDF-Event"] ?? "");

    const req = this.getRequestObject() as { rawBody?: Buffer | string };
    const rawBody =
      typeof req.rawBody === "string"
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString("utf8")
          : JSON.stringify(this.getBodyData());

    if (!verifyRelayPdfSignature(secret, rawBody, signature)) {
      const res = this.getResponseObject();
      res.status(401).json({ error: "invalid_signature" });
      return { noWebhookResponse: true, workflowData: [[]] };
    }

    if (events.length > 0 && event && !events.includes(event)) {
      return { workflowData: [[]] };
    }

    const body = this.getBodyData() as IDataObject;
    return {
      workflowData: [[{ json: { event, ...body } }]],
    };
  }
}
