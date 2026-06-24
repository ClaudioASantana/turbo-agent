import { chromium, Browser, Page } from 'playwright';
import pc from 'picocolors';

class BrowserSession {
  private browser: Browser | null = null;
  public page: Page | null = null;

  async init(): Promise<Page> {
    if (!this.browser) {
      console.log(pc.cyan(`\n[Browser Subagent] Iniciando instância Headless do Chromium...`));
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }
    return this.page;
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log(pc.cyan(`[Browser Subagent] Instância do Chromium encerrada.`));
    }
  }

  async extractState(): Promise<{ text: string, url: string, base64Image: string }> {
    if (!this.page) throw new Error("No active browser session.");
    
    const url = this.page.url();
    const text = await this.page.evaluate(() => document.body.innerText);
    const buffer = await this.page.screenshot({ type: 'jpeg', quality: 50 });
    const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    
    return { text, url, base64Image };
  }
}

export const browserSession = new BrowserSession();
