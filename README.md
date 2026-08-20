# n8n-nodes-relaypdf

Official [n8n](https://n8n.io/) community node for [RelayPDF](https://relaypdf.com). HTML, Markdown, URLs, and published Handlebars templates in. Production PDFs out. Chromium and LibreOffice run on RelayPDF, not on the n8n host.

Public source: [timspell1/n8n-nodes-relaypdf](https://github.com/timspell1/n8n-nodes-relaypdf). npm publishes from GitHub Actions with provenance.

## Install

**Self-hosted:** Settings → Community Nodes → Install `n8n-nodes-relaypdf`.

**n8n Cloud:** search RelayPDF in the nodes panel after n8n verifies the package. Until then, HTTP Request still works — see [the integration guide](https://relaypdf.com/integrations/n8n).

## Credential

Create a **RelayPDF API** credential. Paste the dashboard key (`pdf_live_…`) with no `Bearer` prefix. Connection test calls `GET /v1/account` and is not billed. Do not put the key in the workflow JSON or query string.

## Operations

| Resource | Operation | Endpoint |
|----------|-----------|----------|
| PDF | Create (HTML / Markdown / URL / Template) | `POST /v1/pdf` |
| PDF | Merge / Extract / Protect / Bookmarks | `POST /v1/pdf/*` |
| Convert | Convert File | `POST /v1/convert` |
| Image | Create | `POST /v1/images` |
| Barcode | Create | `POST /v1/barcodes` |
| Zip | Create | `POST /v1/zip` |
| Template | List / Get | `GET /v1/templates` |
| Job | Get | `GET /v1/jobs/:id` |
| Account | Get | `GET /v1/account` |

Default **Response** is **Binary**, output field `data`. Point Gmail, Slack, and Google Drive at that field. **URL** returns a 24-hour download. **Async** can wait and still return bytes.

Convert File reads n8n binary and sets `sourceFilename` from the incoming file name. Do not base64-encode in a Code node.

## Trigger

**RelayPDF Trigger** receives dashboard webhooks. Copy the node webhook URL into [Dashboard → Webhooks](https://relaypdf.com/dashboard/webhooks). Paste the secret shown once into the trigger. Events are HMAC-SHA256 (`RelayPDF-Signature`).

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

## Docs

- https://relaypdf.com/integrations/n8n
- https://relaypdf.com/docs/n8n
- https://relaypdf.com/blog/n8n-pdf-generation

Failed operations are never billed. HTML, Markdown, and file contents are never logged by RelayPDF.

## License

MIT
