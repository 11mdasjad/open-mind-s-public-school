import 'dotenv/config';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import path from 'node:path';
import {databaseRuntime} from './database-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const children=new Set();
let database,monitor,stopping=false;
async function stop(code=0){
  if(stopping)return;
  stopping=true;clearInterval(monitor);
  await Promise.all([...children].map(child=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');})));
  await database?.stop();process.exitCode=code;
}
process.on('SIGINT',()=>void stop());
process.on('SIGTERM',()=>void stop());
function run(args,persistent=false){
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,DATABASE_URL:database.url},stdio:'inherit'});
  children.add(child);
  return new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('exit',code=>{
      children.delete(child);
      if(persistent&&!stopping)void stop(code||1);
      code===0?resolve():reject(new Error(`Development command exited (${code}).`));
    });
  });
}
async function requireFreePort(port){
  await new Promise((resolve,reject)=>{
    const server=createServer();
    server.once('error',()=>reject(new Error(`Port ${port} is already in use. Stop the existing school server before starting another copy.`)));
    server.listen(port,'127.0.0.1',()=>server.close(resolve));
  });
}
try{
  await requireFreePort(Number(process.env.PORT||3001));await requireFreePort(5173);
  database=databaseRuntime({root});await database.ensure();
  if(database.local)await run(['node_modules/prisma/build/index.js','migrate','deploy']);
  for(const args of [['node_modules/tsx/dist/cli.mjs','watch','server/index.ts'],['node_modules/vite/bin/vite.js','--host','127.0.0.1','--strictPort']])
    void run(args,true).catch(error=>{if(!stopping){console.error(error.message);void stop(1);}});
  let checking=false,reported=false;
  if(database.local)monitor=setInterval(async()=>{
    if(checking||stopping)return;checking=true;
    try{await database.ensure();if(reported)console.log('Database connection restored.');reported=false;}
    catch(error){if(!reported)console.error(error.message);reported=true;}
    finally{checking=false;}
  },5000);
}catch(error){console.error(error.message);await stop(1);}
