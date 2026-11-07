import {db} from './db';
import {admins} from '../shared/modules';
import {portalForRole} from '../shared/portals';
import {effectiveAccess} from './access';
import {createHash,randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
const entryTypes=['leave','appraisals','studentAssessments','employeeAssessments','schoolReports','workReports','paymentVerifications'];
const types=['exam','payroll',...entryTypes] as const;
const moduleOf=(type:string)=>type==='exam'?'exams':type;
const fingerprint=(record:any)=>createHash('sha256').update(JSON.stringify(record)).digest('hex');
const clean=(row:any)=>row?JSON.parse(JSON.stringify(row)):null;
async function source(tx:any,type:string,id:string){
  if(type==='exam')return tx.exam.findUnique({where:{id},include:{marks:{orderBy:{id:'asc'},include:{student:{select:{name:true,admissionNo:true}}}}}});
  if(type==='payroll')return tx.payroll.findUnique({where:{id},include:{employee:{select:{name:true,userId:true}}}});
  const row=await tx.entry.findFirst({where:{id,module:type,archived:false}});
  if(!row)return null;
  const student=row.studentId?await tx.student.findUnique({where:{id:row.studentId},select:{name:true,admissionNo:true}}):null;
  const employee=(row.data as any).employeeId?await tx.employee.findUnique({where:{id:(row.data as any).employeeId},select:{name:true,employeeNo:true}}):null;
  return {...row,...(student?{student}:{}),...(employee?{employee}:{})};
}
export async function notify(tx:any,userId:string,title:string,message:string,link:string,recordId?:string){return tx.entry.create({data:{module:'notifications',userId,title,status:'Unread',data:{message,link,...(recordId?{recordId}:{})}}});}
export async function approvalList(req:any){
  const reviewer=req.account.permissions.approvals==='manage';
  const records=await db.entry.findMany({where:{module:'approvals',archived:false,...(!reviewer?{userId:req.account.id}:{})},orderBy:{createdAt:'desc'},include:{user:{select:{name:true}}}});
  return records.filter(r=>r.userId===req.account.id||(req.account.permissions[moduleOf((r.data as any).type)]!=='none'&&(req.account.role!=='Accountant'||(r.data as any).type==='paymentVerifications'))).map(r=>({...r,submittedBy:r.user?.name,canReview:reviewer&&r.userId!==req.account.id&&r.status==='Pending'}));
}
export function registerWorkflowRoutes(router:any,{wrap,fail,permit,audit,allowedStudents,scopedEntries}:any){
  async function canSubmit(req:any,type:string,row:any){
    if(!row)fail(404,'Record not found.');
    if(req.account.permissions[moduleOf(type)]!=='manage')fail(403,'You cannot submit this type of record.');
    if(type==='exam'){
      if(row.published)fail(409,'This examination is already published.');
      if(!admins.includes(req.account.role)&&!(await allowedStudents(req)).some((s:any)=>s.className===row.className&&s.session===row.session))fail(403,'This class is not assigned to you.');
      if(!row.marks.length)fail(400,'Enter marks before submitting an examination.');
    }else if(type==='payroll'){
      if(row.status==='Approved')fail(409,'Payroll is already approved.');
    }else{
      if(['Approved','Rejected'].includes(row.status))fail(409,'This record has already been finalised.');
      if(type!=='paymentVerifications'&&!(await scopedEntries(req,type)).some((r:any)=>r.id===row.id))fail(403,'Record is outside your authorised scope.');
      if(['leave','workReports','paymentVerifications'].includes(type)&&row.userId!==req.account.id)fail(403,'Submit your own request.');
    }
  }
  router.get('/workflow',wrap(async(req:any,res:any)=>res.json(await approvalList(req))));
  router.post('/workflow/submit',wrap(async(req:any,res:any)=>{
    const d=z.object({type:z.enum(types),entityId:z.string().min(1)}).parse(req.body);const row=await source(db,d.type,d.entityId);await canSubmit(req,d.type,row);
    const result=await db.$transaction(async tx=>{
      const all=await tx.entry.findMany({where:{module:'approvals',status:'Pending',archived:false}});
      if(all.some(r=>(r.data as any).entityId===d.entityId&&(r.data as any).type===d.type))fail(409,'This record is already awaiting approval.');
      const latest=await source(tx,d.type,d.entityId);if(fingerprint(clean(latest))!==fingerprint(clean(row)))fail(409,'The record changed. Refresh before submitting.');
      const title=row.title||row.name||`Payroll · ${row.employee.name} · ${row.month}`;
      const request=await tx.entry.create({data:{module:'approvals',title,userId:req.account.id,status:'Pending',data:{...d,snapshot:clean(row),fingerprint:fingerprint(clean(row)),submittedAt:new Date().toISOString()}}});
      const reviewers=await tx.user.findMany({where:{active:true,role:{in:d.type==='paymentVerifications'?[...admins,'Accountant']:admins},id:{not:req.account.id}}});
      for(const reviewer of reviewers){const {permissions}=await effectiveAccess(reviewer);if(permissions.approvals==='manage'&&permissions.notifications!=='none'&&permissions[moduleOf(d.type)]!=='none')await notify(tx,reviewer.id,'Approval requested',`${req.account.name} submitted ${title}.`,'approvals',request.id);}
      await tx.auditLog.create({data:{actorId:req.account.id,action:'submit-approval',entity:d.type,entityId:d.entityId}});return request;
    },{isolationLevel:'Serializable'});res.status(201).json(result);
  }));
  router.post('/workflow/:id/cancel',wrap(async(req:any,res:any)=>{
    const r=await db.entry.findFirst({where:{id:req.params.id,module:'approvals',userId:req.account.id,status:'Pending'}});if(!r)fail(404,'Pending request not found.');
    const updated=await db.entry.updateMany({where:{id:r!.id,status:'Pending'},data:{status:'Cancelled'}});if(!updated.count)fail(409,'This request has already been decided.');await audit(req,'cancel-approval','approval',r!.id);res.json({ok:true});
  }));
  router.post('/workflow/:id/decide',wrap(async(req:any,res:any)=>{
    permit(req,[...admins,'Accountant']);const d=z.object({decision:z.enum(['Approved','Rejected']),comment:z.string().trim().min(3).max(2000)}).parse(req.body);
    const result=await db.$transaction(async tx=>{
      const r=await tx.entry.findFirst({where:{id:req.params.id,module:'approvals',archived:false}});if(!r)fail(404,'Approval request not found.');if(r!.status!=='Pending')fail(409,'This request is already finalised.');if(r!.userId===req.account.id)fail(403,'Another authorised reviewer must decide your request.');
      const data=r!.data as any,type=data.type;if(req.account.permissions[moduleOf(type)]==='none')fail(403,'You do not have access to the source module.');if(req.account.role==='Accountant'&&type!=='paymentVerifications')fail(403,'Accounts can only verify payment requests.');
      const row=await source(tx,type,data.entityId);if(!row||fingerprint(clean(row))!==data.fingerprint)fail(409,'The source record changed. Ask the submitter to cancel and resubmit it.');
      const lock=await tx.entry.updateMany({where:{id:r!.id,status:'Pending'},data:{status:d.decision,data:{...data,comment:d.comment,reviewerId:req.account.id,reviewerName:req.account.name,decidedAt:new Date().toISOString()}}});if(!lock.count)fail(409,'This request was already decided.');
      if(d.decision==='Approved'){
        if(type==='exam')await tx.exam.update({where:{id:row.id},data:{published:true}});
        else if(type==='payroll')await tx.payroll.update({where:{id:row.id},data:{status:'Approved'}});
        else if(type==='paymentVerifications'){
          const payment=row.data as any,invoice=await tx.invoice.findUnique({where:{id:payment.invoiceId},include:{payments:{include:{refunds:true}}}});if(!invoice)fail(404,'Invoice not found.');
          const paid=invoice!.payments.reduce((n,p)=>n+p.amount-p.refunds.reduce((s,r)=>s+r.amount,0),0);if(payment.amount>invoice!.amount-paid)fail(409,'The payment exceeds the remaining invoice balance.');
          const receipt=await tx.payment.create({data:{invoiceId:invoice!.id,amount:payment.amount,method:payment.method,reference:payment.reference||null,recordedBy:req.account.id,receipt:`RCPT-${randomBytes(7).toString('hex').toUpperCase()}`}});
          await tx.entry.update({where:{id:row.id},data:{status:'Approved',data:{...payment,paymentId:receipt.id,receipt:receipt.receipt}}});
          const student=await tx.student.findUnique({where:{id:invoice!.studentId}});if(student)await notify(tx,student.userId,'Fee payment verified',`${receipt.receipt} is available in your fee ledger.`,'fees',invoice!.id);
        }else await tx.entry.update({where:{id:row.id},data:{status:'Approved'}});
      }else if(entryTypes.includes(type))await tx.entry.update({where:{id:row.id},data:{status:'Rejected'}});
      if(r!.userId)await notify(tx,r!.userId,`${d.decision}: ${r!.title}`,d.comment,'approvals',r!.id);
      if(type==='payroll'&&d.decision==='Approved')await notify(tx,row.employee.userId,'Your payslip is ready',`Payroll for ${row.month} has been approved.`,'payroll',row.id);
      if(type==='exam'&&d.decision==='Approved'){const students=await tx.student.findMany({where:{id:{in:row.marks.map((m:any)=>m.studentId)}}});for(const student of students)await notify(tx,student.userId,'New examination result',`${row.name} · ${row.subject} results are published.`,'exams',row.id);}
      await tx.auditLog.create({data:{actorId:req.account.id,action:d.decision.toLowerCase(),entity:'approval',entityId:r!.id}});return {ok:true};
    },{isolationLevel:'Serializable'});res.json(result);
  }));
  router.get('/payment-verifications',wrap(async(req:any,res:any)=>{permit(req,[...admins,'Accountant']);res.json(await db.entry.findMany({where:{module:'paymentVerifications',archived:false},orderBy:{createdAt:'desc'}}));}));
  router.post('/fees/:id/payment-requests',wrap(async(req:any,res:any)=>{
    permit(req,[...admins,'Accountant']);const d=z.object({amount:z.coerce.number().positive().max(10000000).transform(n=>Math.round(n*100)),method:z.enum(['Cash','UPI','Bank transfer','Cheque']),reference:z.string().trim().max(100).default('')}).parse(req.body);
    const invoice=await db.invoice.findUnique({where:{id:req.params.id},include:{payments:{include:{refunds:true}},student:{select:{name:true}}}});if(!invoice)fail(404,'Invoice not found.');
    const paid=invoice!.payments.reduce((n,p)=>n+p.amount-p.refunds.reduce((s,r)=>s+r.amount,0),0);if(d.amount>invoice!.amount-paid)fail(400,'Payment exceeds the outstanding balance.');if(d.method!=='Cash'&&!d.reference)fail(400,'A transaction reference is required.');
    const record=await db.entry.create({data:{module:'paymentVerifications',title:`${invoice!.number} · ${invoice!.student.name}`,userId:req.account.id,studentId:invoice!.studentId,status:'Draft',data:{...d,invoiceId:invoice!.id}}});await audit(req,'collect-pending','paymentVerification',record.id);res.status(201).json(record);
  }));
  router.post('/recruitment/:id/onboard',wrap(async(req:any,res:any)=>{
    permit(req,[...admins,'HR Manager']);const d=z.object({joiningDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),qualification:z.string().min(1),salary:z.coerce.number().nonnegative().max(10000000)}).parse(req.body);
    const token=randomBytes(32).toString('hex');const result=await db.$transaction(async tx=>{const r=await tx.entry.findFirst({where:{id:req.params.id,module:'recruitment',archived:false}});if(!r)fail(404,'Candidate not found.');const c=r!.data as any;if(c.employeeId||!['Offer','Hired'].includes(c.stage))fail(409,'Move the candidate to Offer before onboarding, and onboard only once.');
      const user=await tx.user.create({data:{name:r!.title,email:c.email.toLowerCase(),role:['Teacher','Class Teacher'].includes(c.position)?c.position:'Employee',passwordHash:await bcrypt.hash(randomBytes(32).toString('hex'),12)}});
      const employee=await tx.employee.create({data:{userId:user.id,name:user.name,email:user.email,employeeNo:`EMP-${randomBytes(5).toString('hex').toUpperCase()}`,phone:c.phone,department:c.department,designation:c.position,joiningDate:d.joiningDate,qualification:d.qualification,salary:Math.round(d.salary*100),details:{}}});
      await tx.passwordReset.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)}});await tx.entry.update({where:{id:r!.id},data:{data:{...c,stage:'Hired',employeeId:employee.id,onboardedAt:new Date().toISOString()}}});return employee;
    },{isolationLevel:'Serializable'});await audit(req,'onboard','employee',result.id);res.status(201).json({record:result,activationTokens:[{email:result.email,token}]});
  }));
  router.get('/analytics',wrap(async(req:any,res:any)=>{
    const students=await allowedStudents(req),ids=students.map((s:any)=>s.id);const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
    const attendance=req.account.permissions.attendance!=='none'?await db.attendance.findMany({where:{studentId:{in:ids},date}}):[];const financial=req.account.permissions.fees!=='none'&&[...admins,'Accountant'].includes(req.account.role);const staff=req.account.permissions.employees!=='none'&&[...admins,'HR Manager'].includes(req.account.role);
    const invoices=financial?await db.invoice.findMany({where:{studentId:{in:ids}},include:{payments:{include:{refunds:true}}}}):[];
    const billed=invoices.reduce((n,i)=>n+i.amount,0),collected=invoices.reduce((n,i)=>n+i.payments.reduce((a,p)=>a+p.amount-p.refunds.reduce((s,r)=>s+r.amount,0),0),0);
    const employees=staff?await db.employee.findMany({where:{archived:false}}):[];const staffAttendance=staff?await db.attendance.findMany({where:{employeeId:{in:employees.map(e=>e.id)},date}}):[];
    const classes=[...new Set(students.map((s:any)=>`${s.className} / ${s.section}`))].map(name=>{const members=students.filter((s:any)=>`${s.className} / ${s.section}`===name),memberIds=members.map((s:any)=>s.id),marks=attendance.filter(a=>memberIds.includes(a.studentId));return {name,students:members.length,marked:marks.length,present:marks.filter(a=>['Present','Late'].includes(a.status)).length};});
    const departments=[...new Set(employees.map(e=>e.department))].map(name=>{const members=employees.filter(e=>e.department===name),memberIds=members.map(e=>e.id);return{name,employees:members.length,present:staffAttendance.filter(a=>memberIds.includes(a.employeeId||'')&&['Present','Late'].includes(a.status)).length}});
    const exams=req.account.permissions.exams!=='none'?await db.exam.findMany({where:{OR:students.map((s:any)=>({className:s.className,session:s.session}))},include:{marks:{where:{studentId:{in:ids}}}}}):[];
    res.json({date,studentCount:students.length,employeeCount:staff?employees.length:null,billed:financial?billed:null,collected:financial?collected:null,pending:financial?billed-collected:null,classes,departments,exams:exams.map(e=>({id:e.id,name:e.name,subject:e.subject,published:e.published,entries:e.marks.length,average:e.marks.length?Math.round(e.marks.reduce((n,m)=>n+m.score,0)/e.marks.length/e.maxMarks*100):null}))});
  }));
  router.get('/workspace-summary',wrap(async(req:any,res:any)=>{
    const students=await allowedStudents(req),employee=await db.employee.findUnique({where:{userId:req.account.id}});const requests=req.account.permissions.approvals==='none'?[]:await approvalList(req);
    const count=async(module:string)=>req.account.permissions[module]!=='none'?(await scopedEntries(req,module)).length:null;
    const counts:Record<string,any>={students:students.length};for(const m of ['progress','studentAssessments','employeeAssessments','appraisals','recruitment','workReports','schoolReports'])counts[m]=await count(m);
    counts.pendingApprovals=requests.filter(r=>r.status==='Pending').length;counts.employees=req.account.permissions.employees!=='none'&&[...admins,'HR Manager'].includes(req.account.role)?await db.employee.count({where:{archived:false}}):null;
    counts.paymentVerifications=req.account.permissions.paymentVerifications!=='none'?await db.entry.count({where:{module:'paymentVerifications',status:{in:['Draft','Pending']}}}):null;
    const unread=await db.entry.count({where:{module:'notifications',userId:req.account.id,status:'Unread'}});
    res.json({kind:portalForRole(req.account.role),counts,employee:req.account.permissions.employees==='none'?null:employee,requests:requests.slice(0,5),unread});
  }));
}
