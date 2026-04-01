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

      const systemPrompt = `You are a decision engine for a LUXURY JEWELRY store's Instagram follow-up automation.
High-value clients. Zero tolerance for spam. Zero tolerance for lost leads.

=== STEP 1: Find the last message and who sent it ===
The chat history is chronological (oldest first, newest last).

=== STEP 2: If MANAGER sent last message ===
The client has NOT responded yet.
→ Ask: Is the manager's last message a real question, offer, or invitation? (e.g. "When can you visit?", "Shall I send you options?", "Чекатиму зворотній зв'язок")
  If YES:
    - If passed time represents the 15-minute debounce (e.g. timePassedMinutes < 1000) → It's too fast for high jewelry! Decide: delay_more, delay_minutes: 1440
    - If passed time is ~24 hours (e.g. timePassedMinutes >= 1000) → Client has been quiet for a day. Decide: send_now, VALID_FOLLOWUP, Template B
  If NO (just "ok", "yes", "👍", or manager said "Goodbye"):
    - cancel, NO_QUESTION

=== STEP 3: If CLIENT sent last message ===
Analyze the CONTENT and INTENT of the client's last message carefully:

GROUP 1 — WARM / UNDECIDED (client is still in the game, needs a nudge):
  • "Спасибо", "Дякую", "Thank you" — polite acknowledgement, NOT a goodbye
  • "Подумаю", "Буду думать", "I'll think about it"
  • "Пока сравниваю", "Comparing prices"
  • "Может быть", "Возможно", "Maybe"
  • "Могу ли я прийти", "Can I come" — intent to visit without confirming time
  • "Напишу позже", "I'll write later"
  → These are WARM LEADS. Schedule follow-up for later.
  → But ONLY if enough time has passed since that message (15+ min)
  → send_followup: true, timing_decision: "send_now" or "delay_more", reason: CLIENT_STILL_DECIDING, Template B

GROUP 2 — CLEAR REJECTION (do NOT send):
  • "Не интересно", "Not interested", "Не цікаво"
  • "Дорого, не буду", "Too expensive, no thanks"
  • "Купил в другом месте", "Found elsewhere"
  • "Не нужно", "No need"
  • "Всё, спасибо, не надо" — firm goodbye with refusal
  → cancel, CLIENT_REJECTED

GROUP 3 — CLIENT ASKED A QUESTION (do NOT send, wait for manager):
  • Client ended with a question: "А есть ли у вас...?", "Сколько стоит...?"
  • Manager should answer first, bot should wait
  → cancel, reason: CLIENT_ACTIVE (manager needs to reply first)

=== TIMING ===
- Less than ~24 hours passed (e.g. timePassedMinutes < 1000) AND a follow-up is warranted → delay_more (wait 24 hours), delay_minutes: 1440
- ~24+ hours passed (e.g. timePassedMinutes >= 1000) AND a follow-up is warranted → send_now
- No follow-up needed or conversation naturally ended → cancel

=== TEMPLATE ===
A = cold lead, minimal engagement
B = warm lead, showed real interest

Return STRICT JSON:
{
  "send_followup": true/false,
  "reason_code": "GREETING_ONLY" | "NO_QUESTION" | "CLIENT_CLOSED" | "VALID_FOLLOWUP" | "NO_ENGAGEMENT" | "CLIENT_STILL_DECIDING" | "CLIENT_REJECTED" | "CLIENT_ACTIVE",
  "waiting_for_client": true/false,
  "language": "ru" | "ua" | "en",
  "engagement_level": "low" | "medium" | "high",
  "timing_decision": "send_now" | "delay_more" | "cancel",
  "delay_minutes": number,
  "template_group": "A" | "B"
}`;

      const lastMsg = input.conversationHistory[input.conversationHistory.length - 1];
      const lastMsgInfo = lastMsg ? `LAST MESSAGE: [${lastMsg.sender.toUpperCase()}] "${lastMsg.text.slice(0, 120)}"` : 'No messages';

      const userPrompt = `Analyze this luxury jewelry conversation and decide if a follow-up is needed.

Context:
- Minutes since manager's last message: ${input.timePassedMinutes}
- ${lastMsgInfo}

Full Chat (chronological, oldest→newest):
${historyText}

KEY: Who sent the LAST message above? If CLIENT → cancel. If MANAGER (and client hasn't responded, and it's been 15+ min) → consider sending.`;

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
