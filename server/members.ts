import {db} from './db';
import {admins} from '../shared/modules';
import {portalForRole} from '../shared/portals';
export function registerMemberRoutes(router:any,{wrap,permit,fail,audit,allowedStudents,scopedEntries}:any){
  router.get('/portal-summary',wrap(async(req:any,res:any)=>{
    const kind=portalForRole(req.account.role),family=kind==='student';
    const students=await allowedStudents(req),ids=students.map((s:any)=>s.id);
    const employee=family?null:await db.employee.findUnique({where:{userId:req.account.id}});
    const financial=req.account.permissions.fees!=='none'&&(family||admins.includes(req.account.role)||req.account.role==='Accountant');
    const [attendance,invoices,payroll,leave,notices,events,homework,submissions,timetable,exams]=await Promise.all([
      db.attendance.findMany({where:family?{studentId:{in:ids}}:employee?{employeeId:employee.id}:{id:'no-profile'},orderBy:{date:'desc'},take:1000}),
      financial?db.invoice.findMany({where:{studentId:{in:ids}},include:{payments:{include:{refunds:true}},student:{select:{name:true}}},orderBy:{dueDate:'asc'}}):Promise.resolve([]),
      employee&&req.account.permissions.payroll!=='none'?db.payroll.findMany({where:{employeeId:employee.id,status:'Approved'},orderBy:{month:'desc'},take:12}):Promise.resolve([]),
      db.entry.findMany({where:{module:'leave',userId:req.account.id,archived:false},orderBy:{createdAt:'desc'}}),
      scopedEntries(req,'notices'),scopedEntries(req,'events'),scopedEntries(req,'homework'),scopedEntries(req,'submissions'),scopedEntries(req,'timetable'),
      family?db.exam.findMany({where:{published:true,marks:{some:{studentId:{in:ids}}}},include:{marks:{where:{studentId:{in:ids}}}}}):Promise.resolve([])
    ]);
    const pending=invoices.reduce((sum:any,i:any)=>sum+i.amount-i.payments.reduce((n:any,p:any)=>n+p.amount-p.refunds.reduce((s:any,r:any)=>s+r.amount,0),0),0);
    res.json({kind,students:family?students:[],assignedStudents:family?0:students.length,employee:req.account.permissions.employees==='none'?null:employee,attendance:req.account.permissions.attendance==='none'?[]:attendance,invoices,pending,payroll,leave:req.account.permissions.leave==='none'?[]:leave,notices,events,homework,submissions,timetable,exams:req.account.permissions.exams==='none'?[]:exams});
  }));
  router.post('/access-requests/:id/resolve',wrap(async(req:any,res:any)=>{
    permit(req,admins);const record=await db.entry.findFirst({where:{id:req.params.id,module:'accessRequests',archived:false}});if(!record)return fail(404,'Access request not found.');
    await db.entry.update({where:{id:record.id},data:{status:'Resolved'}});await audit(req,'resolve','accessRequest',record.id);res.json({ok:true});
  }));
}
