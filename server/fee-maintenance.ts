import {db} from './db.js';
import {currentVersions,day,balance,effectiveDue,notify,serial} from './fee-office-core.js';
// A persistent Node deployment runs this job. Serverless deployments call the
// same entry point from their scheduler; all deliveries have unique event keys.
export async function syncFeeReminders(){
 const versions=await db.feeVersion.findMany({where:{kind:'settings'}}),sessions=[...new Set(versions.map(v=>v.session))];let count=0;
 for(const session of sessions){const policy=currentVersions(versions.filter(v=>v.session===session)).find(v=>v.active);if(!policy?.data.autoReminders)continue;
  const today=day(),until=new Date(Date.parse(today)+Number(policy.data.reminderDays)*86400000).toISOString().slice(0,10);
  const invoices=await db.invoice.findMany({where:{session,issueStatus:'Issued',studentId:{not:null}},include:{student:true,payments:{include:{refunds:true}},installments:{orderBy:{number:'asc'}}}});
  for(const invoice of invoices){if(!balance(invoice)||!invoice.student||invoice.student.archived)continue;const dueDates=[effectiveDue(invoice)];if(!dueDates.some(d=>d<=until))continue;
   const overdue=effectiveDue(invoice)<today,title=overdue?'Invoice overdue':invoice.installments.length?'Installment due':'School fee due soon';
   await serial(async tx=>{const event=`automatic-fee-reminder:${invoice.id}:${today}`;await notify(tx,invoice.student,event,title,`${invoice.number} · INR ${(balance(invoice)/100).toFixed(2)} outstanding. Contact school accounts for details.`);});count++;
  }
 }return {processed:count};
}
export function startFeeMaintenance(){let running=false;const tick=async()=>{if(running)return;running=true;try{await syncFeeReminders();}catch(e:any){console.error('Fee reminder maintenance failed:',e.code||e.name);}finally{running=false;}};void tick();const timer=setInterval(()=>void tick(),15*60*1000);timer.unref();return timer;}
