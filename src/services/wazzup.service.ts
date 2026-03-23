import axios from 'axios';
import { env } from '../config/env';

export class WazzupService {
  private static apiUrl = 'https://api.wazzup24.com/v3/message';

  /**
   * Sends a message to a client via Wazzup.
   */
  static async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      await axios.post(
        this.apiUrl,
        {
          channelId: '4ec9ed0e-2091-454f-bb8a-b624045e4e54',
          chatId: chatId,
          chatType: 'instagram',
          text: text,
        },
        {
          headers: {
            Authorization: `Bearer ${env.WAZZUP_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    } catch (error) {
      console.error('Error sending message via Wazzup:', error);
      return false;
    }
  }
}
