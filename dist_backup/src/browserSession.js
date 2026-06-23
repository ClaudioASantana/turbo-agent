"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.browserSession = void 0;
const playwright_1 = require("playwright");
const picocolors_1 = __importDefault(require("picocolors"));
class BrowserSession {
    browser = null;
    page = null;
    async init() {
        if (!this.browser) {
            console.log(picocolors_1.default.cyan(`\n[Browser Subagent] Iniciando instância Headless do Chromium...`));
            this.browser = await playwright_1.chromium.launch({ headless: true });
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
            console.log(picocolors_1.default.cyan(`[Browser Subagent] Instância do Chromium encerrada.`));
        }
    }
    async extractState() {
        if (!this.page)
            throw new Error("No active browser session.");
        const url = this.page.url();
        const text = await this.page.evaluate(() => document.body.innerText);
        const buffer = await this.page.screenshot({ type: 'jpeg', quality: 50 });
        const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        return { text, url, base64Image };
    }
}
exports.browserSession = new BrowserSession();
