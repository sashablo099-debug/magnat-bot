import { BitrixService } from './src/services/bitrix.service';

async function test() {
  const result = await BitrixService.findLeadByInstagram('no_schoo1');
  console.log("no_schoo1:", result);
  
  const result2 = await BitrixService.findLeadByInstagram('sanchiz.es');
  console.log("sanchiz.es:", result2);
}

test();

test();
