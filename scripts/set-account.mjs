import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
const db=new PrismaClient();
try {
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const {email,name,password,role}=JSON.parse(input);
  if(!email||!name||typeof password!=='string'||password.length<8||!['Principal','Teacher','Class Teacher','Employee','HR Manager','Accountant'].includes(role))throw Error('Supply a school email, name, role and a password of at least 8 characters through stdin.');
  const existing=await db.user.findUnique({where:{email:email.toLowerCase()}});
  if(existing&&['Super Admin','Student','Parent'].includes(existing.role))throw Error('This command cannot change this type of existing account.');
  const passwordHash=await bcrypt.hash(password,12);
  const account=await db.$transaction(async tx=>{
    const user=await tx.user.upsert({where:{email:email.toLowerCase()},create:{email:email.toLowerCase(),name,role,passwordHash},update:{name,role,passwordHash,active:true,failedAttempts:0,lockedUntil:null}});
    await tx.session.deleteMany({where:{userId:user.id}});
    await tx.passwordReset.deleteMany({where:{userId:user.id}});
    await tx.configuration.deleteMany({where:{id:`user-access:${user.id}`}});
    await tx.auditLog.create({data:{actorId:'local-setup',action:existing?'reset-account-credentials':'create-account',entity:'user',entityId:user.id}});
    return user;
  });
  console.log(JSON.stringify({email:account.email,role:account.role,active:account.active}));
}catch(error){console.error(error.message);process.exitCode=1}finally{await db.$disconnect()}
