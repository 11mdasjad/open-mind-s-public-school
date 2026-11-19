import {db} from '../server/db';
import {syncFeeReminders} from '../server/fee-maintenance';
try{console.log(JSON.stringify(await syncFeeReminders()));}finally{await db.$disconnect();}
