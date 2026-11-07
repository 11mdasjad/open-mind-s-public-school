import {db} from './db';
import {roles} from '../shared/modules';
import {moduleCatalog,permissionsForRole,defaultPermission,delegatableModules,type PermissionMap} from '../shared/portals';
import {z} from 'zod';
export async function schoolSettings(){
 const stored=await db.configuration.findUnique({where:{id:'school-settings'}});
 return {name:"Open Mind's Public School",code:'',academicSession:`${new Date().getFullYear()}–${new Date().getFullYear()+1}`,email:'',phone:'',address:'',...(stored?.data as any||{})};
}
export async function effectiveAccess(user:any){
  const assignment=await db.configuration.findUnique({where:{id:`user-access:${user.id}`}});
  const roleId=(assignment?.data as any)?.roleId;
  const profile=roleId?await db.configuration.findUnique({where:{id:`access-role:${roleId}`}}):null;
  const data=profile?.data as any;
  const permissions=permissionsForRole(user.role);
  if(user.role!=='Super Admin'&&data?.baseRole===user.role)Object.assign(permissions,data.permissions);
  return {permissions,accessRole:data?.baseRole===user.role?data.name:user.role,accessRoleId:data?.baseRole===user.role?roleId:null};
}
export function moduleForPath(path:string):string|null{
  const p=path.split('/').filter(Boolean),first=p[0];
  if(['auth','directory','integrations','portal-summary','portal-events'].includes(first))return null;
  if(first==='attendance'&&['check','self'].includes(p[1]))return null;
  if(['dashboard','workspace-summary'].includes(first))return 'overview';
  if(first==='activity')return 'audit';
  if(first==='records')return p[1];
  if(first==='role-profiles'||first==='permission-catalog'||(first==='users'&&p[2]==='access'))return 'permissions';
  if(first==='users'&&p[2]==='invite')return 'accessRequests';
  if(first==='access-requests')return 'accessRequests';
  if(first==='workflow')return 'approvals';
  if(first==='reports')return ({receipt:'fees',payslip:'payroll',student:'students',idcard:'students',reportcard:'exams'} as Record<string,string>)[p[1]]||'reports';
  if(first==='exports')return p[1]?.split('.')[0];
  if(first==='configuration')return p[1]==='grading'?'exams':'settings';
  if(first==='school-settings')return 'settings';
  if(first==='communications')return 'notices';
  if(first==='payment-verifications')return 'paymentVerifications';
  if(first==='imports')return p[1];
  if(first==='fees'||first==='payments'||first==='refunds')return 'fees';
  return moduleCatalog[first]?first:null;
}
export function isDelegated(account:any,module:string){return account.role!=='Student'&&delegatableModules.includes(module)&&account.permissions?.[module]==='manage'&&defaultPermission(account.role,module)!=='manage';}
export function hasDelegatedRead(account:any,module:string){return account.role!=='Student'&&delegatableModules.includes(module)&&account.permissions?.[module]==='view'&&defaultPermission(account.role,module)==='none';}
export function validatePermissions(baseRole:string,input:PermissionMap,fail:any){
  const defaults=permissionsForRole(baseRole),result={...defaults};
  for(const [key,level] of Object.entries(input)){
    if(!moduleCatalog[key])fail(400,'Unknown permission module.');
    const rank={none:0,view:1,manage:2};
    if(rank[level]>rank[defaults[key]]&&(baseRole==='Student'||!delegatableModules.includes(key)))fail(400,`Choose a suitable base role to grant ${moduleCatalog[key]}.`);
    result[key]=level;
  }
  result.overview='view';result.settings='manage';result.notifications='manage';
  // Forms for delegated academic and circulation modules need the basic student directory.
  if(['progress','studentAssessments','loans','transport','academics','timetable','homework'].some(k=>result[k]==='manage')&&result.students==='none')result.students='view';
  return result;
}
export function registerAccessRoutes(router:any,{wrap,permit,fail,audit}:any){
  const schema=z.object({name:z.string().trim().min(2).max(80),baseRole:z.enum(roles.filter(r=>r!=='Super Admin') as [string,...string[]]),permissions:z.record(z.string(),z.enum(['none','view','manage']))});
  router.get('/school-settings',wrap(async(req:any,res:any)=>res.json(await schoolSettings())));
  router.put('/school-settings',wrap(async(req:any,res:any)=>{
    permit(req,['Super Admin']);const data=z.object({name:z.string().trim().min(2).max(150),code:z.string().trim().max(50),academicSession:z.string().trim().min(4).max(50),email:z.union([z.email(),z.literal('')]),phone:z.string().trim().max(30),address:z.string().trim().max(1000)}).strict().parse(req.body);
    await db.configuration.upsert({where:{id:'school-settings'},create:{id:'school-settings',data},update:{data}});await audit(req,'update-school-settings','configuration','school-settings');res.json(data);
  }));
  router.get('/permission-catalog',wrap(async(req:any,res:any)=>{permit(req,['Super Admin']);res.json({modules:moduleCatalog,baseRoles:roles.filter(r=>r!=='Super Admin'),defaults:Object.fromEntries(roles.map(r=>[r,permissionsForRole(r)])),delegatableModules});}));
  router.get('/role-profiles',wrap(async(req:any,res:any)=>{permit(req,['Super Admin']);const entries=await db.configuration.findMany({where:{id:{startsWith:'access-role:'}},orderBy:{updatedAt:'desc'}});res.json(entries.map(r=>({id:r.id.slice(12),...(r.data as any)})));}));
  router.post('/role-profiles',wrap(async(req:any,res:any)=>{permit(req,['Super Admin']);const d=schema.parse(req.body);const permissions=validatePermissions(d.baseRole,d.permissions,fail);const id=crypto.randomUUID();await db.configuration.create({data:{id:`access-role:${id}`,data:{...d,permissions}}});await audit(req,'create-role','permissions',id);res.status(201).json({id,...d,permissions});}));
  router.put('/role-profiles/:id',wrap(async(req:any,res:any)=>{permit(req,['Super Admin']);const d=schema.parse(req.body),old=await db.configuration.findUnique({where:{id:`access-role:${req.params.id}`}});if(!old)fail(404,'Role profile not found.');if((old!.data as any).baseRole!==d.baseRole)fail(400,'Create a new profile to change its base role.');const permissions=validatePermissions(d.baseRole,d.permissions,fail);await db.configuration.update({where:{id:old!.id},data:{data:{...d,permissions}}});await audit(req,'update-role','permissions',req.params.id);res.json({id:req.params.id,...d,permissions});}));
  router.post('/users/:id/access',wrap(async(req:any,res:any)=>{
    permit(req,['Super Admin']);const d=z.object({roleId:z.string().nullable()}).parse(req.body);if(req.params.id===req.account.id)fail(400,'You cannot change your own administrative access.');
    const target=await db.user.findUnique({where:{id:req.params.id}});if(!target||target!.role==='Parent'||target!.role==='Super Admin')fail(400,'Choose an active school member other than a Super Admin.');
    const profile=d.roleId?await db.configuration.findUnique({where:{id:`access-role:${d.roleId}`}}):null;if(d.roleId&&!profile)fail(404,'Role profile not found.');
    const baseRole=(profile?.data as any)?.baseRole||target!.role;
    if((target!.role==='Student')!==(baseRole==='Student'))fail(400,'Student accounts must keep student-only access.');
    await db.$transaction(async tx=>{await tx.configuration.upsert({where:{id:`user-access:${target!.id}`},create:{id:`user-access:${target!.id}`,data:{roleId:d.roleId}},update:{data:{roleId:d.roleId}}});await tx.user.update({where:{id:target!.id},data:{role:baseRole}});await tx.session.deleteMany({where:{userId:target!.id}});await tx.entry.create({data:{module:'notifications',title:'Your access has been updated',userId:target!.id,data:{message:'Your administrator updated your role and module access. Sign in again to use your current workspace.',link:'settings'},status:'Unread'}});});
    await audit(req,'assign-role','user',target!.id);res.json({ok:true});
  }));
}
