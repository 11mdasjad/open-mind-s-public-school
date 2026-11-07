import {modules} from './modules';
export const portalKinds=['admin','principal','teacher','hr','accounts','student','employee'] as const;
export type PortalKind=typeof portalKinds[number];
export const portalNames:Record<PortalKind,string>={admin:'Super Admin',principal:'Principal',teacher:'Teacher',hr:'HR',accounts:'Fees & Accounts',student:'Student',employee:'Employee'};
export function portalForRole(role:string):PortalKind {
  if(['Principal','Vice Principal'].includes(role))return 'principal';
  if(['Super Admin','School Admin'].includes(role))return 'admin';
  if(['Teacher','Class Teacher'].includes(role))return 'teacher';
  if(role==='HR Manager')return 'hr';
  if(role==='Accountant')return 'accounts';
  if(role==='Student')return 'student';
  return 'employee';
}
export function portalHome(role:string,tab='overview'){return `/${portalForRole(role)}/${tab}`;}
export function isPortalRoute(route:string){return route==='/portal'||route.startsWith('/portal/')||route==='/parent'||route.startsWith('/parent/')||portalKinds.some(k=>route===`/${k}`||route.startsWith(`/${k}/`));}
export function portalTab(route:string){return route.split('?')[0].split('/')[2]||'overview';}
export const moduleCatalog:Record<string,string>={overview:'Dashboard',students:'Student records',employees:'Employee records',admissions:'Admissions',academics:'Classes & subjects',timetable:'Timetable',attendance:'Central attendance',exams:'Examinations & marks',homework:'Homework',submissions:'Submissions',progress:'Student progress & behaviour',studentAssessments:'Student assessments',employeeAssessments:'Employee assessments',appraisals:'Employee appraisals',recruitment:'Recruitment & onboarding',workReports:'Work reports',leave:'Leave management',fees:'Fees & collection',feeStructures:'Fee structures',paymentVerifications:'Payment verification',payroll:'Payroll & payslips',departments:'Departments',library:'Library',loans:'Book circulation',vehicles:'Vehicles',routes:'Routes',transport:'Transport',inventory:'Inventory',purchases:'Purchases',events:'School calendar',notices:'School notices','delivery-logs':'Delivery logs',reports:'Reports & exports',analytics:'Central reports & analytics',schoolReports:'School reports',approvals:'Approval workflow',notifications:'Notifications',cms:'Website CMS',users:'Users & access',permissions:'Roles & permissions',documents:'Documents',audit:'Activity log',settings:'School & account settings',accessRequests:'Account recovery'};
export const studentCreateRoles=['Super Admin','School Admin','Principal','Teacher','Class Teacher','HR Manager','Receptionist'];
export const studentArchiveRoles=['Super Admin','School Admin','Principal'];
export const studentEditRoles=['Super Admin','School Admin','Principal','Receptionist'];
export type AccessLevel='none'|'view'|'manage';
export type PermissionMap=Record<string,AccessLevel>;
export function defaultPermission(role:string,key:string):AccessLevel {
  if(role==='Parent'||!moduleCatalog[key])return 'none';
  if(role==='Super Admin')return 'manage';
  if(key==='students'&&studentCreateRoles.includes(role))return 'manage';
  if(['overview','notifications','settings','documents','leave'].includes(key))return ['documents','leave','notifications','settings'].includes(key)?'manage':'view';
  if(role==='School Admin')return ['permissions','audit','users'].includes(key)?'none':'manage';
  if(['Principal','Vice Principal'].includes(role)){
    if(['approvals','studentAssessments','employeeAssessments','schoolReports','progress','exams','leave'].includes(key))return 'manage';
    return ['students','employees','academics','timetable','attendance','homework','submissions','fees','feeStructures','paymentVerifications','payroll','departments','analytics','appraisals','workReports','recruitment','accessRequests','events','notices','library','reports'].includes(key)?'view':'none';
  }
  if(role==='Accountant'&&key==='approvals')return 'manage';
  if(['events','notices','reports','approvals'].includes(key))return 'view';
  if(key==='library'&&role!=='Librarian')return 'view';
  if(role==='Student')return key==='submissions'?'manage':['students','attendance','exams','homework','progress','timetable','fees','loans','transport'].includes(key)?'view':'none';
  if(['employees','attendance','payroll','workReports'].includes(key)&&!['HR Manager','Accountant'].includes(role)&&!(key==='attendance'&&['Teacher','Class Teacher'].includes(role)))return key==='workReports'?'manage':'view';
  const own:Record<string,string[]>={Teacher:['homework','submissions','exams','attendance','progress'],'Class Teacher':['homework','submissions','exams','attendance','progress'],Accountant:['fees','feeStructures','paymentVerifications','purchases'],'HR Manager':['employees','attendance','payroll','departments','recruitment','appraisals'],Librarian:['library','loans'],'Transport Manager':['vehicles','routes','transport'],Receptionist:['students','admissions']};
  if(own[role]?.includes(key))return 'manage';
  const view:Record<string,string[]>={Teacher:['students','academics','timetable','analytics'],'Class Teacher':['students','academics','timetable','analytics'],Accountant:['students','employees','attendance','payroll','analytics'],'HR Manager':['analytics','employeeAssessments','workReports'],Librarian:['students'],'Transport Manager':['students'],Receptionist:[]};
  if(view[role]?.includes(key))return 'view';
  if(key==='workReports')return 'manage';
  return 'none';
}
export function permissionsForRole(role:string):PermissionMap{return Object.fromEntries(Object.keys(moduleCatalog).map(key=>[key,defaultPermission(role,key)]));}
export function canAccessModule(role:string,key:string,permissions?:PermissionMap){return (permissions?.[key]??defaultPermission(role,key))!=='none';}
export function canManageModule(role:string,key:string,permissions?:PermissionMap){return (permissions?.[key]??defaultPermission(role,key))==='manage';}
// Administrative delegation is intentionally limited to operational modules.
export const delegatableModules=['academics','timetable','homework','progress','studentAssessments','employeeAssessments','appraisals','recruitment','workReports','schoolReports','departments','library','loans','vehicles','routes','transport','inventory','purchases','events','notices'];
