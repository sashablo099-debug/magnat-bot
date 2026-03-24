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
  reason_code: 'GREETING_ONLY' | 'NO_QUESTION' | 'CLIENT_CLOSED' | 'VALID_FOLLOWUP' | 'NO_ENGAGEMENT' | 'CLIENT_STILL_DECIDING' | 'CLIENT_REJECTED';
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

      const systemPrompt = `You are a decision engine for a LUXURY JEWELRY store's Instagram sales automation.
Your goal is to protect warm leads from being lost — but also to never annoy clients who have clearly closed the conversation.

=== THE CORE QUESTION TO ASK ===
"Is this client still potentially interested in buying, even if they haven't committed yet?"

=== WHEN TO SEND A FOLLOW-UP (any of these = send) ===
✓ Manager asked a question or made an offer, and client NEVER responded
✓ Client said ambiguous things like:
  - "I'm comparing prices" / "пока сравниваю цены" / "порівнюю ціни"
  - "I'll think about it" / "подумаю" / "буду думати"
  - "Maybe later" / "возможно позже" / "можливо пізніше"
  - "Thank you, I'll contact you" / "спасибо, я свяжусь"
  - "Interesting, but I need to think"
  These people are WARM LEADS. They need a gentle follow-up.
  → send_followup: true, reason_code: "CLIENT_STILL_DECIDING"

=== WHEN TO CANCEL (do NOT send a follow-up) ===
✗ Client explicitly said they are NOT interested:
  - "Not interested" / "не интересно" / "не цікаво"
  - "Too expensive, no thanks" / "дорого, откажусь"
  - "I bought elsewhere" / "купил в другом месте"
  - "Goodbye" with finality / "до свидания, спасибо, но нет"
✗ Conversation ended with a purchase or booking confirmed
✗ Manager only sent a greeting with no real sales content
✗ Client is clearly NOT in the target market (just curious, no buying signal)

=== TIMING RULES ===
- If less than 15 minutes passed since manager's last message → timing_decision: "delay_more", delay_minutes: 15
- If the conversation warrants a follow-up AND enough time has passed → timing_decision: "send_now"
- If no follow-up is needed → timing_decision: "cancel"

=== TEMPLATE CHOICE ===
- Template A: Simple re-engagement ("Are you still interested?") — for cold/no-response
- Template B: Offer help / alternatives — for "comparing prices" / "thinking about it" clients

=== LANGUAGE ===
Detect the language the CLIENT used most. Output: "ru", "ua", or "en".

Return STRICT JSON only:
{
  "send_followup": true/false,
  "reason_code": "GREETING_ONLY" | "NO_QUESTION" | "CLIENT_CLOSED" | "VALID_FOLLOWUP" | "NO_ENGAGEMENT" | "CLIENT_STILL_DECIDING" | "CLIENT_REJECTED",
  "waiting_for_client": true/false,
  "language": "ru" | "ua" | "en",
  "engagement_level": "low" | "medium" | "high",
  "timing_decision": "send_now" | "delay_more" | "cancel",
  "delay_minutes": number,
  "template_group": "A" | "B"
}`;

      const userPrompt = `Analyze this luxury jewelry store Instagram conversation.

Context:
- Time passed since manager's last message: ${input.timePassedMinutes} minutes
- Last Manager Message At: ${input.lastManagerMessageTimestamp.toISOString()}

Read the FULL conversation carefully. Identify the client's TRUE intent — are they still potentially interested? Or have they firmly closed the door?

Full Chat History:
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

      const result = JSON.parse(content) as AIDecisionOutput;
      console.log(`[AI] reason=${result.reason_code}, timing=${result.timing_decision}, send=${result.send_followup}, lang=${result.language}`);
      return result;
    } catch (error) {
      console.error('Error evaluating AI decision:', error);
      return null;
    }
  }
}
