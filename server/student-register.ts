import {db} from './db';
import {admins} from '../shared/modules';
import {classKey} from '../shared/student-register';

export async function allowedDraftStudents(req: any) {
  if (req.account.permissions?.students === 'none') return [];
  const staff = [...admins, 'Accountant', 'Fee Clerk', 'Receptionist', 'HR Manager'].includes(req.account.role);
  const teacher = ['Teacher','Class Teacher'].includes(req.account.role);
  if (!staff && !teacher) return [];
  const drafts = await db.entry.findMany({where:{module:'studentDrafts',archived:false},select:{id:true,data:true}});
  const records: (Record<string,any> & {id:string;isDraft:boolean})[] = drafts.map(row=>({...row.data as Record<string,any>,id:row.id,isDraft:true,admissionNo:''}));
  if (staff) return records;
  const employee = await db.employee.findUnique({where:{userId:req.account.id},select:{id:true}});
  if (!employee) return [];
  const classes = await db.entry.findMany({where:{module:'academics',archived:false},select:{title:true,data:true}});
  return records.filter(student=>classes.some(row=>{
    const data=row.data as any;
    return data.teacherId===employee.id && classKey(row.title)===classKey(student.className) && (!student.section || data.section===student.section) && (!student.session || data.session===student.session);
  }));
}
export const invoiceScope = (students: {id:string}[], drafts: {id:string}[]) => ({OR:[{studentId:{in:students.map(row=>row.id)}},{draftStudentId:{in:drafts.map(row=>row.id)}}]});
