import {db} from '../server/db';
import {schoolSettings} from '../server/access';
import {suppliedTuition,suppliedTransport} from '../shared/fee-schedule';
import {classKey} from '../shared/student-register';
try {
  const {academicSession:session}=await schoolSettings();
  const source='Open Mind’s School Fee Structure Infographic.png';
  await db.$transaction(async tx=>{
    for(const rate of suppliedTuition){
      const existing=await tx.entry.findMany({where:{module:'feeStructures',title:'Tuition fee',archived:false,AND:[{data:{path:['session'],equals:session}},{data:{path:['frequency'],equals:'Monthly'}}]}});
      const match=existing.find(row=>classKey((row.data as any).className)===classKey(rate.className));
      if(match){if(Number((match.data as any).amount)!==rate.amount)throw new Error(`Existing rate differs for ${rate.className}; no records changed.`);continue;}
      await tx.entry.create({data:{id:`tuition:${session}:${classKey(rate.className)}`,module:'feeStructures',title:'Tuition fee',status:'Active',data:{className:rate.className,session,amount:rate.amount,frequency:'Monthly'}}});
    }
    const id=`transport-fees:${session}`,existing=await tx.configuration.findUnique({where:{id}});
    if(existing&&JSON.stringify((existing.data as any).routes)!==JSON.stringify(suppliedTransport))throw new Error('Transport rates already differ; no records changed.');
    if(!existing)await tx.configuration.create({data:{id,data:{session,frequency:'Monthly',currency:'INR',routes:suppliedTransport,source}}});
    await tx.configuration.upsert({where:{id:`fee-source:${session}`},create:{id:`fee-source:${session}`,data:{source,session,importedAt:new Date().toISOString()}},update:{}});
  });
  console.log(`Saved monthly fee schedule for ${session}: 11 tuition classes and 6 transport routes. No student invoices created.`);
}finally{await db.$disconnect();}
