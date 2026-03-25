import { prisma } from '../config/prisma';

type LogLevel = 'info' | 'warn' | 'error' | 'decision';

export class BotLogger {
  static async log(
    level: LogLevel,
    event: string,
    message: string,
    opts?: { leadId?: string; chatId?: string; meta?: object }
  ) {
    try {
      // Always print to console too
      const prefix = `[${level.toUpperCase()}][${event}]`;
      if (level === 'error') console.error(prefix, message, opts?.meta || '');
      else console.log(prefix, message, opts?.meta || '');

      await (prisma as any).botLog.create({
        data: {
          level,
          event,
          message,
          leadId: opts?.leadId,
          chatId: opts?.chatId,
          meta: opts?.meta ? JSON.stringify(opts.meta) : null,
        },
      });
    } catch (e) {
      // Never crash the main flow because of logging
      console.error('[LOGGER ERROR]', e);
    }
  }

  static info(event: string, message: string, opts?: { leadId?: string; chatId?: string; meta?: object }) {
    return BotLogger.log('info', event, message, opts);
  }

  static warn(event: string, message: string, opts?: { leadId?: string; chatId?: string; meta?: object }) {
    return BotLogger.log('warn', event, message, opts);
  }

  static error(event: string, message: string, opts?: { leadId?: string; chatId?: string; meta?: object }) {
    return BotLogger.log('error', event, message, opts);
  }

  static decision(event: string, message: string, opts?: { leadId?: string; chatId?: string; meta?: object }) {
    return BotLogger.log('decision', event, message, opts);
  }
}
