sudo docker run -d -p 6379:6379 --add-host=host.docker.internal:host-gateway --restart=unless-stopped --name redis redis

use host.docker.internal as in place of localhost - redis.

## B2B Quotations (PDF generation)

Quotation PDFs are rendered with Puppeteer (headless Chromium) and uploaded to R2.

- Puppeteer downloads a matching Chromium build on `npm install`.
- In Docker, the base image must include Chromium's shared libraries (e.g. `libnss3`,
  `libatk-bridge2.0-0`, `libgbm1`, `libasound2`, fonts). The browser is launched with
  `--no-sandbox --disable-setuid-sandbox` for container compatibility.
- Required env vars: `ADMIN_WHATSAPP_NUMBER` (admin number for the `wa.me` deep link) and
  optionally `MAX_CART_QTY_PER_ITEM` (per-item cart cap, defaults to 9999 to allow MOQ-sized
  quantities). See `example.env`.