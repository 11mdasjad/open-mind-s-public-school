import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import pg from 'pg';
import {databaseRuntime,checkDatabase} from '../scripts/database-runtime.mjs';

test('local database starts, reuses, recovers and preserves records without overwriting external settings',async()=>{
  const root=mkdtempSync('/tmp/school-db-');
  const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  const runtime=databaseRuntime({root,env:{},port,log:()=>{}});
  let reused,restarted;
  async function query(sql){const client=new pg.Client({connectionString:runtime.url});try{await client.connect();return await client.query(sql);}finally{await client.end();}}
  try{
    await runtime.ensure();
    await query('CREATE TABLE preserved_records (name text); INSERT INTO preserved_records VALUES (\'test student\')');
    const savedEnv=readFileSync(`${root}/.env`,'utf8');
    reused=databaseRuntime({root,env:{},log:()=>{}});
    await reused.ensure();await reused.stop();
    await checkDatabase(runtime.url); // stopping a borrower cannot stop the owner
    const external=databaseRuntime({root,env:{DATABASE_URL:`postgresql://another:wrong@127.0.0.1:${port}/other`},log:()=>{}});
    assert.equal(external.local,false);
    await assert.rejects(external.ensure(),/Cannot connect/);
    assert.equal(readFileSync(`${root}/.env`,'utf8'),savedEnv);
    const pid=Number(readFileSync(`${root}/data/postgres/postmaster.pid`,'utf8').split('\n')[0]);
    process.kill(pid,'SIGINT'); // only this isolated temporary database
    for(let i=0;i<100;i++){
      try{process.kill(pid,0);}catch{break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    await runtime.ensure();
    assert.equal((await query('SELECT name FROM preserved_records')).rows[0].name,'test student');
    await runtime.stop();
    restarted=databaseRuntime({root,env:{},log:()=>{}});
    await restarted.ensure();
    assert.equal((await query('SELECT count(*) FROM preserved_records')).rows[0].count,'1');
    assert.equal(readFileSync(`${root}/.env`,'utf8'),savedEnv);
  }finally{await reused?.stop();await runtime.stop();await restarted?.stop();rmSync(root,{recursive:true,force:true});}
});

test('missing credentials never replace an existing database',()=>{
  const root=mkdtempSync('/tmp/school-db-');
  try{
    mkdirSync(`${root}/data/postgres`,{recursive:true});writeFileSync(`${root}/data/postgres/PG_VERSION`,'18');
    assert.throws(()=>databaseRuntime({root,env:{}}),/credentials are missing/);
    assert.equal(readFileSync(`${root}/data/postgres/PG_VERSION`,'utf8'),'18');
  }finally{rmSync(root,{recursive:true,force:true});}
});
