import {db} from './db.js';
import {currentVersions} from './fee-office-core.js';
import {classKey} from '../shared/student-register.js';
import type {FeeSchedule,TransportRate} from '../shared/fee-schedule.js';
export async function readFeeSchedule(session:string):Promise<FeeSchedule>{
  const versions=await db.feeVersion.findMany({where:{session}});
  if(versions.length){const current=currentVersions(versions).filter(r=>r.active);return {session,tuition:current.filter(r=>r.kind==='structure'&&r.data.category==='Tuition Fee'&&r.data.frequency==='Monthly').map(r=>({id:r.id,className:r.data.className,amount:r.data.amount/100})),transport:current.filter(r=>r.kind==='route').map(r=>({route:r.data.name,amount:r.data.amount/100}))};}
  const [rows,transport]=await Promise.all([
    db.entry.findMany({where:{module:'feeStructures',title:'Tuition fee',archived:false,AND:[{data:{path:['session'],equals:session}},{data:{path:['frequency'],equals:'Monthly'}}]}}),
    db.configuration.findUnique({where:{id:`transport-fees:${session}`}}),
  ]);
  const order=['nursery','lkg','ukg',...Array.from({length:8},(_,i)=>`class-${i+1}`)];
  return {session,tuition:rows.map(row=>({id:row.id,className:String((row.data as any).className),amount:Number((row.data as any).amount)})).sort((a,b)=>order.indexOf(classKey(a.className))-order.indexOf(classKey(b.className))),transport:((transport?.data as any)?.routes||[]) as TransportRate[]};
}
