import { prisma } from '../config/prisma';

export class ConfigService {
  static async get(key: string, defaultValue: string): Promise<string> {
    const setting = await (prisma as any).settings.findUnique({ where: { key } });
    return setting ? setting.value : defaultValue;
  }

  static async getInt(key: string, defaultValue: number): Promise<number> {
    const value = await this.get(key, defaultValue.toString());
    return parseInt(value, 10);
  }
}
