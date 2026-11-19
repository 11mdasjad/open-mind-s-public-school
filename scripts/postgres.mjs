import 'dotenv/config';
import {databaseRuntime} from './database-runtime.mjs';
const database=databaseRuntime();
try {
  await database.ensure();
  console.log('Database is ready. For the complete website, use npm run dev.');
} catch(error) {console.error(error.message);await database.stop();process.exitCode=1;}
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await database.stop();process.exitCode=0;}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
