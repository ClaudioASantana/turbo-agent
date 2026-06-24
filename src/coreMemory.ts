import * as fs from 'fs';
import * as path from 'path';

export class CoreMemory {
    private static filePath = path.join(process.cwd(), '.agent_core_memory.json');

    public static getRules(): string[] {
        if (!fs.existsSync(this.filePath)) {
            return [];
        }
        try {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }

    public static addRule(rule: string): void {
        const rules = this.getRules();
        if (!rules.includes(rule)) {
            rules.push(rule);
            fs.writeFileSync(this.filePath, JSON.stringify(rules, null, 2), 'utf-8');
        }
    }

    public static clearRules(): void {
        if (fs.existsSync(this.filePath)) {
            fs.unlinkSync(this.filePath);
        }
    }
}
