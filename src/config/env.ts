import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().default('3000'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WAZZUP_API_KEY: z.string(),
  BITRIX_WEBHOOK_URL: z.string(),
  OPENAI_API_KEY: z.string(),
  WEBHOOK_SECRET: z.string(),
});

export const env = envSchema.parse(process.env);
