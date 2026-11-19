import {db} from '../server/db';
import {schoolSettings} from '../server/access';
import {initializeFees} from '../server/fee-office-core';
try {
 const admin=await db.user.findFirst({where:{role:'Super Admin',active:true},orderBy:{createdAt:'asc'},select:{id:true}});
 if(!admin)throw new Error('Create a Super Admin account before initializing fee configuration.');
 const {academicSession}=await schoolSettings();
 const before={students:await db.student.count(),invoices:await db.invoice.count(),payments:await db.payment.count()};
 const result=await initializeFees(academicSession,admin.id);
 const after={students:await db.student.count(),invoices:await db.invoice.count(),payments:await db.payment.count()};
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Unexpected record count change during fee initialization.');
 console.log(JSON.stringify({session:academicSession,...result,existingRecordsPreserved:after}));
}finally{await db.$disconnect();}
