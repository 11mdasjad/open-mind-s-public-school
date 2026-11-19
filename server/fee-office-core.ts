import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { db } from './db';
import { classKey } from '../shared/student-register';
import { suppliedTuition, suppliedTransport } from '../shared/fee-schedule';
export const day = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
export class FeeOfficeError extends Error {constructor(public status:number,message:string){super(message);}}
export function reject(status:number,message:string):never {throw new FeeOfficeError(status,message);}
export const dateValue=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid date');
export const periodValue=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const amountValue=z.union([z.string(),z.number()]).transform((v,ctx)=>{
 const s=String(v);if(!/^\d{1,7}(\.\d{1,2})?$/.test(s)){ctx.addIssue({code:'custom',message:'Enter a non-negative amount with at most two decimal places.'});return z.NEVER;}
 const [whole,fraction='']=s.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
});
export const percent=(amount:number,basisPoints:number)=>Number((BigInt(amount)*BigInt(basisPoints)+5000n)/10000n);
export const sum=(rows:any[],field:string)=>rows.reduce((n,r)=>n+Number(r[field]||0),0);
export const paid=(invoice:any)=>invoice.payments.reduce((n:number,p:any)=>n+p.amount-sum(p.refunds||[],'amount'),0);
export const balance=(invoice:any)=>Math.max(0,invoice.amount-paid(invoice));
// Corrections are applied to the last installments first; the stored plan remains intact.
export function adjustedInstallments(i:any){const rows=[...(i.installments||[])].sort((a,b)=>a.number-b.number).map(r=>({...r,originalAmount:r.originalAmount??r.amount}));if(!rows.length)return rows;let difference=i.amount-sum(rows,'amount');for(let n=rows.length-1;n>=0&&difference;n--){const change=difference>0?difference:Math.max(difference,-rows[n].amount);rows[n].amount+=change;difference-=change;}return rows;}
export const effectiveDue=(i:any)=>{let remaining=paid(i);const rows=adjustedInstallments(i);for(const r of rows){if(remaining<r.amount)return r.dueDate;remaining-=r.amount;}return rows.length?rows[rows.length-1].dueDate:i.dueDate;};
export const overdueBalance=(i:any,asOf=day())=>{if(i.issueStatus==='Draft'||i.issueStatus==='Cancelled')return 0;const rows=adjustedInstallments(i);if(!rows.length)return i.dueDate<asOf?balance(i):0;return Math.min(balance(i),Math.max(0,sum(rows.filter((r:any)=>r.dueDate<asOf),'amount')-paid(i)));};
export const invoiceStatus=(i:any)=>i.issueStatus==='Cancelled'?'Cancelled':i.issueStatus==='Draft'?'Draft':balance(i)===0?'Paid':paid(i)>0?'Partially Paid':effectiveDue(i)<day()?'Overdue':i.adjustments?.length?'Adjusted':'Issued';
export const owner=(student:any)=>student.isDraft?{draftStudentId:student.id,studentId:null}:{studentId:student.id,draftStudentId:null};
export const profileId=(record:any)=>record.studentId||record.draftStudentId;
export const digest=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const reference=(prefix:string)=>`${prefix}-${randomUUID().replaceAll('-','').slice(0,20).toUpperCase()}`;
export async function serial<T>(fn:(tx:any)=>Promise<T>):Promise<T>{for(let attempt=0;;attempt++){try{return await db.$transaction(fn,{isolationLevel:'Serializable',timeout:30000});}catch(e:any){if(e.code!=='P2034'||attempt===3)throw e;}}}
export async function log(tx:any,actorId:string,action:string,entityId:string){await tx.auditLog.create({data:{actorId,action,entity:'fee-office',entityId}});}
export async function notify(tx:any,student:any,event:string,title:string,message:string){if(!student?.userId)return;await tx.entry.upsert({where:{id:`fee-notice-${digest([event,student.userId])}`},create:{id:`fee-notice-${digest([event,student.userId])}`,module:'notifications',title,userId:student.userId,status:'Unread',data:{message,link:'fees'}},update:{}});}
export function currentVersions(rows:any[],asOf=day()) {const map=new Map<string,any>();for(const r of [...rows].filter(r=>r.effectiveDate<=asOf).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.version-b.version))map.set(r.key,r);return [...map.values()];}
export function assignmentAt(rows:any[],studentId:string,session:string,asOf:string){return rows.filter(r=>r.profileKey===studentId&&r.session===session&&r.effectiveDate<=asOf).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]?.data||{transportRequired:false,route:'',extraKeys:[],discountKeys:[],lateFeeExempt:false};}
export const configSchema=z.object({
 key:z.string().min(1).max(150),kind:z.enum(['category','structure','route','discount','late','settings','template']),session:z.string().min(1).max(80),effectiveDate:dateValue,active:z.boolean().default(true),
 data:z.object({name:z.string().trim().min(1).max(120),category:z.string().max(100).default('Tuition Fee'),className:z.string().max(80).default(''),amount:amountValue.default(0),frequency:z.enum(['Monthly','Quarterly','Half-yearly','Annual','One-time','Custom']).default('Monthly'),dueDay:z.number().int().min(1).max(28).default(10),startMonth:z.number().int().min(1).max(12).default(4),months:z.array(z.number().int().min(1).max(12)).default([]),optional:z.boolean().default(false),mode:z.enum(['Fixed','Percentage']).default('Fixed'),basisPoints:z.number().int().min(0).max(10000).default(0),validUntil:z.union([dateValue,z.literal('')]).default(''),heads:z.array(z.string()).default([]),eligibility:z.string().max(1000).default(''),graceDays:z.number().int().min(0).max(365).default(0),monthly:z.boolean().default(false),maximum:amountValue.default(0),exemptHeads:z.array(z.string()).default([]),advanceEnabled:z.boolean().default(false),autoReminders:z.boolean().default(false),reminderDays:z.number().int().min(0).max(30).default(3),body:z.string().max(2000).default(''),channel:z.enum(['In-App','Email','SMS','WhatsApp']).default('In-App')}).strict()
}).strict().superRefine((r,ctx)=>{if(r.kind==='settings'&&r.key!=='settings'||r.kind==='late'&&r.key!=='late-policy')ctx.addIssue({code:'custom',message:'Use the existing school policy key when creating a new version.'});if(r.kind==='structure'&&r.data.frequency==='Custom'&&!r.data.months.length)ctx.addIssue({code:'custom',message:'Select billing months for custom frequency.'});if(r.kind==='discount'&&r.data.mode==='Percentage'&&!r.data.basisPoints)ctx.addIssue({code:'custom',message:'Percentage is required.'});});
export async function saveVersion(tx:any,data:any,actorId:string){const previous=await tx.feeVersion.findFirst({where:{key:data.key,session:data.session},orderBy:{version:'desc'}});if(previous&&previous.kind!==data.kind)reject(400,'A configuration key cannot change category.');const row=await tx.feeVersion.create({data:{...data,actorId,version:(previous?.version||0)+1}});await log(tx,actorId,'configuration-version',row.id);return row;}
export async function initializeFees(session:string,actorId:string){return serial(async tx=>{
 const existing=await tx.feeVersion.findMany({where:{session}});const keys=new Set(existing.map((r:any)=>r.key));const year=/^(\d{4})/.exec(session)?.[1]||day().slice(0,4),effectiveDate=`${year}-04-01`;
 const put=async(key:string,kind:string,data:any,active=true)=>{if(keys.has(key))return;const parsed=configSchema.parse({key,kind,session,effectiveDate,active,data});await saveVersion(tx,parsed,actorId);keys.add(key);};
 for(const name of ['Tuition Fee','Transport Fee','Admission Fee','Registration Fee','Examination Fee','Annual Fee','Development Fee','Computer Fee','Laboratory Fee','Library Fee','Miscellaneous Fee','Other Custom Charges'])await put(`category:${name}`,'category',{name},['Tuition Fee','Transport Fee'].includes(name));
 const legacy=await tx.entry.findMany({where:{module:'feeStructures',archived:false}});
 for(const rate of suppliedTuition){const prior=legacy.find((r:any)=>r.title.toLowerCase()==='tuition fee'&&(r.data as any).session===session&&classKey((r.data as any).className)===classKey(rate.className));await put(`tuition:${classKey(rate.className)}`,'structure',{name:'Tuition Fee',category:'Tuition Fee',className:rate.className,amount:prior?(prior.data as any).amount:rate.amount});}
 const routes=await tx.configuration.findUnique({where:{id:`transport-fees:${session}`}});
 for(const rate of (routes?.data as any)?.routes||suppliedTransport)await put(`route:${rate.route}`,'route',{name:rate.route,category:'Transport Fee',amount:rate.amount});
 await put('settings','settings',{name:'Fee settings'});return {configured:keys.size};
});}
export function dueOn(period:string,dueDay:number){return `${period}-${String(dueDay).padStart(2,'0')}`;}
function billedThisMonth(rule:any,period:string){const month=Number(period.slice(5)),offset=(month-rule.startMonth+12)%12;return rule.frequency==='Monthly'||rule.frequency==='Quarterly'&&offset%3===0||rule.frequency==='Half-yearly'&&offset%6===0||rule.frequency==='Annual'&&offset===0||rule.frequency==='One-time'||rule.frequency==='Custom'&&rule.months.includes(month);}
export async function calculatePreview(tx:any,students:any[],filter:any){
 const [versions,assignments,old]=await Promise.all([tx.feeVersion.findMany({where:{session:filter.session}}),tx.billingAssignment.findMany({where:{session:filter.session}}),tx.invoice.findMany({where:{session:filter.session},select:{id:true,studentId:true,draftStudentId:true,items:true,billingPeriod:true,dueDate:true,title:true,generationKey:true}})]);
 const effective=`${filter.period}-01`,rules=currentVersions(versions,effective),active=rules.filter(r=>r.active),categories=new Set(active.filter(r=>r.kind==='category').map(r=>r.data.name));
 const selected=students.filter(s=>(!s.session||s.session===filter.session)&&(!filter.className||classKey(s.className)===classKey(filter.className))&&(!filter.section||s.section===filter.section)&&(!filter.studentId||s.id===filter.studentId));
 const results=selected.map(student=>{
  const assignment=assignmentAt(assignments,student.id,filter.session,effective),items:any[]=[],errors:string[]=[];
  const prior=old.filter((i:any)=>profileId(i)===student.id);
  const already=(key:string,oneTime=false)=>prior.some((i:any)=>(oneTime||i.billingPeriod===filter.period||!i.billingPeriod&&i.dueDate.startsWith(filter.period))&&(Array.isArray(i.items)?i.items.some((item:any)=>item.key===key):key.startsWith('tuition:')&&i.title.toLowerCase().startsWith('tuition fee')||key.startsWith('route:')&&i.title.toLowerCase().startsWith('transport fee')));
  const add=(r:any)=>{if(!categories.has(r.data.category)||already(r.key,r.data.frequency==='One-time'))return;items.push({key:r.key,versionId:r.id,category:r.data.category,description:r.kind==='route'?`Transport Fee - ${r.data.name}`:r.data.name,amount:r.data.amount,route:r.kind==='route'?r.data.name:''});};
  const tuition=active.filter(r=>r.kind==='structure'&&r.data.category==='Tuition Fee'&&classKey(r.data.className)===classKey(student.className));
  if(!tuition.length)errors.push('No active tuition rate for this class and billing date.');
  for(const r of active.filter(r=>r.kind==='structure'))if((!r.data.className||classKey(r.data.className)===classKey(student.className))&&(!r.data.optional||assignment.extraKeys.includes(r.key))&&billedThisMonth(r.data,filter.period))add(r);
  if(assignment.transportRequired){const route=active.find(r=>r.kind==='route'&&r.data.name===assignment.route);if(!route)errors.push('Assigned transport route has no active rate.');else add(route);}
  const discounts:any[]=[];
  for(const key of assignment.discountKeys||[]){const r=active.find(r=>r.kind==='discount'&&r.key===key);if(!r||r.data.validUntil&&r.data.validUntil<effective)continue;const base=items.filter(i=>!r.data.heads.length||r.data.heads.includes(i.category)).reduce((n,i)=>n+i.amount,0);const amount=Math.min(Math.max(0,sum(items,'amount')-sum(discounts,'amount')),r.data.mode==='Percentage'?percent(base,r.data.basisPoints):Math.min(base,r.data.amount));if(amount)discounts.push({key:r.key,amount,reason:r.data.name,versionId:r.id});}
  const dueDay=tuition[0]?.data.dueDay||10;
  return {studentId:student.id,name:student.name,className:student.className,section:student.section||'',isDraft:!!student.isDraft,route:assignment.transportRequired?assignment.route:'',items,discounts,total:sum(items,'amount')-sum(discounts,'amount'),dueDate:dueOn(filter.period,dueDay),errors,skipped:!items.length&&!errors.length};
 });
 return {rows:results,eligible:results.filter(r=>!r.errors.length&&!r.skipped).length,total:results.filter(r=>!r.errors.length).reduce((n,r)=>n+r.total,0),token:digest(results)};
}
export async function appendAdjustment(tx:any,invoice:any,kind:string,amount:number,reason:string,actorId:string,sourceKey?:string){
 if(!Number.isSafeInteger(amount)||!amount||invoice.amount+amount>2147483647)reject(400,'Adjustment must be non-zero paise.');
 if(invoice.issueStatus==='Cancelled'||invoice.issueStatus==='Draft')reject(409,'Only issued invoices may be adjusted.');
 if(invoice.amount+amount<paid(invoice))reject(409,'Adjustment cannot reduce demand below settled payments. Refund or reconcile the payment first.');
 if(sourceKey&&await tx.feeAdjustment.findUnique({where:{sourceKey}}))return invoice;
 await tx.feeAdjustment.create({data:{invoiceId:invoice.id,kind,amount,reason,actorId,sourceKey}});
 await log(tx,actorId,kind,invoice.id);
 return tx.invoice.update({where:{id:invoice.id},data:{originalAmount:invoice.originalAmount??invoice.amount,amount:invoice.amount+amount}});
}
export async function allocateCollection(tx:any,collection:any,invoiceIds:string[],actorId:string){
 const prior=await tx.payment.findMany({where:{collectionId:collection.id}});let available=collection.amount-sum(prior,'amount');
 const invoices=await tx.invoice.findMany({where:{id:{in:invoiceIds}},include:{payments:{include:{refunds:true}}},orderBy:[{dueDate:'asc'},{id:'asc'}]});
 if(invoices.length!==new Set(invoiceIds).size)reject(400,'One or more invoices do not exist.');
 for(const invoice of invoices){if(profileId(invoice)!==profileId(collection)||invoice.session!==collection.session)reject(403,'Payment allocation must belong to the same student and academic session.');if(['Draft','Cancelled'].includes(invoice.issueStatus))reject(409,'Cannot collect against a draft or cancelled invoice.');const amount=Math.min(available,balance(invoice));if(!amount)continue;await tx.payment.create({data:{invoiceId:invoice.id,collectionId:collection.id,amount,method:collection.method,reference:`${collection.id}:${invoice.id}:${prior.length}`,recordedBy:actorId,receipt:reference('ALLOC')}});available-=amount;}
 return available;
}
