import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDB() {
  console.log("--- LEADS ---");
  const leads = await prisma.lead.findMany();
  console.log(leads);

  console.log("\n--- RECENT MESSAGES ---");
  const messages = await prisma.message.findMany({
    orderBy: { timestamp: 'desc' },
    take: 5
  });
  console.log(messages);

  console.log("\n--- FOLLOWUPS ---");
  const followups = await prisma.followUp.findMany();
  console.log(followups);
}

checkDB().finally(() => prisma.$disconnect());
