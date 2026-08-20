import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeProperties,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import {
  fileFromBinary,
  generateAndReturn,
  parseJsonObject,
  pdfOptionsFromNode,
  relayPdfRequest,
} from "./GenericFunctions";

const generatingOps = ["create", "merge", "extract", "protect", "bookmarks", "convert"];

function show(resource: string | string[], operation?: string | string[]): INodeProperties["displayOptions"] {
  return {
    show: {
      resource: Array.isArray(resource) ? resource : [resource],
      ...(operation ? { operation: Array.isArray(operation) ? operation : [operation] } : {}),
    },
  };
}

const additionalOptions: INodeProperties = {
  displayName: "Additional Options",
  name: "additionalOptions",
  type: "collection",
  placeholder: "Add Option",
  default: {},
  displayOptions: show(["pdf", "image"], "create"),
  options: [
    { displayName: "Footer Template", name: "footerTemplate", type: "string", typeOptions: { rows: 3 }, default: "" },
    {
      displayName: "Format",
      name: "format",
      type: "options",
      default: "letter",
      options: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "letter", "legal", "tabloid", "ledger"].map((value) => ({
        name: value,
        value,
      })),
    },
    { displayName: "Full Page", name: "fullPage", type: "boolean", default: false },
    { displayName: "Header Template", name: "headerTemplate", type: "string", typeOptions: { rows: 3 }, default: "" },
    { displayName: "Height", name: "height", type: "string", default: "" },
    {
      displayName: "Image Type",
      name: "imageType",
      type: "options",
      default: "png",
      options: [
        { name: "PNG", value: "png" },
        { name: "JPEG", value: "jpeg" },
        { name: "WebP", value: "webp" },
      ],
    },
    { displayName: "Landscape", name: "landscape", type: "boolean", default: false },
    { displayName: "Margin Bottom", name: "marginBottom", type: "string", default: "" },
    { displayName: "Margin Left", name: "marginLeft", type: "string", default: "" },
    { displayName: "Margin Right", name: "marginRight", type: "string", default: "" },
    { displayName: "Margin Top", name: "marginTop", type: "string", default: "" },
    { displayName: "Omit Background", name: "omitBackground", type: "boolean", default: false },
    { displayName: "Page Ranges", name: "pageRanges", type: "string", default: "", placeholder: "1-3,5" },
    { displayName: "Prefer CSS Page Size", name: "preferCSSPageSize", type: "boolean", default: false },
    { displayName: "Print Background", name: "printBackground", type: "boolean", default: true },
    {
      displayName: "Quality",
      name: "quality",
      type: "number",
      default: 80,
      typeOptions: { minValue: 1, maxValue: 100 },
    },
    {
      displayName: "Scale",
      name: "scale",
      type: "number",
      default: 1,
      typeOptions: { minValue: 0.1, maxValue: 2 },
    },
    {
      displayName: "Timeout (Ms)",
      name: "timeout",
      type: "number",
      default: 30000,
      typeOptions: { minValue: 1, maxValue: 60000 },
    },
    {
      displayName: "Wait Until",
      name: "waitUntil",
      type: "options",
      default: "networkidle0",
      options: [
        { name: "Load", value: "load" },
        { name: "DOM Content Loaded", value: "domcontentloaded" },
        { name: "Network Idle 0", value: "networkidle0" },
        { name: "Network Idle 2", value: "networkidle2" },
      ],
    },
    { displayName: "Width", name: "width", type: "string", default: "" },
  ],
};

export class RelayPdf implements INodeType {
  description: INodeTypeDescription = {
    displayName: "RelayPDF",
    name: "relayPdf",
    icon: { light: "file:relaypdf.light.svg", dark: "file:relaypdf.dark.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: "Generate, convert, and process documents with the RelayPDF API",
    defaults: { name: "RelayPDF" },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "relayPdfApi", required: true }],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        default: "pdf",
        options: [
          { name: "Account", value: "account" },
          { name: "Barcode", value: "barcode" },
          { name: "Convert", value: "convert" },
          { name: "Image", value: "image" },
          { name: "Job", value: "job" },
          { name: "PDF", value: "pdf" },
          { name: "Template", value: "template" },
          { name: "Zip", value: "zip" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "get",
        displayOptions: show("account"),
        options: [{ name: "Get", value: "get", action: "Get account and wallet", description: "GET /v1/account" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "create",
        displayOptions: show("pdf"),
        options: [
          { name: "Add Bookmarks", value: "bookmarks", action: "Add PDF bookmarks" },
          { name: "Create", value: "create", action: "Create a PDF" },
          { name: "Extract Pages", value: "extract", action: "Extract PDF pages" },
          { name: "Merge", value: "merge", action: 'Merge pd fs' },
          { name: "Protect", value: "protect", action: 'Password protect a pdf' },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "create",
        displayOptions: show("image"),
        options: [{ name: "Create", value: "create", action: "Create a screenshot" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "convert",
        displayOptions: show("convert"),
        options: [{ name: "Convert File", value: "convert", action: 'Convert an office file' }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "create",
        displayOptions: show("barcode"),
        options: [{ name: "Create", value: "create", action: "Create a barcode or QR image" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "create",
        displayOptions: show("zip"),
        options: [{ name: "Create", value: "create", action: "Zip files" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "list",
        displayOptions: show("template"),
        options: [
          { name: "Get", value: "get", action: "Get a template" },
          { name: "List", value: "list", action: "List templates" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "get",
        displayOptions: show("job"),
        options: [{ name: "Get", value: "get", action: "Get an async job" }],
      },
      {
        displayName: "Source",
        name: "source",
        type: "options",
        default: "template",
        displayOptions: show("pdf", "create"),
        options: [
          { name: "HTML", value: "html" },
          { name: "Markdown", value: "markdown" },
          { name: "Template", value: "template" },
          { name: "URL", value: "url" },
        ],
      },
      {
        displayName: "HTML",
        name: "html",
        type: "string",
        typeOptions: { rows: 6 },
        default: "",
        displayOptions: {
          show: {
            resource: ["pdf", "image"],
            operation: ["create"],
            source: ["html"],
          },
        },
      },
      {
        displayName: "Markdown",
        name: "markdown",
        type: "string",
        typeOptions: { rows: 6 },
        default: "",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["create"], source: ["markdown"] },
        },
      },
      {
        displayName: "URL",
        name: "url",
        type: "string",
        default: "",
        placeholder: "https://example.com/invoice",
        displayOptions: {
          show: {
            resource: ["pdf", "image"],
            operation: ["create"],
            source: ["url"],
          },
        },
      },
      {
        displayName: "Template ID",
        name: "templateId",
        type: "string",
        default: "",
        placeholder: "invoice",
        description: "Published template UUID or account slug",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["create"], source: ["template"] },
        },
      },
      {
        displayName: "Template Data",
        name: "templateData",
        type: "json",
        default: "{}",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["create"], source: ["template"] },
        },
      },
      {
        displayName: "Template Version",
        name: "templateVersion",
        type: "number",
        default: 0,
        description: "Pin a published version. 0 uses the latest published version.",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["create"], source: ["template"] },
        },
      },
      {
        displayName: "Strict",
        name: "strict",
        type: "boolean",
        default: false,
        description: "Whether to fail if a Handlebars path is missing",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["create"], source: ["template"] },
        },
      },
      {
        displayName: "Image Source",
        name: "source",
        type: "options",
        default: "url",
        displayOptions: show("image", "create"),
        options: [
          { name: "HTML", value: "html" },
          { name: "URL", value: "url" },
        ],
      },
      {
        displayName: "Filename",
        name: "filename",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["pdf", "image", "convert", "barcode", "zip"],
            operation: generatingOps,
          },
        },
      },
      {
        displayName: "Input Binary Field",
        name: "binaryPropertyNameIn",
        type: "string",
        default: "data",
        displayOptions: {
          show: {
            resource: ["pdf", "convert"],
            operation: ["extract", "protect", "bookmarks", "convert"],
          },
        },
      },
      {
        displayName: "PDF Source",
        name: "pdfSource",
        type: "options",
        default: "binary",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["extract", "protect", "bookmarks"] },
        },
        options: [
          { name: "Binary", value: "binary" },
          { name: "URL", value: "url" },
        ],
      },
      {
        displayName: "PDF URL",
        name: "pdfUrl",
        type: "string",
        default: "",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["extract", "protect", "bookmarks"], pdfSource: ["url"] },
        },
      },
      {
        displayName: "Pages",
        name: "pages",
        type: "string",
        default: "1",
        placeholder: "1-3,5",
        displayOptions: show("pdf", "extract"),
      },
      {
        displayName: "User Password",
        name: "userPassword",
        type: "string",
        typeOptions: { password: true },
        default: "",
        displayOptions: show("pdf", "protect"),
      },
      {
        displayName: "Owner Password",
        name: "ownerPassword",
        type: "string",
        typeOptions: { password: true },
        default: "",
        displayOptions: show("pdf", "protect"),
      },
      {
        displayName: "Bookmarks",
        name: "bookmarks",
        type: "json",
        default: '[{"title":"Cover","page":1}]',
        displayOptions: show("pdf", "bookmarks"),
      },
      {
        displayName: "Files",
        name: "files",
        type: "fixedCollection",
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: "Add File",
        displayOptions: {
          show: { resource: ["pdf"], operation: ["merge"] },
        },
        options: [
          {
            name: "file",
            displayName: "File",
            values: [
              {
                displayName: "Source",
                name: "source",
                type: "options",
                default: "url",
                options: [
                  { name: "Binary", value: "binary" },
                  { name: "URL", value: "url" },
                ],
              },
              { displayName: "URL", name: "url", type: "string", default: "" },
              {
                displayName: "Binary Field",
                name: "binaryPropertyName",
                type: "string",
                default: "data",
              },
              {
                displayName: "Filename",
                name: "filename",
                type: "string",
                default: "",
                description: "Required for zip entries",
              },
            ],
          },
        ],
      },
      {
        displayName: "Files",
        name: "files",
        type: "fixedCollection",
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: "Add File",
        displayOptions: show("zip", "create"),
        options: [
          {
            name: "file",
            displayName: "File",
            values: [
              {
                displayName: "Source",
                name: "source",
                type: "options",
                default: "url",
                options: [
                  { name: "Binary", value: "binary" },
                  { name: "URL", value: "url" },
                ],
              },
              { displayName: "URL", name: "url", type: "string", default: "" },
              {
                displayName: "Binary Field",
                name: "binaryPropertyName",
                type: "string",
                default: "data",
              },
              {
                displayName: "Filename",
                name: "filename",
                type: "string",
                default: "",
                description: "Required for zip entries",
              },
            ],
          },
        ],
      },
      {
        displayName: "To",
        name: "to",
        type: "options",
        default: "pdf",
        displayOptions: show("convert", "convert"),
        options: ["pdf", "docx", "xlsx", "html", "png"].map((value) => ({ name: value, value })),
      },
      {
        displayName: "Engine",
        name: "engine",
        type: "options",
        default: "libreoffice",
        displayOptions: show("convert", "convert"),
        options: [
          { name: "LibreOffice", value: "libreoffice" },
          { name: 'Wkhtmltopdf', value: "wkhtmltopdf" },
        ],
      },
      {
        displayName: "Barcode Type",
        name: "barcodeType",
        type: "options",
        default: "qr",
        displayOptions: show("barcode", "create"),
        options: ["qr", "code128", "code39", "ean13", "upca", "pdf417", "datamatrix"].map((value) => ({
          name: value,
          value,
        })),
      },
      {
        displayName: "Text",
        name: "text",
        type: "string",
        default: "",
        displayOptions: show("barcode", "create"),
      },
      {
        displayName: "Format",
        name: "barcodeFormat",
        type: "options",
        default: "png",
        displayOptions: show("barcode", "create"),
        options: [
          { name: "PNG", value: "png" },
          { name: "SVG", value: "svg" },
        ],
      },
      {
        displayName: "Template ID",
        name: "templateLookupId",
        type: "string",
        default: "",
        displayOptions: show("template", "get"),
      },
      {
        displayName: "Job ID",
        name: "jobId",
        type: "string",
        default: "",
        displayOptions: show("job", "get"),
      },
      {
        displayName: "Response",
        name: "responseMode",
        type: "options",
        default: "binary",
        displayOptions: {
          show: {
            resource: ["pdf", "image", "convert", "barcode", "zip"],
            operation: generatingOps,
          },
        },
        options: [
          { name: "Binary", value: "binary", description: "File bytes on the binary field (default for attachments)" },
          { name: "URL", value: "url", description: "JSON with a 24-hour download URL" },
          { name: "Async", value: "async", description: "Queue the job; optionally wait for bytes" },
        ],
      },
      {
        displayName: "Output Binary Field",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        displayOptions: {
          show: {
            resource: ["pdf", "image", "convert", "barcode", "zip"],
            operation: generatingOps,
            responseMode: ["binary", "async"],
          },
        },
      },
      {
        displayName: "Wait for Completion",
        name: "waitForCompletion",
        type: "boolean",
        default: true,
        description: "Whether to poll until the async job completes and return file bytes",
        displayOptions: {
          show: {
            resource: ["pdf", "image", "convert", "barcode", "zip"],
            operation: generatingOps,
            responseMode: ["async"],
          },
        },
      },
      {
        displayName: "Wait Timeout (Ms)",
        name: "waitTimeoutMs",
        type: "number",
        default: 120000,
        displayOptions: {
          show: {
            resource: ["pdf", "image", "convert", "barcode", "zip"],
            operation: generatingOps,
            responseMode: ["async"],
            waitForCompletion: [true],
          },
        },
      },
      additionalOptions,
    ],
		usableAsTool: true,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter("resource", i) as string;
        const operation = this.getNodeParameter("operation", i) as string;
        returnData.push(await executeItem.call(this, i, resource, operation));
      } catch (error) {
        if (this.continueOnFail()) {
          const err = error as Error & { description?: string };
          returnData.push({
            json: { error: err.message, code: err.description },
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}

async function executeItem(
  this: IExecuteFunctions,
  i: number,
  resource: string,
  operation: string,
): Promise<INodeExecutionData> {
  const filename = (this.getNodeParameter("filename", i, "") as string).trim();

  if (resource === "account" && operation === "get") {
    const json = (await relayPdfRequest.call(this, "GET", "/v1/account")) as IDataObject;
    return { json, pairedItem: { item: i } };
  }

  if (resource === "template" && operation === "list") {
    const json = (await relayPdfRequest.call(this, "GET", "/v1/templates")) as IDataObject;
    return { json, pairedItem: { item: i } };
  }

  if (resource === "template" && operation === "get") {
    const id = this.getNodeParameter("templateLookupId", i) as string;
    const json = (await relayPdfRequest.call(this, "GET", `/v1/templates/${id}`)) as IDataObject;
    return { json, pairedItem: { item: i } };
  }

  if (resource === "job" && operation === "get") {
    const id = this.getNodeParameter("jobId", i) as string;
    const json = (await relayPdfRequest.call(this, "GET", `/v1/jobs/${id}`)) as IDataObject;
    return { json, pairedItem: { item: i } };
  }

  if (resource === "pdf" && operation === "create") {
    const source = this.getNodeParameter("source", i) as string;
    const body: IDataObject = {};
    if (filename) body.filename = filename;
    if (source === "html") body.html = this.getNodeParameter("html", i) as string;
    if (source === "markdown") body.markdown = this.getNodeParameter("markdown", i) as string;
    if (source === "url") body.url = this.getNodeParameter("url", i) as string;
    if (source === "template") {
      body.templateId = this.getNodeParameter("templateId", i) as string;
      body.templateData = parseJsonObject.call(
        this,
        this.getNodeParameter("templateData", i, {}),
        "Template Data",
        i,
      );
      const version = this.getNodeParameter("templateVersion", i, 0) as number;
      if (version > 0) body.templateVersion = version;
      if (this.getNodeParameter("strict", i, false)) body.strict = true;
    }
    const options = pdfOptionsFromNode.call(this, i);
    if (options) body.options = options;
    return generateAndReturn.call(this, i, "/v1/pdf", body);
  }

  if (resource === "image" && operation === "create") {
    const source = this.getNodeParameter("source", i) as string;
    const additional = this.getNodeParameter("additionalOptions", i, {}) as IDataObject;
    const body: IDataObject = {};
    if (filename) body.filename = filename;
    if (source === "html") body.html = this.getNodeParameter("html", i) as string;
    if (source === "url") body.url = this.getNodeParameter("url", i) as string;
    const options: IDataObject = {};
    if (additional.imageType) options.type = additional.imageType;
    if (additional.fullPage) options.fullPage = true;
    if (additional.omitBackground) options.omitBackground = true;
    if (additional.quality) options.quality = additional.quality;
    if (additional.waitUntil) options.waitUntil = additional.waitUntil;
    if (additional.timeout) options.timeout = additional.timeout;
    if (Object.keys(options).length > 0) body.options = options;
    return generateAndReturn.call(this, i, "/v1/images", body);
  }

  if (resource === "convert" && operation === "convert") {
    const binaryIn = this.getNodeParameter("binaryPropertyNameIn", i, "data") as string;
    const file = await fileFromBinary.call(this, i, binaryIn);
    const body: IDataObject = {
      file: file.file,
      sourceFilename: file.fileName,
      to: this.getNodeParameter("to", i) as string,
      engine: this.getNodeParameter("engine", i) as string,
    };
    if (filename) body.filename = filename;
    return generateAndReturn.call(this, i, "/v1/convert", body);
  }

  if (resource === "pdf" && operation === "merge") {
    const files = await collectFiles.call(this, i, false);
    const body: IDataObject = { files };
    if (filename) body.filename = filename;
    return generateAndReturn.call(this, i, "/v1/pdf/merge", body);
  }

  if (resource === "zip" && operation === "create") {
    const files = await collectFiles.call(this, i, true);
    const body: IDataObject = { files };
    if (filename) body.filename = filename;
    return generateAndReturn.call(this, i, "/v1/zip", body);
  }

  if (resource === "pdf" && (operation === "extract" || operation === "protect" || operation === "bookmarks")) {
    const pdfSource = this.getNodeParameter("pdfSource", i, "binary") as string;
    const body: IDataObject = {};
    if (filename) body.filename = filename;
    if (pdfSource === "url") body.url = this.getNodeParameter("pdfUrl", i) as string;
    else {
      const binaryIn = this.getNodeParameter("binaryPropertyNameIn", i, "data") as string;
      const file = await fileFromBinary.call(this, i, binaryIn);
      body.file = file.file;
    }
    if (operation === "extract") body.pages = this.getNodeParameter("pages", i) as string;
    if (operation === "protect") {
      body.userPassword = this.getNodeParameter("userPassword", i) as string;
      const owner = (this.getNodeParameter("ownerPassword", i, "") as string).trim();
      if (owner) body.ownerPassword = owner;
    }
    if (operation === "bookmarks") {
      const raw = this.getNodeParameter("bookmarks", i);
      body.bookmarks = typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    return generateAndReturn.call(this, i, `/v1/pdf/${operation}`, body);
  }

  if (resource === "barcode" && operation === "create") {
    const body: IDataObject = {
      type: this.getNodeParameter("barcodeType", i) as string,
      text: this.getNodeParameter("text", i) as string,
      format: this.getNodeParameter("barcodeFormat", i) as string,
    };
    if (filename) body.filename = filename;
    return generateAndReturn.call(this, i, "/v1/barcodes", body);
  }

  throw new NodeOperationError(this.getNode(), `Unsupported operation ${resource}.${operation}`, {
    itemIndex: i,
  });
}

async function collectFiles(this: IExecuteFunctions, itemIndex: number, named: boolean): Promise<IDataObject[]> {
  const collection = this.getNodeParameter("files", itemIndex, {}) as { file?: IDataObject[] };
  const rows = collection.file ?? [];
  const files: IDataObject[] = [];
  for (const row of rows) {
    if (row.source === "binary") {
      const prop = String(row.binaryPropertyName || "data");
      const file = await fileFromBinary.call(this, itemIndex, prop);
      const entry: IDataObject = { file: file.file };
      if (named) entry.filename = String(row.filename || file.fileName);
      files.push(entry);
    } else {
      const entry: IDataObject = { url: String(row.url || "") };
      if (named) entry.filename = String(row.filename || "file.bin");
      files.push(entry);
    }
  }
  return files;
}
