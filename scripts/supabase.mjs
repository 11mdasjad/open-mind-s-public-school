import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import pg from 'pg';
import {postgresConnection} from './postgres-connection.mjs';

const root=path.resolve(import.meta.dirname,'..');
process.chdir(root);
process.umask(0o077);
const action=process.argv[2]||'check';
if(!['check','backup','migrate','verify'].includes(action))throw new Error('Use check, backup, migrate or verify.');
const source=parse(readFileSync('.env','utf8'));
const target=parse(readFileSync('.env.supabase','utf8'));
const models=[...readFileSync('prisma/schema.prisma','utf8').matchAll(/^model (\w+) \{/gm)].map(m=>m[1]).sort();
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const bin=process.env.SCHOOL_PG_BIN||'/opt/homebrew/opt/libpq/bin';
let local,remote;
function client(url){return new pg.Client({...postgresConnection(url),connectionTimeoutMillis:15000,query_timeout:120000});}
function command(executable,args,env={}){
  const result=spawnSync(executable,args,{env:{...process.env,...env},encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.error||result.status!==0) {
    // Never echo a connection URI or environment. Tools can include them in errors.
    const diagnostic=(result.stderr||result.stdout||'').replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[database URI redacted]');
    throw new Error(`${path.basename(executable)} failed: ${diagnostic.slice(-2500)||result.error?.code||result.status}`);
  }
  return result.stdout;
}
function pgEnv(url){
  const u=new URL(url);
  return {PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),
    PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),
    PGSSLMODE:u.searchParams.has('sslrootcert')?'verify-full':'disable',
    PGSSLROOTCERT:u.searchParams.get('sslrootcert')||'',PGCONNECT_TIMEOUT:'15'};
}
async function manifest(c){
  await c.query("SET TIME ZONE 'UTC'");
  const result={};
  for(const name of models){
    const r=await c.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_data, E'\n' ORDER BY row_data),'')) AS hash FROM (SELECT to_jsonb(t)::text AS row_data FROM public.${quote(name)} t) s`);
    result[name]=r.rows[0];
  }
  return result;
}
function filesManifest(){
  const files={};
  function visit(dir){if(!existsSync(dir))return;for(const item of readdirSync(dir,{withFileTypes:true})){
    const filename=path.join(dir,item.name);
    if(item.isDirectory())visit(filename);
    else if(item.isFile())files[filename]=createHash('sha256').update(readFileSync(filename)).digest('hex');
  }}
  visit('uploads');return files;
}
async function backup(c){
  const dir=path.join('backups',`supabase-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  mkdirSync(dir,{recursive:true,mode:0o700});
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    const snapshot=(await c.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const common=['--format=custom','--no-owner','--no-privileges',`--snapshot=${snapshot}`];
    command(path.join(bin,'pg_dump'),[...common,`--file=${dir}/local-full.dump`],pgEnv(source.DATABASE_URL));
    command(path.join(bin,'pg_dump'),[...common,'--data-only','--schema=public',
      '--exclude-table=public._prisma_migrations','--quote-all-identifiers',`--file=${dir}/school-data.dump`],pgEnv(source.DATABASE_URL));
    const data=await manifest(c);
    writeFileSync(`${dir}/manifest.json`,JSON.stringify({tables:data,files:filesManifest()},null,2),{mode:0o600});
    copyFileSync('.env',`${dir}/local.env`);
    command('tar',['-czf',`${dir}/uploads.tar.gz`,'uploads']);
    await c.query('COMMIT');
    console.log('Backup created:',dir);
    return {dir,data};
  }catch(e){await c.query('ROLLBACK');throw e;}
}
try{
  if(action!=='backup'){
    const u=new URL(target.DATABASE_URL);
    if(u.hostname!=='aws-1-ap-northeast-1.pooler.supabase.com'||decodeURIComponent(u.username)!=='postgres.zozlekhklomldxqqqdal'||u.pathname!=='/postgres'||u.port!=='5432')throw new Error('Unexpected Supabase destination.');
    remote=client(target.DATABASE_URL);await remote.connect();
    console.log('Supabase connected with certificate verification. PostgreSQL:',(await remote.query('SHOW server_version')).rows[0].server_version);
    if(action==='check'){
      const tables=(await remote.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
      console.log('Public tables:',tables.map(t=>t.tablename).join(', ')||'(empty)');
    }
  }
  if(action!=='check'){
    const u=new URL(source.DATABASE_URL);
    if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/openmind')throw new Error('Source must still be the local school database.');
    local=client(source.DATABASE_URL);await local.connect();
    if(action==='backup')await backup(local);
    if(action==='migrate'){
      // The API must be stopped before taking the final snapshot.
      const sessions=(await local.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()" )).rows[0].n;
      if(sessions)throw new Error('Stop the local school API and other database clients before migration.');
      const existing=(await remote.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
      for(const {tablename} of existing){
        if(!models.includes(tablename)&&tablename!=='_prisma_migrations')throw new Error('Unexpected public table; refusing to import.');
        if(tablename!=='_prisma_migrations'&&(await remote.query(`SELECT EXISTS(SELECT 1 FROM public.${quote(tablename)}) AS populated`)).rows[0].populated)throw new Error('Target already contains data; refusing duplicate import.');
      }
      const saved=await backup(local);
      command(process.execPath,['scripts/prisma.mjs','migrate','deploy'],target);
      console.log('Repository migrations applied.');
      command(path.join(bin,'pg_restore'),['--dbname=postgres','--data-only','--no-owner','--no-privileges','--single-transaction','--exit-on-error',`${saved.dir}/school-data.dump`],pgEnv(target.DATABASE_URL));
      console.log('School records imported.');
      const transferred=await manifest(remote);
      if(JSON.stringify(saved.data)!==JSON.stringify(transferred))throw new Error('Data comparison failed; application connection has NOT been changed.');
      if(JSON.stringify(await manifest(local))!==JSON.stringify(saved.data))throw new Error('Local data changed during migration; application connection has NOT been changed.');
      writeFileSync(`${saved.dir}/verified-target.json`,JSON.stringify(transferred,null,2),{mode:0o600});
      console.log(`Verified all ${models.length} tables by count and complete row-content hash. Backup: ${saved.dir}`);
      console.log('Ready for application cutover. .env has NOT been changed.');
    }
    if(action==='verify'){
      const a=await manifest(local),b=await manifest(remote);
      const differences=models.filter(name=>JSON.stringify(a[name])!==JSON.stringify(b[name]));
      console.log('Compared application tables:',models.length);
      if(differences.length)throw new Error(`Tables differ: ${differences.join(', ')}`);
      console.log('All records match by count and complete row-content hash.');
    }
  }
}catch(e){
  if(e.code==='28P01')console.error('Supabase authentication rejected the configured database password (28P01).');
  else console.error(e.code||e.message);
  process.exitCode=1;
}finally{await local?.end();await remote?.end();}
