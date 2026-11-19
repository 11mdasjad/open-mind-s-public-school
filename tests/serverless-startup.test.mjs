import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('compiled serverless handler loads in plain Node ESM without a TypeScript loader', () => {
  const root=process.cwd();
  const output=mkdtempSync(path.join(tmpdir(),'school-serverless-'));
  try {
    const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.server.json','--outDir',output],{cwd:root,encoding:'utf8'});
    assert.equal(compile.status,0,compile.stdout+compile.stderr);
    writeFileSync(path.join(output,'package.json'),JSON.stringify({type:'module'}));
    symlinkSync(path.join(root,'node_modules'),path.join(output,'node_modules'),'dir');
    mkdirSync(path.join(output,'certs'));
    copyFileSync('certs/supabase-ca.crt',path.join(output,'certs/supabase-ca.crt'));
    const probe=`
      import assert from 'node:assert/strict';
      import {createServer} from 'node:http';
      import handler from './api/index.js';
      import {db} from './server/db.js';
      const server=createServer(handler);
      try {
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const base='http://127.0.0.1:'+server.address().port;
        const me=await fetch(base+'/api/auth/me');
        assert.equal(me.status,401);
        const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-school-request':'1'},body:'{}'});
        assert.equal(login.status,400);
        console.log('Compiled API imports and login validation passed.');
      } finally {
        await new Promise(resolve=>server.close(resolve));
        await db.$disconnect();
      }
    `;
    const run=spawnSync(process.execPath,['--input-type=module','-e',probe],{
      cwd:output,encoding:'utf8',timeout:30000,
      env:{...process.env,NODE_ENV:'production',VERCEL:'1',TRUST_PROXY:'1',
        DOTENV_CONFIG_PATH:path.join(output,'missing.env'),
        DATABASE_URL:'postgresql://test:test@127.0.0.1:1/test?sslrootcert=certs/supabase-ca.crt'},
    });
    assert.equal(run.status,0,run.stdout+run.stderr);
  } finally {rmSync(output,{recursive:true,force:true});}
});
