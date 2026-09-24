# n8n-nodes-relaypdf

Official [n8n](https://n8n.io/) community node for [RelayPDF](https://relaypdf.com).

**HTML to PDFs without the struggle.** HTML to PDF API that converts HTML, Markdown, URLs, and published Handlebars templates to production PDFs. Chromium and LibreOffice run on RelayPDF, not on the n8n host.

- **Docs:** [relaypdf.com/docs/n8n](https://relaypdf.com/docs/n8n) · [integration guide](https://relaypdf.com/integrations/n8n)
- **npm:** [`n8n-nodes-relaypdf`](https://www.npmjs.com/package/n8n-nodes-relaypdf)
- **Source:** [timspell1/n8n-nodes-relaypdf](https://github.com/timspell1/n8n-nodes-relaypdf) (publishes with npm provenance)
- **REST:** `https://api.relaypdf.com` · [OpenAPI](https://relaypdf.com/openapi.json)

Failed operations are never billed. HTML, Markdown, and file contents are never logged by RelayPDF.

## Install

**Self-hosted:** Settings → Community Nodes → Install `n8n-nodes-relaypdf`.

**n8n Cloud:** search RelayPDF in the nodes panel after n8n verifies the package. Until then, HTTP Request still works (see below).

## Credential

Create a **RelayPDF API** credential.

1. Sign in at [relaypdf.com](https://relaypdf.com) → [Dashboard → API keys](https://relaypdf.com/dashboard/keys).
2. Paste the key (`pdf_live_…`) with **no** `Bearer` prefix.
3. Connection test calls `GET /v1/account` and is **not billed**.

Do not put the key in the workflow JSON or query string.

Default API origin: `https://api.relaypdf.com`.

## Authentication

HTTP Bearer on every RelayPDF request the node makes (`Authorization: Bearer <key>`). Not JWT.

## Rate limiting and wallet

Trial wallets: 20 requests/minute. Funded or auto-reload: 60/minute. Burst: 5 / 10 seconds. Empty wallet → `402 payment_required` (not billed).

Ledger unit is millicents (1 = $0.001). Final HTML PDF is **$0.0004/job + $0.0003/browser second**; convert **$0.0004/job + $0.0005/execution second**; tools **$0.002**. See [wallet](https://relaypdf.com/docs/wallet).

## Nodes

| Node | Role |
|------|------|
| **RelayPDF** | Generate, convert, merge, tools, barcodes, zip, templates, jobs, account |
| **RelayPDF Trigger** | Signed dashboard webhooks (`RelayPDF-Signature`) |

## Operations

Default **Response** is **Binary**, output field `data`. Point Gmail, Slack, and Google Drive at that field. **URL** returns a 24-hour download. **Async** can wait and still return bytes.

| Resource | Operation | HTTP | Description |
|----------|-----------|------|-------------|
| PDF | Create | `POST /v1/pdf` | HTML, Markdown, URL, or published template → PDF |
| PDF | Merge | `POST /v1/pdf/merge` | Merge 2–20 PDFs |
| PDF | Extract Pages | `POST /v1/pdf/extract` | Page ranges |
| PDF | Protect | `POST /v1/pdf/protect` | Password-protect |
| PDF | Unlock | `POST /v1/pdf/unlock` | Remove password |
| PDF | Add Bookmarks | `POST /v1/pdf/bookmarks` | Outline |
| PDF | Raster | `POST /v1/pdf/raster` | Pages → PNG/JPEG (zip if many) |
| PDF | From Images | `POST /v1/pdf/from-images` | PNG/JPEG → PDF |
| PDF | Stamp | `POST /v1/pdf/stamp` | Text watermark |
| PDF | Rotate | `POST /v1/pdf/rotate` | Multiples of 90° |
| PDF | Delete Pages | `POST /v1/pdf/delete-pages` | Drop pages |
| PDF | Compress | `POST /v1/pdf/compress` | Lossless optimize |
| PDF | Info | `POST /v1/pdf/info` | Page count / metadata JSON |
| PDF | Text | `POST /v1/pdf/text` | Existing text layer |
| PDF | Extract Data | `POST /v1/pdf/data` | Schema extract or Markdown |
| PDF | Form Fields | `POST /v1/pdf/form/fields` | List AcroForm fields |
| PDF | Fill Form | `POST /v1/pdf/form/fill` | Fill and flatten |
| Convert | Convert File | `POST /v1/convert` | LibreOffice / wkhtmltopdf |
| Document | Process | native paths | OCR, PDF/A, crop, resize, repair, optimize, attachments, extract-images, redact, compress, image-convert, email |
| Image | Create | `POST /v1/images` | HTML or URL → png/jpeg/webp |
| Barcode | Create | `POST /v1/barcodes` | QR / 1D / 2D |
| Zip | Create | `POST /v1/zip` | Zip files |
| Template | List | `GET /v1/templates` | Drafts |
| Template | Get | `GET /v1/templates/:id` | One template |
| Job | Get | `GET /v1/jobs/:id` | Async poll |
| Account | Get | `GET /v1/account` | Plan, rate tier, millicents (not billed) |

Convert File reads n8n binary and sets `sourceFilename` from the incoming file name. Do **not** base64-encode in a Code node.

Create PDF template body the node sends:

```json
{
  "templateId": "invoice",
  "templateData": { "number": "INV-1042", "total": 1458 },
  "filename": "invoice.pdf"
}
```

## Trigger

**RelayPDF Trigger** receives dashboard webhooks.

1. Copy the node webhook URL into [Dashboard → Webhooks](https://relaypdf.com/dashboard/webhooks).
2. Paste the secret shown **once** into the trigger.

Events are HMAC-SHA256. Header `RelayPDF-Signature`: `t=<unix>,v1=<hex>` of `{t}.{raw_body}`. Event header: `RelayPDF-Event`.

Events: `job.completed`, `job.failed`, `wallet.topup`, `wallet.auto_reload`, `wallet.auto_reload_failed`, `wallet.payment_required`.

## Errors

Same codes as REST / SDKs (`unauthorized`, `payment_required`, `rate_limited`, `convert_unavailable`, …). See [errors](https://relaypdf.com/docs/errors). Raster and convert may take up to ~90s on a cold document worker.

## Workflows

Importable JSON lives in [`workflows/`](./workflows):

- Template invoice via webhook → Gmail
- HTML report → Gmail + Google Drive
- Stripe payment → template PDF → Gmail
- Scheduled URL snapshot → Slack + Drive
- Gmail Office attachment → convert → Drive

After import, attach a RelayPDF API credential. Template workflows assume a published template slug such as `invoice`.

## HTTP Request fallback

If community nodes are disabled:

```
POST https://api.relaypdf.com/v1/pdf
Authorization: Bearer pdf_live_…
Content-Type: application/json
Response Format: File
Put Output in Field: data
```

Body example: `{ "html": "<h1>Hi</h1>", "filename": "hi.pdf" }`.

## Related packages

| Package | Role |
|---------|------|
| [`@relaypdf/sdk`](https://www.npmjs.com/package/@relaypdf/sdk) | Node / TypeScript SDK |
| [`@relaypdf/cli`](https://www.npmjs.com/package/@relaypdf/cli) | CLI + MCP |
| [`relaypdf`](https://pypi.org/project/relaypdf/) | Python SDK |
| [PHP / C# / Java SDKs](https://relaypdf.com/docs/sdks) | `sdks/php`, `sdks/dotnet`, `sdks/java` |

## License

MIT. Strategic Products LLC, d/b/a RelayPDF.
