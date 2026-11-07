import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import {effectiveAccess} from './access';
import {moduleCatalog} from '../shared/portals';
const staffRoles=['Super Admin','School Admin','Principal','HR Manager'];
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const key=(event:string,userId:string)=>'notification-'+createHash('sha256').update(event+':'+userId).digest('hex');
async function deliver(ids:string[],event:string,title:string,message:string,link:string,recordId?:string){
  const users=await db.user.findMany({where:{id:{in:[...new Set(ids)]},active:true,role:{not:'Parent'}}});
  const eligible=[];
  for(const user of users){const access=await effectiveAccess(user);if(access.permissions.notifications!=='none'&&access.permissions[link]!=='none')eligible.push(user);}
  if(eligible.length)await db.entry.createMany({skipDuplicates:true,data:eligible.map(user=>({id:key(event,user.id),module:'notifications',userId:user.id,title,status:'Unread',data:{message,link,...(recordId?{recordId}:{})}}))});
}
async function staff(roles=staffRoles){return (await db.user.findMany({where:{active:true,role:{in:roles}},select:{id:true}})).map(u=>u.id);}
async function classMembers(className:string,section:string,session?:string){return db.student.findMany({where:{archived:false,className,section,...(session?{session}:{})},select:{userId:true}});}
export async function emitSchoolNotification(req:any,action:string,entity:string,id:string,eventId:string){
  if(['student','employee'].includes(entity)){
    const record=entity==='student'?await db.student.findUnique({where:{id}}):await db.employee.findUnique({where:{id}});if(!record)return;
    const module=entity==='student'?'students':'employees';
    const recipients=await staff();if(!record.archived)recipients.push(record.userId);
    if(entity==='student'&&action==='create')recipients.push(req.account.id);
    await deliver(recipients,eventId,`${entity==='student'?'Student':'Employee'} ${action==='create'||action==='onboard'?'added':action==='archive'?'archived':'updated'}`,`${record.name} · ${action==='archive'?'Removed from active records.':'School record is available.'}`,module,record.archived?undefined:id);return;
  }
  if(entity==='user'&&['set-password','access-change','issue-invitation'].includes(action)){
    await deliver([id],eventId,'Your account was updated','Your school administrator updated your account access or sign-in details.','settings');return;
  }
  if(entity==='invoice'){
    const invoice=await db.invoice.findUnique({where:{id},include:{student:true}});if(invoice)await deliver([invoice.student.userId],eventId,action==='create'?'New fee invoice':'Fee invoice updated',`${invoice.title} · Check your fee ledger for the details.`,'fees',id);return;
  }
  if(entity==='attendance'&&action==='mark'){
    for(const row of req.body.records||[]){const person=row.studentId?await db.student.findUnique({where:{id:row.studentId}}):await db.employee.findUnique({where:{id:row.employeeId}});if(person)await deliver([person.userId],eventId+':'+person.id,'Attendance updated',`${req.body.date} · ${req.body.period||'Daily'} · ${row.status}`,'attendance');}return;
  }
  const supported=['homework','submissions','submission','academics','timetable','events','leave','workReports','progress','loans','notices'];
  if(!supported.includes(entity)||action==='archive')return;
  const row=await db.entry.findUnique({where:{id}});if(!row||row.archived)return;const data=row.data as any;
  if(entity==='notices')return; // Due notices are delivered idempotently when each inbox is refreshed.
  if(entity==='events'){await deliver((await db.user.findMany({where:{active:true,role:{not:'Parent'}},select:{id:true}})).map(u=>u.id),eventId,'School calendar updated',row.title,'events',id);return;}
  if(['homework','academics','timetable'].includes(entity)){
    const recipients=(await classMembers(data.className||row.title,data.section,data.session)).map(s=>s.userId);
    if(data.teacherId){const teacher=await db.employee.findUnique({where:{id:data.teacherId}});if(teacher)recipients.push(teacher.userId);}
    if(row.userId)recipients.push(row.userId);
    await deliver(recipients,eventId,entity==='homework'?'Homework assigned':entity==='academics'?'Class assignment updated':'Timetable updated',`${row.title}${data.dueDate?' · Due '+data.dueDate:''}`,entity,id);return;
  }
  if(['submission','submissions'].includes(entity)){
    const student=row.studentId?await db.student.findUnique({where:{id:row.studentId}}):null;
    const homework=await db.entry.findUnique({where:{id:row.title}});if(!homework||!student)return;
    if(action==='feedback')await deliver([student.userId],eventId,'Feedback on your work',homework.title,'submissions',id);
    else {const teachers=await db.entry.findMany({where:{module:'academics',archived:false,title:student.className}});const employeeIds=teachers.filter(t=>(t.data as any).section===student.section&&(t.data as any).session===student.session).map(t=>(t.data as any).teacherId);const employees=await db.employee.findMany({where:{id:{in:employeeIds},archived:false}});await deliver([...employees.map(e=>e.userId),...(homework.userId?[homework.userId]:[])],eventId,'New homework submission',`${student.name} · ${homework.title}`,'submissions',id);}return;
  }
  if(entity==='leave'||entity==='workReports'){if(row.userId)await deliver([row.userId],eventId,entity==='leave'?'Leave request saved':'Work report saved',row.title,entity,id);return;}
  if(row.studentId){const student=await db.student.findUnique({where:{id:row.studentId}});if(student)await deliver([student.userId],eventId,entity==='loans'?'Library record updated':'Student progress updated',entity==='loans'?'View your book circulation record.':row.title,entity,id);}
}
async function syncNotices(account:any){
  if(account.permissions.notices==='none')return;
  const audience=account.role==='Student'?'Students':'Employees';
  const notices=await db.entry.findMany({where:{module:'notices',archived:false,AND:[{data:{path:['audience'],equals:'Everyone'}},{data:{path:['publishDate'],lte:day()}}]},orderBy:{createdAt:'desc'},take:100});
  const targeted=await db.entry.findMany({where:{module:'notices',archived:false,AND:[{data:{path:['audience'],equals:audience}},{data:{path:['publishDate'],lte:day()}}]},orderBy:{createdAt:'desc'},take:100});
  const rows=[...notices,...targeted];
  if(rows.length)await db.entry.createMany({skipDuplicates:true,data:rows.map(row=>({id:key('notice:'+row.id+':'+row.updatedAt.toISOString(),account.id),module:'notifications',userId:account.id,title:row.title,status:'Unread',data:{message:String((row.data as any).body||'').slice(0,500),link:'notices',recordId:row.id}}))});
}
const feedQuery=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(['All','Unread','Read']).default('All'),q:z.string().max(100).default(''),type:z.string().max(60).default('')});
export function registerNotificationRoutes(router:any,{wrap,fail}:any){
  const base=(req:any)=>({module:'notifications',userId:req.account.id,archived:false});
  const decorate=(req:any,r:any)=>({...r,canOpen:!!moduleCatalog[r.data.link]&&req.account.permissions[r.data.link]!=='none',category:moduleCatalog[r.data.link]||'School update'});
  router.get('/notifications',wrap(async(req:any,res:any)=>{await syncNotices(req.account);res.json(await db.entry.findMany({where:base(req),orderBy:[{createdAt:'desc'},{id:'desc'}],take:100}));}));
  router.get('/notifications/summary',wrap(async(req:any,res:any)=>{await syncNotices(req.account);const [unread,total,recent]=await Promise.all([db.entry.count({where:{...base(req),status:'Unread'}}),db.entry.count({where:base(req)}),db.entry.findMany({where:base(req),orderBy:[{createdAt:'desc'},{id:'desc'}],take:5})]);res.set('Cache-Control','no-store').json({unread,total,recent:recent.map(r=>decorate(req,r)),asOf:new Date().toISOString()});}));
  router.get('/notifications/feed',wrap(async(req:any,res:any)=>{await syncNotices(req.account);const q=feedQuery.parse(req.query);const where:any={...base(req),...(q.status==='All'?{}:{status:q.status})};if(q.type)where.data={path:['link'],equals:q.type};if(q.q)where.OR=[{title:{contains:q.q,mode:'insensitive'}},{data:{path:['message'],string_contains:q.q,mode:'insensitive'}}];const [rows,total,unread,all]=await Promise.all([db.entry.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(q.page-1)*20,take:20}),db.entry.count({where}),db.entry.count({where:{...base(req),status:'Unread'}}),db.entry.count({where:base(req)})]);res.set('Cache-Control','no-store').json({rows:rows.map(r=>decorate(req,r)),total,unread,all,page:q.page,asOf:new Date().toISOString()});}));
  router.post('/notifications/read-all',wrap(async(req:any,res:any)=>{const {before}=z.object({before:z.string().datetime()}).parse(req.body);const until=new Date(Math.min(Date.parse(before),Date.now()));const r=await db.entry.updateMany({where:{...base(req),status:'Unread',createdAt:{lte:until}},data:{status:'Read'}});res.json({ok:true,updated:r.count});}));
  router.post('/notifications/:id/read',wrap(async(req:any,res:any)=>{const r=await db.entry.updateMany({where:{...base(req),id:req.params.id},data:{status:'Read'}});if(!r.count)fail(404,'Notification not found.');res.json({ok:true});}));
  router.patch('/notifications/:id/state',wrap(async(req:any,res:any)=>{const {status}=z.object({status:z.enum(['Read','Unread'])}).parse(req.body);const r=await db.entry.updateMany({where:{...base(req),id:req.params.id},data:{status}});if(!r.count)fail(404,'Notification not found.');res.json({ok:true});}));
}
