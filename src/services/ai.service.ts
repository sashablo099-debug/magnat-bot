import OpenAI from 'openai';
import { env } from '../config/env';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface AIDecisionInput {
  conversationHistory: { sender: string; text: string; timestamp: Date }[];
  lastManagerMessageTimestamp: Date;
  currentLeadStatus: string;
  timePassedMinutes: number;
}

export interface AIDecisionOutput {
  send_followup: boolean;
  reason_code: 'GREETING_ONLY' | 'NO_QUESTION' | 'CLIENT_CLOSED' | 'VALID_FOLLOWUP' | 'NO_ENGAGEMENT';
  waiting_for_client: boolean;
  language: 'ru' | 'ua' | 'en';
  engagement_level: 'low' | 'medium' | 'high';
  timing_decision: 'send_now' | 'delay_more' | 'cancel';
  delay_minutes: number;
  template_group: 'A' | 'B';
}

export class AIService {
  static async evaluateFollowUp(input: AIDecisionInput): Promise<AIDecisionOutput | null> {
    try {
      const historyText = input.conversationHistory
        .map((msg) => `[${msg.timestamp.toISOString()}] ${msg.sender.toUpperCase()}: ${msg.text}`)
        .join('\n');

      const systemPrompt = `You are a strict, intelligent sales assistant decision engine for a jewelry store on Instagram.
You analyze the conversation history to decide if and when to send a follow-up message.
Avoid spam. Do not send if the manager just said thank you, conversation ended politely, client said they will contact later, or there is no real engagement.

- Your core function is to schedule a check exactly 10 minutes AFTER the manager's last message.
- If the manager JUST replied (less than 10 minutes ago), you MUST NOT send immediately. Output "timing_decision": "delay_more" and "delay_minutes": 10.
- IMPORTANT: Even if some time has already passed, you should still return "delay_minutes": 10 to ensure a substantial gap.
- Output "timing_decision": "send_now" ONLY if at least 10-15 minutes have ALREADY passed since the manager's last message and the client still hasn't replied.
- Output "timing_decision": "cancel" if no follow-up is needed at all.

Return STRICT JSON with the following structure:
{
  "send_followup": true/false,
  "reason_code": "GREETING_ONLY" | "NO_QUESTION" | "CLIENT_CLOSED" | "VALID_FOLLOWUP" | "NO_ENGAGEMENT",
  "waiting_for_client": true/false,
  "language": "ru" | "ua" | "en",
  "engagement_level": "low" | "medium" | "high",
  "timing_decision": "send_now" | "delay_more" | "cancel",
  "delay_minutes": number,
  "template_group": "A" | "B"
}`;

      const userPrompt = `Input context:
- Current Lead Status: ${input.currentLeadStatus}
- Time passed since trigger: ${input.timePassedMinutes} minutes
- Last Manager Message At: ${input.lastManagerMessageTimestamp.toISOString()}

Chat History (Last 50 messages):
${historyText}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0].message.content;
      if (!content) return null;

      return JSON.parse(content) as AIDecisionOutput;
    } catch (error) {
      console.error('Error evaluating AI decision:', error);
      return null;
    }
  }
}
