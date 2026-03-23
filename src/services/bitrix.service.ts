import axios from 'axios';
import { env } from '../config/env';

export class BitrixService {
  private static baseUrl = env.BITRIX_WEBHOOK_URL;

  /**
   * Finds a Bitrix Lead by their Instagram username.
   */
  static async findLeadByInstagram(username: string): Promise<{ id: string; statusId: string } | null> {
    try {
      // 1. Спочатку шукаємо точний збіг (напр. "no_schoo1")
      let response = await axios.post(`${this.baseUrl}crm.lead.list`, {
        filter: { UF_CRM_INSTAGRAM_WZ: username },
        select: ['ID', 'STATUS_ID'],
      });

      let leads = response.data.result;

      // 2. Якщо не знайшли, шукаємо з "@" (напр. "@no_schoo1") - бо так часто зберігають менеджери
      if (!leads || leads.length === 0) {
        response = await axios.post(`${this.baseUrl}crm.lead.list`, {
          filter: { UF_CRM_INSTAGRAM_WZ: `@${username}` },
          select: ['ID', 'STATUS_ID'],
        });
        leads = response.data.result;
      }

      if (leads && leads.length > 0) {
        return {
          id: leads[0].ID,
          statusId: leads[0].STATUS_ID,
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching lead from Bitrix:', error);
      return null;
    }
  }

  /**
   * Updates lead status in Bitrix
   */
  static async updateLeadStatus(leadId: string, statusId: string): Promise<boolean> {
    try {
      await axios.post(`${this.baseUrl}crm.lead.update`, {
        id: leadId,
        fields: {
          STATUS_ID: statusId,
        },
      });
      return true;
    } catch (error) {
      console.error('Error updating lead status in Bitrix:', error);
      return false;
    }
  }
}
