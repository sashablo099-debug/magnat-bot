import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const baseUrl = process.env.BITRIX_WEBHOOK_URL;

async function checkBitrix() {
  try {
    console.log("Fetching list of all fields in CRM Lead to find the Instagram username field...");
    const fieldsRes = await axios.get(`${baseUrl}crm.lead.fields`);
    const fields = fieldsRes.data.result;
    
    // Шукаємо поля, де назва пов'язана з Instagram або Wazzup
    const customFields = Object.keys(fields).filter(key => 
      key.includes('UF_CRM') || 
      fields[key].title.toLowerCase().includes('instagram') ||
      fields[key].title.toLowerCase().includes('wazzup') ||
      fields[key].title.toLowerCase().includes('insta')
    );
    
    console.log("\n--- Possible Instagram Fields in Bitrix ---");
    customFields.forEach(key => {
        console.log(`Field Code: ${key} | Title: ${fields[key].title}`);
    });

    console.log("\nFetching recent leads to see how their data looks...");
    const response = await axios.post(`${baseUrl}crm.lead.list`, {
      order: { "DATE_CREATE": "DESC" },
      select: ["ID", "TITLE", "STATUS_ID", ...customFields.slice(0, 10)], // get first 10 custom fields
      limit: 3
    });
    
    console.log("\n--- Recent 3 Leads in CRM ---");
    console.log(JSON.stringify(response.data.result, null, 2));

  } catch (error: any) {
    console.error('Error fetching from Bitrix:', error.response?.data || error.message);
  }
}

checkBitrix();
