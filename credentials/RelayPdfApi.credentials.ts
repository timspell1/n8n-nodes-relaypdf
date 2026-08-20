import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class RelayPdfApi implements ICredentialType {
  name = "relayPdfApi";

  displayName = "RelayPDF API";

  documentationUrl = "https://relaypdf.com/integrations/n8n";

  icon = "file:relaypdf.svg" as const;

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "API key from the RelayPDF dashboard. Paste pdf_live_… only — do not include the Bearer prefix.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "https://api.relaypdf.com",
      url: "/v1/account",
      method: "GET",
    },
  };
}
