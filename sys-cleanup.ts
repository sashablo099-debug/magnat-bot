import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function deleteLead() {
  const chatId = 'no_schoo1';
  console.log(`Searching for lead with chatId: ${chatId}`);
  
  const lead = await prisma.lead.findUnique({
    where: { chatId }
  });
  
  if (!lead) {
    console.log(`Lead ${chatId} not found in database.`);
    return;
  }
  
  console.log(`Found lead ${lead.id}. Deleting messages AND followups...`);
  
  await prisma.message.deleteMany({
    where: { leadId: lead.id }
  });
  
  await prisma.followUp.deleteMany({
    where: { leadId: lead.id }
  });
  
  await prisma.lead.delete({
    where: { id: lead.id }
  });
  
  console.log(`Successfully deleted lead ${chatId} and all its trace history!`);
}

deleteLead().finally(() => prisma.$disconnect());
