import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {parse} from 'dotenv';
import {postgresConnection} from './postgres-connection.mjs';

export async function checkDatabase(url) {
  const remote=!['127.0.0.1','localhost','::1'].includes(new URL(url).hostname);
  const timeout=remote?15000:2000;
  const client=new pg.Client({...postgresConnection(url),connectionTimeoutMillis:timeout,query_timeout:timeout});
  client.on('error',()=>{});
  try {await client.connect();await client.query('SELECT 1');}
  finally {await client.end().catch(()=>{});}
}

// Start only this project's database; never replace explicit external settings,
// regenerate existing credentials, or reset school records.
export function databaseRuntime({root=process.cwd(),env=process.env,port=55432,log=console.log}={}) {
  const envPath=path.join(root,'.env'),dataDir=path.join(root,'data');
  const fileEnv=existsSync(envPath)?parse(readFileSync(envPath)):{};
  const configured=env.DATABASE_URL||fileEnv.DATABASE_URL;
  const configPath=path.join(dataDir,'postgres-local.json'),databaseDir=path.join(dataDir,'postgres');
  let config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):null;
  if(!configured&&!config){
    if(existsSync(path.join(databaseDir,'PG_VERSION')))throw new Error('Local database credentials are missing. Restore data/postgres-local.json; existing data was left untouched.');
    mkdirSync(dataDir,{recursive:true});
    config={password:randomBytes(24).toString('hex'),port};
    writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
  }
  const url=configured||(config?`postgresql://school:${encodeURIComponent(config.password)}@127.0.0.1:${config.port}/openmind`:null);
  let parsed;
  try{parsed=new URL(url);}catch{throw new Error('DATABASE_URL is invalid. Check the local .env configuration.');}
  if(!['postgresql:','postgres:'].includes(parsed.protocol))throw new Error('This application requires PostgreSQL. Restore the PostgreSQL DATABASE_URL before starting.');
  const local=!!config&&['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.port===String(config.port)&&parsed.pathname==='/openmind'&&decodeURIComponent(parsed.username)==='school'&&decodeURIComponent(parsed.password)===config.password;
  if(!configured){
    const original=existsSync(envPath)?readFileSync(envPath,'utf8'):'';
    writeFileSync(envPath,`${original.replace(/^\s*DATABASE_URL\s*=.*(?:\r?\n|$)/gm,'')}\nDATABASE_URL="${url}"\n`,{mode:0o600});
  }
  let owned=null,starting=null,stopped=false;
  async function ensure(){
    if(stopped)return;
    if(starting)return starting;
    starting=(async()=>{
      try{await checkDatabase(url);return;}
      catch(error){
        if(!local||error.code!=='ECONNREFUSED')throw new Error('Cannot connect to the configured database. Check that its server is running and its credentials are correct.');
      }
      if(owned?.process&&owned.process.exitCode===null&&owned.process.signalCode===null)throw new Error('Local PostgreSQL is still starting. Retry shortly.');
      log('Starting project-local PostgreSQL…');
      mkdirSync(dataDir,{recursive:true});
      owned=new EmbeddedPostgres({databaseDir,user:'school',password:config.password,port:config.port,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-k',dataDir],onLog:()=>{},onError:()=>{}});
      if(!existsSync(path.join(databaseDir,'PG_VERSION')))await owned.initialise();
      try{await owned.start();}catch{
        if(owned.process&&(owned.process.exitCode!==null||owned.process.signalCode!==null))owned.process=undefined;
        throw new Error('Local PostgreSQL could not start. Check its port and data/postgres permissions. Existing data was left untouched.');
      }
      // Avoid waiting on an already exited child during library shutdown.
      const instance=owned;
      instance.process.once('exit',()=>{instance.process=undefined;});
      const client=owned.getPgClient();
      try{
        await client.connect();
        const result=await client.query("SELECT 1 FROM pg_database WHERE datname='openmind'");
        if(!result.rowCount)await client.query('CREATE DATABASE openmind');
      }finally{await client.end();}
      await checkDatabase(url);
      log('Database ready. Existing school records are preserved.');
    })().finally(()=>{starting=null;});
    return starting;
  }
  async function stop(){stopped=true;await starting?.catch(()=>{});if(owned?.process)await owned.stop();}
  return {url,local,ensure,stop};
}
