import type {Request,Response,NextFunction} from 'express';
import {z} from 'zod';
import {db} from './db';
import {moduleCatalog} from '../shared/portals';
import {moduleForPath} from './access';

const pending=new Set<Promise<unknown>>();
export async function flushActivity(){while(pending.size)await Promise.allSettled([...pending]);}
const aliases:Record<string,string>={student:'students',employee:'employees',exam:'exams',invoice:'fees',payment:'fees',refund:'fees',user:'users',page:'cms',approval:'approvals',feeStructure:'feeStructures',submission:'submissions',communication:'notices',paymentVerification:'paymentVerifications',configuration:'settings'};
export function activityLabel(key:string){return moduleCatalog[aliases[key]||key]||key.replace(/[-_]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');}
const actions:Record<string,string>={create:'Created record',update:'Updated record',archive:'Archived record',mark:'Marked attendance',marks:'Entered marks',generate:'Generated payroll',publish:'Published content','access-change':'Changed account access','issue-invitation':'Created activation / reset link',assign:'Assigned fees',promote:'Promoted students',feedback:'Reviewed student work','stock-movement':'Updated stock',send:'Sent communication',concession:'Applied concession','record-offline-refund':'Recorded refund','collect-pending':'Recorded collection for review','assign-role':'Assigned role permissions','create-role':'Created role profile','update-role':'Updated role permissions',onboard:'Onboarded employee','update-school-settings':'Updated school settings','cancel-approval':'Cancelled approval request','status-change':'Changed record status','set-password':'Set account password'};
const ignored=new Set(['/auth/me','/health','/setup','/public','/directory','/integrations','/dashboard','/workspace-summary','/portal-summary','/school-settings','/notifications']);
const safeFields=new Set(['title','name','role','active','className','section','session','date','period','score','subject','status','decision','method','amount','month','allowances','deductions','stage','department','designation','direction','quantity','start','end','type','academicSession','published']);
function details(body:any){
  if(!body||typeof body!=='object')return {fields:[],values:{}};
  const fields=Object.keys(body).filter(k=>!/(password|token|secret|csrf|signature|credential)/i.test(k)).slice(0,40);
  const values:Record<string,string|number|boolean>={};
  for(const key of fields)if(safeFields.has(key)&&['string','number','boolean'].includes(typeof body[key]))values[key]=typeof body[key]==='string'?body[key].slice(0,160):body[key];
  if(Array.isArray(body.records))values.records=body.records.length;
  if(Array.isArray(body.studentIds))values.students=body.studentIds.length;
  return {fields,values};
}
async function targetName(entity:string,id:string){
  if(!id)return '';
  if(entity==='payroll'){const row=await db.payroll.findUnique({where:{id},include:{employee:{select:{name:true}}}});return row?`${row.employee.name} · ${row.month}`:'';}
  const model:any=({student:db.student,students:db.student,employee:db.employee,employees:db.employee,user:db.user,users:db.user,exam:db.exam,exams:db.exam,invoice:db.invoice,fees:db.invoice,documents:db.document} as any)[entity];
  if(model){const row=await model.findUnique({where:{id}});return row?.name||row?.title||row?.number||'';}
  const row=await db.entry.findUnique({where:{id}});return row?.title||'';
}
export function activityMiddleware(req:Request,res:Response,next:NextFunction){
  const started=Date.now(),route=req.path.replace(/^\/api/,'');
  res.once('finish',()=>{
    if((res.statusCode<400&&(route.startsWith('/activity')||route==='/audit'))||(req.method==='GET'&&(ignored.has(route)||route.startsWith('/notifications/'))))return;
    const login=route==='/auth/login';
    if(!req.account&&!login)return;
    const durationMs=Date.now()-started;
    const job=(async()=>{
      const account=req.account,parts=route.split('/').filter(Boolean),explicit=(req as any).activityAction;
      const module=aliases[explicit?.entity]||explicit?.entity||moduleForPath(route)||parts[0]||'account';
      const outcome=res.statusCode<400?'Success':res.statusCode===401||res.statusCode===403?'Blocked':'Failed';
      let category=['GET','HEAD'].includes(req.method)?'Views':'Changes';
      let action=explicit?(actions[explicit.action]||activityLabel(explicit.action)):req.method==='GET'?'Viewed records':req.method==='DELETE'?'Archived record':req.method==='PUT'||req.method==='PATCH'?'Updated record':'Submitted action';
      if(parts[0]==='auth'){category='Account';action=login?(outcome==='Success'?'Signed in':'Sign-in attempt'):parts[1]==='logout'?'Signed out':parts[1]==='password'?'Changed password':'Account action';}
      if(parts[0]==='portal-events'){category=req.body?.action==='export'?'Downloads':'Navigation';action=req.body?.action==='export'?'Exported visible activity rows':'Opened workspace section';}
      if(parts[0]==='attendance'&&parts[1]==='check')action=req.body?.action==='in'?'Checked in':'Checked out';
      if(parts[0]==='documents'&&req.method==='POST')action='Uploaded document';
      if(parts[0]==='workflow'){category='Approvals';action=parts[1]==='submit'?'Submitted for approval':parts[2]==='cancel'?'Cancelled approval request':req.method==='GET'?'Viewed approval queue':req.body?.decision==='Approved'?'Approved request':'Rejected request';}
      if(req.method==='GET'&&(['exports','reports'].includes(parts[0])||parts[0]==='documents'&&parts[1])){category='Downloads';action='Downloaded report / document';}
      if(outcome!=='Success')category='Access & errors';
      const recordId=explicit?.entityId||(parts[0]==='workflow'&&parts[1]==='submit'?req.body?.entityId:parts[0]==='records'?parts[2]:parts[1])||'';
      const label=req.file?.originalname?.slice(0,160)||await targetName(explicit?.entity||(parts[0]==='workflow'&&parts[1]==='submit'?req.body?.type:module),recordId).catch(()=>'');
      const entity=parts[0]==='portal-events'&&typeof req.body?.module==='string'?req.body.module:parts[0]==='auth'?'Account access':module;
      await db.entry.create({data:{module:'activity',title:action,status:outcome,userId:account?.id||null,data:{actorId:account?.id||null,actorName:account?.name||'Unknown account',actorRole:account?.role||'Unknown',category,entity,entityLabel:activityLabel(entity||'account'),recordId,recordLabel:label,method:req.method,route,statusCode:res.statusCode,durationMs,...details(req.body)}}});
    })();
    pending.add(job);void job.catch(()=>console.error('Activity logging failed; check database availability.')).finally(()=>pending.delete(job));
  });
  next();
}
const querySchema=z.object({q:z.string().max(100).default(''),actor:z.string().max(100).default(''),role:z.string().max(50).default(''),category:z.string().max(50).default(''),outcome:z.string().max(30).default(''),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),source:z.enum(['activity','history']).default('activity')});
export function registerActivityRoutes(router:any,{wrap,permit,fail}:any){
  router.post('/portal-events',wrap(async(req:any,res:any)=>{
    const {module}=z.object({module:z.string().max(50),action:z.enum(['navigate','export']).optional()}).parse(req.body);
    if(!moduleCatalog[module]||req.account.permissions[module]==='none')fail(403,'This workspace section is not available to you.');
    res.status(201).json({ok:true});
  }));
  router.get('/activity',wrap(async(req:any,res:any)=>{
    permit(req,['Super Admin']);await flushActivity();const q=querySchema.parse(req.query);
    const now=new Date(),from=q.from?new Date(q.from+'T00:00:00+05:30'):new Date(now.getTime()-7*86400000),to=q.to?new Date(q.to+'T23:59:59.999+05:30'):now;
    if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>to)fail(400,'Choose a valid date range.');
    const users=await db.user.findMany({where:{role:{not:'Parent'}},select:{id:true,name:true,role:true,email:true,active:true}});
    const staff=users.filter(u=>u.role!=='Student'),actors=q.role?users.filter(u=>u.role===q.role).map(u=>u.id):null;
    const where:any={createdAt:{gte:from,lte:to}};
    if(q.source==='history'){
      if(q.actor)where.actorId=actors&&!actors.includes(q.actor)?{in:[]}:q.actor;else if(actors)where.actorId={in:actors};
      if(q.q)where.OR=[{action:{contains:q.q,mode:'insensitive'}},{entity:{contains:q.q,mode:'insensitive'}},{actorId:{in:users.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q.q.toLowerCase())).map(u=>u.id)}}];
      const [rows,total]=await Promise.all([db.auditLog.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(q.page-1)*40,take:40}),db.auditLog.count({where})]);
      return res.json({rows:rows.map(r=>({id:r.id,title:actions[r.action]||activityLabel(r.action),status:'Recorded',createdAt:r.createdAt,data:{actorName:users.find(u=>u.id===r.actorId)?.name|| (r.actorId==='local-setup'?'Local administrator':r.actorId==='gateway'?'Payment gateway':'System / former member'),actorRole:users.find(u=>u.id===r.actorId)?.role||'System',actorId:r.actorId,entityLabel:activityLabel(r.entity),recordId:r.entityId,category:'Record audit'}})),total,page:q.page,users,staff:[],summary:null});
    }
    where.module='activity';where.AND=[];
    if(q.actor)where.userId=q.actor;
    if(q.role)where.AND.push({data:{path:['actorRole'],equals:q.role}});
    if(q.category)where.AND.push({data:{path:['category'],equals:q.category}});
    if(q.outcome)where.status=q.outcome;
    if(q.q)where.OR=[{title:{contains:q.q,mode:'insensitive'}},...['actorName','entityLabel','recordLabel'].map(k=>({data:{path:[k],string_contains:q.q,mode:'insensitive'}}))];
    const successful={...where,status:q.outcome&&q.outcome!=='Success'?{in:[]}: 'Success'};
    const attention={...where,status:q.outcome?( ['Blocked','Failed'].includes(q.outcome)?q.outcome:{in:[]}):{in:['Blocked','Failed']}};
    const [rows,total,blocked,changed,people,lastSeen,counts,attendance,pendingApprovals]=await Promise.all([
      db.entry.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(q.page-1)*40,take:40}),db.entry.count({where}),
      db.entry.count({where:attention}),db.entry.count({where:{...where,AND:[...where.AND,{data:{path:['category'],equals:'Changes'}}]}}),
      db.entry.groupBy({by:['userId'],where:successful,_count:true}),
      db.entry.groupBy({by:['userId'],where:{module:'activity',status:'Success',userId:{in:staff.map(u=>u.id)}},_max:{createdAt:true}}),
      db.entry.groupBy({by:['userId'],where:successful,_count:true}),
      db.attendance.findMany({where:{date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),employeeId:{not:null}},include:{employee:{select:{userId:true}}}}),
      db.entry.count({where:{module:'approvals',status:'Pending',archived:false}})
    ]);
    const staffRows=staff.filter(u=>(!q.actor||q.actor===u.id)&&(!q.role||q.role===u.role)&&(!q.q||(u.name+' '+u.email).toLowerCase().includes(q.q.toLowerCase()))).map(u=>({...u,lastActivity:lastSeen.find(r=>r.userId===u.id)?._max.createdAt||null,actions:counts.find(r=>r.userId===u.id)?._count||0,attendance:attendance.find(a=>a.employee?.userId===u.id)?.status||'Not recorded'}));
    res.json({rows,total,page:q.page,users,staff:staffRows,summary:{total,blocked,changed,people:people.filter(p=>p.userId).length,pendingApprovals},asOf:now.toISOString()});
  }));
}
