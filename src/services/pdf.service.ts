import ejs from 'ejs';
import puppeteer, { Browser } from 'puppeteer';
import { uploadToR2 } from '../utils/r2.util';
import { InternalServerError } from '../errors/internal-server.error';
import logger from '../utils/logger';

const TEMPLATE_PATH = 'src/templates/quotation.ejs';

class PdfService {
  private _browser: Browser | null = null;
  private _launchPromise: Promise<Browser> | null = null;

  private async _getBrowser(): Promise<Browser> {
    if (this._browser && this._browser.connected) return this._browser;
    if (!this._launchPromise) {
      this._launchPromise = puppeteer
        .launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
        .then((b) => { this._browser = b; this._launchPromise = null; return b; })
        .catch((e) => { this._launchPromise = null; throw e; });
    }
    return this._launchPromise;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async renderQuotationPdf(data: any): Promise<string> {
    try {
      const html = await ejs.renderFile(TEMPLATE_PATH, data);
      const browser = await this._getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html as string, { waitUntil: 'load' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        const buffer = Buffer.from(pdf);
        return await uploadToR2(buffer, 'quotations', 'application/pdf');
      } finally {
        await page.close();
      }
    } catch (err) {
      logger.error(`Quotation PDF generation failed: ${err}`);
      throw new InternalServerError('Failed to generate quotation PDF');
    }
  }
}

export default new PdfService();
