import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  console.log("Looking for orphaned FollowUps...");
  const followUps = await prisma.followUp.findMany();
  let deletedCount = 0;
  
  for (const f of followUps) {
    const leadExists = await prisma.lead.findUnique({ where: { id: f.leadId } });
    if (!leadExists) {
      console.log(`Deleting orphaned FollowUp (ID: ${f.id}) because Lead ${f.leadId} is missing.`);
      await prisma.followUp.delete({ where: { id: f.id } });
      deletedCount++;
    }
  }
  
  console.log(`Cleanup complete. Deleted ${deletedCount} orphaned records.`);
}

cleanup().finally(() => prisma.$disconnect());
