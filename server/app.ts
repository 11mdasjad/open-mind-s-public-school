import {emitSchoolNotification,registerNotificationRoutes} from './notifications';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { db } from "./db";
import { modules, admins, roles, publicPages } from "../shared/modules";
import { registerExtensions } from "./extensions";
import { validSignature, reconcilePayment } from "./payments";
import { defaultGrades, gradeFor } from "./grades";
import {portalForRole,portalKinds,defaultPermission,studentCreateRoles,studentArchiveRoles,studentEditRoles} from '../shared/portals';
import {schoolSettings,effectiveAccess,moduleForPath,isDelegated,hasDelegatedRead,registerAccessRoutes} from './access';
import {registerMemberRoutes} from './members';
import {registerWorkflowRoutes} from './workflow';
import {activityMiddleware,registerActivityRoutes} from './activity';

declare global {
  namespace Express {
    interface Request {
      account?: any;
      sessionId?: string;
      csrf?: string;
    }
  }
}
export const app = express();
const production = process.env.NODE_ENV === "production";
const wrap =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const id = () => randomBytes(8).toString("hex").toUpperCase();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const date = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const privileged = (u: any) => admins.includes(u.role);
const permit = (req: Request, allowed: string[]) => {
  if (!req.account || (!allowed.includes(req.account.role) && !isDelegated(req.account,moduleForPath(req.path)||'')))
    fail(403, "You do not have permission for this action.");
};
const audit = async (
  req: Request,
  action: string,
  entity: string,
  entityId: string,
) => {
  (req as any).activityAction={action,entity,entityId};
  const event=await db.auditLog.create({data:{actorId:req.account?.id||'public',action,entity,entityId}});
  await emitSchoolNotification(req,action,entity,entityId,event.id);
  return event;
};
const email = z
  .string()
  .email()
  .transform((s) => s.toLowerCase().trim());
const str = z.string().trim().min(1).max(1000);
const password = z.string().min(12, "Use at least 12 characters.").max(128);
const iso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .transform((n) => Math.round(n * 100));
app.disable("x-powered-by");
if(process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://checkout.razorpay.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://api.razorpay.com"],
        frameSrc: ["https://api.razorpay.com", "https://checkout.razorpay.com"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  }),
);
app.post(
  "/api/payments/webhook",
  rateLimit({ windowMs: 60000, limit: 120 }),
  express.raw({ type: "application/json", limit: "256kb" }),
  wrap(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) fail(503, "Webhook is not configured.");
    if (
      !Buffer.isBuffer(req.body) ||
      !validSignature(
        req.body,
        String(req.headers["x-razorpay-signature"] || ""),
        secret,
      )
    )
      fail(400, "Invalid webhook signature.");
    const event = JSON.parse(req.body.toString());
    if (event.event === "payment.captured") {
      const p = event.payload?.payment?.entity;
      if (!p?.order_id || !p?.id) fail(400, "Missing payment.");
      await reconcilePayment(p.order_id, p.id);
    }
    res.json({ ok: true });
  }),
);
app.use(express.json({ limit: "1mb" }), cookieParser());
app.use("/api",activityMiddleware);
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: process.env.NODE_ENV==='test'?3000:300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const allowed = [
      process.env.APP_ORIGIN,
      `http://${req.headers.host}`,
      `https://${req.headers.host}`,
    ];
    if (req.headers.origin && !allowed.includes(req.headers.origin))
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (req.headers["x-school-request"] !== "1")
      return res.status(403).json({ error: "Request verification missing." });
  }
  next();
});
app.get(
  "/api/health",
  wrap(async (_req, res) => {
    try {
      await db.user.count();
      res.json({ ok: true, database: "connected" });
    } catch (e: any) {
      res.status(503).json({
        ok: false,
        database: "disconnected",
        error: "Database connection failed. Please check DATABASE_URL in environment variables.",
      });
    }
  }),
);
app.get(
  "/api/public",
  wrap(async (_req, res) => {
    const [pages, notices, events] = await Promise.all([
      db.websitePage.findMany(),
      db.entry.findMany({ where: { module: "notices", archived: false } }),
      db.entry.findMany({ where: { module: "events", archived: false } }),
    ]);
    res.json({
      pages: {
        ...publicPages,
        ...Object.fromEntries(pages.map((p) => [p.id, p])),
      },
      notices: notices.filter((n) => {
        const d = n.data as any;
        return d.audience === "Public" && d.publishDate <= date();
      }),
      events,
    });
  }),
);
app.get(
  "/api/setup",
  wrap(async (_req, res) =>
    res.json({ required: !production && (await db.user.count()) === 0 }),
  ),
);
app.post(
  "/api/setup",
  wrap(async (req, res) => {
    if (production)
      fail(403, "Use the server bootstrap command in production.");
    const data = z.object({ name: str, email, password }).parse(req.body);
    const user = await db.$transaction(async (tx) => {
      if (await tx.user.count()) fail(409, "Setup is already complete.");
      return tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: await bcrypt.hash(data.password, 12),
          role: "Super Admin",
        },
      });
    });
    res.status(201).json({ id: user.id });
  }),
);
app.post(
  "/api/admissions",
  rateLimit({ windowMs: 3600000, limit: 15 }),
  wrap(async (req, res) => {
    const data = z
      .object({
        childName: str,
        parentName: str,
        email,
        phone: z.string().regex(/^[+\d\s()-]{7,20}$/),
        className: str,
        message: z.string().max(3000).default(""),
      })
      .parse(req.body);
    const record = await db.admission.create({
      data: { ...data, reference: `OM-${id()}` },
    });
    res.status(201).json({ reference: record.reference });
  }),
);
app.post(
  "/api/admission-status",
  wrap(async (req, res) => {
    const d = z.object({ reference: str, email }).parse(req.body);
    const a = await db.admission.findFirst({ where: d });
    if (!a) fail(404, "No matching application found.");
    res.json({
      reference: a!.reference,
      status: a!.status,
      childName: a!.childName,
    });
  }),
);
app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 900000, limit: 30 }),
  wrap(async (req, res) => {
    const d = z
      .object({ email:email.optional(), identifier:z.string().trim().min(1).max(200).optional(), password: z.string().max(128), portal:z.enum(portalKinds).optional() })
      .refine(d=>!!(d.email||d.identifier),'Enter your school email or ID.')
      .parse(req.body);
    const identifier=(d.identifier||d.email!).trim();
    let u = await db.user.findUnique({ where: { email: identifier.toLowerCase() } });
    if(!u&&!identifier.includes('@')){
      const student=await db.student.findUnique({where:{admissionNo:identifier.toUpperCase()},include:{user:true}});
      const employee=student?null:await db.employee.findUnique({where:{employeeNo:identifier.toUpperCase()},include:{user:true}});
      u=student?.user||employee?.user||null;
    }
    if(u)req.account=u;
    const fallback =
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    const valid = await bcrypt.compare(d.password, u?.passwordHash || fallback);
    if (
      !u ||
      !valid ||
      !u.active ||
      (u.lockedUntil && u.lockedUntil > new Date())
    ) {
      if (u)
        await db.user.update({
          where: { id: u.id },
          data: {
            failedAttempts: { increment: 1 },
            ...(u.failedAttempts >= 4
              ? { lockedUntil: new Date(Date.now() + 900000) }
              : {}),
          },
        });
      fail(
        401,
        "Email or password is incorrect, or the account is temporarily locked.",
      );
    }
    if(u.role==='Parent')fail(403,'The parent portal has been removed. Please use the student account.');
    if(d.portal&&d.portal!==portalForRole(u.role))fail(403,`This account belongs to the ${portalForRole(u.role)} portal. Please choose that portal to sign in.`);
    await db.user.update({
      where: { id: u.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await db.session.create({
      data: {
        id: hash(token),
        userId: u.id,
        csrf,
        expiresAt: new Date(Date.now() + 8 * 3600000),
      },
    });
    res.cookie("om_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: 8 * 3600000,
      path: "/",
    });
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role, ...(await effectiveAccess(u)) },
      csrf,
    });
  }),
);
app.post('/api/auth/recovery',rateLimit({windowMs:900000,limit:8}),wrap(async(req,res)=>{
  const {identifier}=z.object({identifier:z.string().trim().min(1).max(200)}).parse(req.body);
  let user=await db.user.findUnique({where:{email:identifier.toLowerCase()}});
  if(!user&&!identifier.includes('@')){
    const student=await db.student.findUnique({where:{admissionNo:identifier.toUpperCase()},include:{user:true}});
    const employee=student?null:await db.employee.findUnique({where:{employeeNo:identifier.toUpperCase()},include:{user:true}});
    user=student?.user||employee?.user||null;
  }
  if(user?.active&&user.role!=='Parent'){req.account=user;const existing=await db.entry.findFirst({where:{module:'accessRequests',userId:user.id,status:'Pending',archived:false}});if(!existing)await db.entry.create({data:{module:'accessRequests',title:'Password reset request',userId:user.id,status:'Pending',data:{requestedAt:new Date().toISOString(),accountRole:user.role}}});}
  res.json({ok:true,message:'If a matching account exists, your school administrator can provide a secure reset link.'});
}));
app.post(
  "/api/auth/reset",
  rateLimit({ windowMs: 900000, limit: 10 }),
  wrap(async (req, res) => {
    const d = z.object({ token: str, password }).parse(req.body);
    await db.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: hash(d.token) },
      });
      if (!reset || reset.expiresAt < new Date())
        fail(400, "This activation link is invalid or expired.");
      req.account=await tx.user.findUnique({where:{id:reset!.userId}});
      await tx.passwordReset.delete({ where: { tokenHash: hash(d.token) } });
      await tx.user.update({
        where: { id: reset!.userId },
        data: {
          passwordHash: await bcrypt.hash(d.password, 12),
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.session.deleteMany({ where: { userId: reset!.userId } });
    });
    res.json({ ok: true });
  }),
);
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const token = req.cookies.om_session;
    const session = token
      ? await db.session.findUnique({
          where: { id: hash(token) },
          include: { user: true },
        })
      : null;
    if (!session || session.expiresAt < new Date() || !session.user.active)
      return res.status(401).json({ error: "Please sign in to continue." });
    if(session.user.role==='Parent')return res.status(403).json({error:'The parent portal has been removed. Use the student account.'});
    req.account = {...session.user,...await effectiveAccess(session.user)};
    req.sessionId = session.id;
    req.csrf = session.csrf;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== session.csrf
    )
      return res
        .status(403)
        .json({ error: "Session verification failed. Refresh and try again." });
    const module=moduleForPath(req.path);
    if(module){const level=req.account.permissions[module]||'none';const selfAction=(req.path.startsWith('/fees/')&&req.path.endsWith('/order'))||req.path==='/payments/verify'||req.path.startsWith('/workflow/submit')||req.path.startsWith('/workflow/')&&req.path.endsWith('/cancel');
      if(level==='none'||(!['GET','HEAD'].includes(req.method)&&level!=='manage'&&!selfAction))return res.status(403).json({error:'Your role does not have permission for this module or action.'});}
    next();
  })().catch(next);
});
const router = express.Router();
const studentScope = (req: Request): any =>
  req.account.role === "Student"
    ? { userId: req.account.id }
    : req.account.role === "Parent"
      ? { parentId: req.account.id }
      : {};
async function allowedStudents(req: Request) {
  if(req.account.permissions?.students==='none')return [];
  if (
    privileged(req.account) ||
    (req.account.role!=='Student'&&req.account.role!=='Teacher'&&req.account.role!=='Class Teacher'&&req.account.permissions?.students!=='none') ||
    ["Accountant", "Receptionist", "Librarian", "Transport Manager"].includes(
      req.account.role,
    )
  )
    return db.student.findMany({ where: { archived: false } });
  if (["Teacher", "Class Teacher"].includes(req.account.role)) {
    const e = await db.employee.findUnique({
      where: { userId: req.account.id },
    });
    const classes = await db.entry.findMany({
      where: { module: "academics", archived: false },
    });
    const scopes = classes
      .filter((c) => (c.data as any).teacherId === e?.id)
      .map((c) => ({ className: c.title, section: (c.data as any).section, session:(c.data as any).session }));
    const created=await db.auditLog.findMany({where:{actorId:req.account.id,action:'create',entity:'student'},select:{entityId:true}});
    return db.student.findMany({where:{archived:false,OR:[...scopes,{id:{in:created.map(r=>r.entityId)}}]}});
  }
  if (["Student", "Parent"].includes(req.account.role))
    return db.student.findMany({
      where: { archived: false, ...studentScope(req) },
    });
  return [];
}
async function requireStudent(req: Request, studentId: string) {
  if (!(await allowedStudents(req)).some((s) => s.id === studentId))
    fail(403, "Student is outside your authorised records.");
}
const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  permissions:u.permissions,accessRole:u.accessRole,accessRoleId:u.accessRoleId,
});
router.get(
  "/auth/me",
  wrap(async (req, res) =>
    res.json({ user: safeUser(req.account), csrf: req.csrf }),
  ),
);
router.post(
  "/auth/logout",
  wrap(async (req, res) => {
    await db.session.delete({ where: { id: req.sessionId! } });
    res.clearCookie("om_session", { path: "/" }).json({ ok: true });
  }),
);
router.post(
  "/auth/password",
  wrap(async (req, res) => {
    const d = z.object({ current: str, password }).parse(req.body);
    if (!(await bcrypt.compare(d.current, req.account.passwordHash)))
      fail(400, "Current password is incorrect.");
    await db.$transaction([
      db.user.update({
        where: { id: req.account.id },
        data: { passwordHash: await bcrypt.hash(d.password, 12) },
      }),
      db.session.deleteMany({
        where: { userId: req.account.id, id: { not: req.sessionId } },
      }),
    ]);
    res.json({ ok: true });
  }),
);
router.get(
  "/users",
  wrap(async (req, res) => {
    permit(req, admins);
    res.json(
      await Promise.all((await db.user.findMany({where:{role:{not:'Parent'}}, orderBy: { createdAt: "desc" } })).map(async u=>safeUser({...u,...await effectiveAccess(u)}))),
    );
  }),
);
router.post(
  "/users",
  wrap(async (req, res) => {
    permit(req, ["Super Admin"]);
    const d = z
      .object({
        name: str,
        email,
        role: z.enum(roles as [string, ...string[]]),
        password:z.string().min(8).max(128),
      })
      .parse(req.body);
    const { password: pass, ...rest } = d;
    const u = await db.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(pass, 12) },
    });
    await audit(req, "create", "user", u.id);
    res.status(201).json(safeUser(u));
  }),
);
router.patch(
  "/users/:id",
  wrap(async (req, res) => {
    permit(req, ["Super Admin"]);
    if (req.params.id === req.account.id)
      fail(400, "You cannot change your own access.");
    const d = z
      .object({
        role: z.enum(roles as [string, ...string[]]).optional(),
        active: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const u = await db.user.update({ where: { id: req.params.id }, data: d });
    await db.session.deleteMany({ where: { userId: u.id } });
    await audit(req, "access-change", "user", u.id);
    res.json(safeUser(u));
  }),
);
router.post('/users/:id/password',wrap(async(req,res)=>{
  permit(req,['Super Admin']);
  const {password:nextPassword}=z.object({password:z.string().min(8,'Use at least 8 characters.').max(128)}).strict().parse(req.body);
  const target=await db.user.findUnique({where:{id:req.params.id}});
  if(!target||!target.active||target.role==='Parent')fail(404,'Active school account not found.');
  if(target.id===req.account.id)fail(400,'Use your account settings to change your own password.');
  await db.$transaction(async tx=>{await tx.user.update({where:{id:target.id},data:{passwordHash:await bcrypt.hash(nextPassword,12),failedAttempts:0,lockedUntil:null}});await tx.session.deleteMany({where:{userId:target.id}});await tx.passwordReset.deleteMany({where:{userId:target.id}})});
  await audit(req,'set-password','user',target.id);res.json({ok:true,email:target.email,portal:portalForRole(target.role)});
}));
router.post(
  "/users/:id/invite",
  wrap(async (req, res) => {
    permit(req, ["Super Admin", "School Admin"]);
    const target = await db.user.findUnique({ where: { id: req.params.id } });
    if (
      !target || target.role==='Parent' ||
      (!["Student", "Parent", "Employee", "Teacher", "Class Teacher"].includes(
        target.role,
      ) &&
        req.account.role !== "Super Admin")
    )
      fail(403, "You cannot reset this account.");
    const token = randomBytes(32).toString("hex");
    await db.passwordReset.create({
      data: {
        tokenHash: hash(token),
        userId: req.params.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await audit(req, "issue-invitation", "user", req.params.id);
    res.json({ token, expiresIn: "24 hours" });
  }),
);
const studentSchema = z.object({
  name: str,
  email,
  dob: iso.refine((s) => s <= date(), "Date of birth cannot be in the future"),
  gender: z.enum(["Female", "Male", "Other"]),
  className: str,
  section: str,
  session: str,
  parentName: str,
  parentEmail: email,
  phone: z.string().min(7).max(20),
  address: str,
  details: z.record(z.string(), z.any()).default({}),
});
router.get(
  "/students",
  wrap(async (req, res) => {
    const rows = await allowedStudents(req);
    res.json(
      rows.map(({ details, ...s }) => ({
        ...s,
        details:
          privileged(req.account) ||
          ["Student", "Parent", "Receptionist"].includes(req.account.role)
            ? details
            : {},
      })),
    );
  }),
);
router.post(
  "/students",
  wrap(async (req, res) => {
    if(!studentCreateRoles.includes(req.account.role))fail(403,'Your role cannot add students.');
    const d = studentSchema.parse(req.body);
    if (d.email === d.parentEmail)
      fail(400, "Student and parent need different email addresses.");
    const activationTokens: any[] = [];
    const student = await db.$transaction(async (tx) => {
      async function account(email: string, name: string, role: string) {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          if (role !== "Parent" || existing.role !== "Parent")
            fail(409, "Email already belongs to another account.");
          return existing;
        }
        const u = await tx.user.create({
          data: {
            email,
            name,
            role,
            active:role!=='Parent',
            passwordHash: await bcrypt.hash(
              randomBytes(32).toString("hex"),
              12,
            ),
          },
        });
        if(role==='Parent')return u;
        const token = randomBytes(32).toString("hex");
        await tx.passwordReset.create({
          data: {
            tokenHash: hash(token),
            userId: u.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        activationTokens.push({ email, token });
        return u;
      }
      const parent = await account(d.parentEmail, d.parentName, "Parent"),
        user = await account(d.email, d.name, "Student");
      return tx.student.create({
        data: {
          ...d,
          admissionNo: `OM-${new Date().getFullYear()}-${id().slice(0, 8)}`,
          parentId: parent.id,
          userId: user.id,
        },
      });
    });
    await audit(req, "create", "student", student.id);
    res.status(201).json({ record: student, activationTokens });
  }),
);
router.put(
  "/students/:id",
  wrap(async (req, res) => {
    if(!studentEditRoles.includes(req.account.role))fail(403,'Your role cannot edit student records.');
    const d = studentSchema.parse(req.body);
    const previous = await db.student.findUnique({
      where: { id: req.params.id },
    });
    if (!previous) fail(404, "Student not found.");
    if (d.parentEmail !== previous!.parentEmail)
      fail(
        400,
        "Parent account relinking requires an administrator migration; parent email cannot be changed here.",
      );
    const s = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: previous!.userId },
        data: { name: d.name, email: d.email },
      });
      return tx.student.update({ where: { id: req.params.id }, data: d });
    });
    await audit(req, "update", "student", s.id);
    res.json(s);
  }),
);
router.delete(
  "/students/:id",
  wrap(async (req, res) => {
    if(!studentArchiveRoles.includes(req.account.role))fail(403,'Only Admin and Principal can remove students.');
    const s=await db.$transaction(async tx=>{
      const student=await tx.student.findUnique({where:{id:req.params.id}});
      if(!student)fail(404,'Student not found.');
      await tx.user.update({where:{id:student.userId},data:{active:false}});
      await tx.session.deleteMany({where:{userId:student.userId}});
      await tx.passwordReset.deleteMany({where:{userId:student.userId}});
      return tx.student.update({where:{id:student.id},data:{archived:true}});
    });
    await audit(req, "archive", "student", s.id);
    res.json({ ok: true });
  }),
);
const employeeSchema = z.object({
  name: str,
  email,
  phone: str,
  department: str,
  designation: str,
  joiningDate: iso,
  qualification: str,
  salary: money,
  details: z.record(z.string(), z.any()).default({}),
});
router.get(
  "/employees",
  wrap(async (req, res) => {
    const manage = privileged(req.account) || req.account.role === "HR Manager";
    const rows = await db.employee.findMany({
      where: { archived: false, ...(manage ? {} : { userId: req.account.id }) },
      include:{user:{select:{role:true}}},
    });
    res.json(rows.map(({user,...employee})=>({...employee,accountRole:user.role})));
  }),
);
router.get(
  "/directory",
  wrap(async (_req, res) =>
    res.json(
      await db.employee.findMany({
        where: { archived: false },
        select: { id: true, name: true, designation: true },
      }),
    ),
  ),
);
router.post(
  "/employees",
  wrap(async (req, res) => {
    permit(req, [...admins, "HR Manager"]);
    const d = employeeSchema.parse(req.body);
    const generateCredentials=z.boolean().optional().parse(req.body.generateCredentials)||false;
    const generatedPassword=randomBytes(18).toString("base64url");
    const token = randomBytes(32).toString("hex");
    let newAccount=false;
    const e = await db.$transaction(async (tx) => {
      const existing=await tx.user.findUnique({where:{email:d.email}});
      if(existing&&generateCredentials)fail(409,'This email already has a school login. Use a different employee email to generate new credentials. For a saved employee, open their profile to manage the linked login.');
      if(existing&&['Student','Parent'].includes(existing.role))fail(409,'This email belongs to a student or guardian account.');
      if(existing&&await tx.employee.findUnique({where:{userId:existing.id}}))fail(409,'This account already has an employee record.');
      if(existing&&req.account.role!=='Super Admin')fail(403,'Super Admin must link an existing login to an employee record.');
      newAccount=!existing;
      const user = existing||await tx.user.create({
        data: {
          name: d.name,
          email: d.email,
          role: ["Teacher", "Class Teacher"].includes(d.designation)
            ? d.designation
            : "Employee",
          passwordHash: await bcrypt.hash(generatedPassword, 12),
        },
      });
      if(newAccount&&!generateCredentials)await tx.passwordReset.create({
        data: {
          tokenHash: hash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return tx.employee.create({
        data: { ...d, userId: user.id, employeeNo: `EMP-${id().slice(0, 8)}` },
      });
    });
    await audit(req, "create", "employee", e.id);
    res.set('Cache-Control','no-store').status(201).json({record:e,activationTokens:newAccount&&!generateCredentials?[{email:e.email,token}]:[],...(newAccount&&generateCredentials?{credentials:{name:e.name,email:e.email,employeeNo:e.employeeNo,password:generatedPassword,portal:portalForRole(['Teacher','Class Teacher'].includes(e.designation)?e.designation:'Employee')}}:{})});
  }),
);
router.post('/employees/:id/login',wrap(async(req,res)=>{
  if(req.account.role!=='Super Admin')fail(403,'Only Super Admin can create a separate employee login.');
  const {email:loginEmail}=z.object({email}).strict().parse(req.body);
  const generatedPassword=randomBytes(18).toString('base64url');
  const employee=await db.$transaction(async tx=>{
    const existing=await tx.employee.findUnique({where:{id:req.params.id},include:{user:true}});
    if(!existing||existing.archived)fail(404,'Employee record not found.');
    if(!admins.includes(existing.user.role))fail(409,'This employee already has a separate school login. Use Generate login credentials to replace its password.');
    if(await tx.user.findUnique({where:{email:loginEmail}}))fail(409,'This email already has a school account. Enter a different email for the employee.');
    const role=['Teacher','Class Teacher'].includes(existing.designation)?existing.designation:'Employee';
    const account=await tx.user.create({data:{email:loginEmail,name:existing.name,role,passwordHash:await bcrypt.hash(generatedPassword,12)}});
    const record=await tx.employee.update({where:{id:existing.id},data:{email:loginEmail,userId:account.id}});
    return {...record,accountRole:role};
  });
  await audit(req,'create-employee-login','employee',employee.id);
  res.set('Cache-Control','no-store').json({record:employee,credentials:{name:employee.name,email:employee.email,employeeNo:employee.employeeNo,password:generatedPassword,portal:portalForRole(employee.accountRole)}});
}));
router.post('/employees/:id/credentials',wrap(async(req,res)=>{
  if(req.account.role!=='Super Admin')fail(403,'Only Super Admin can generate employee credentials.');
  const employee=await db.employee.findUnique({where:{id:req.params.id},include:{user:true}});
  if(!employee||employee.archived||!employee.user.active)fail(404,'Active employee account not found.');
  if(employee.userId===req.account.id)fail(400,'Use account settings to change your own password.');
  const generatedPassword=randomBytes(18).toString('base64url');
  await db.$transaction(async tx=>{
    await tx.user.update({where:{id:employee.userId},data:{passwordHash:await bcrypt.hash(generatedPassword,12),failedAttempts:0,lockedUntil:null}});
    await tx.session.deleteMany({where:{userId:employee.userId}});
    await tx.passwordReset.deleteMany({where:{userId:employee.userId}});
  });
  await audit(req,'set-password','user',employee.userId);
  res.set('Cache-Control','no-store').json({credentials:{name:employee.name,email:employee.user.email,employeeNo:employee.employeeNo,password:generatedPassword,portal:portalForRole(employee.user.role)}});
}));
router.put(
  "/employees/:id",
  wrap(async (req, res) => {
    permit(req, [...admins, "HR Manager"]);
    const d = employeeSchema.parse(req.body);
    const e = await db.$transaction(async (tx) => {
      const e = await tx.employee.update({
        where: { id: req.params.id },
        data: d,
      });
      await tx.user.update({
        where: { id: e.userId },
        data: { name: e.name, email: e.email },
      });
      return e;
    });
    await audit(req, "update", "employee", e.id);
    res.json(e);
  }),
);
router.delete(
  "/employees/:id",
  wrap(async (req, res) => {
    permit(req, [...admins, "HR Manager"]);
    const e = await db.employee.update({
      where: { id: req.params.id },
      data: { archived: true },
    });
    await db.user.update({ where: { id: e.userId }, data: { active: false } });
    await audit(req, "archive", "employee", e.id);
    res.json({ ok: true });
  }),
);
router.get(
  "/attendance",
  wrap(async (req, res) => {
    const ids = (await allowedStudents(req)).map((s) => s.id);
    const e = await db.employee.findUnique({
      where: { userId: req.account.id },
    });
    res.json(
      await db.attendance.findMany({
        where: {
          ...(privileged(req.account) || req.account.role === "HR Manager"
            ? {}
            : {
                OR: [
                  { studentId: { in: ids } },
                  ...(e ? [{ employeeId: e.id }] : []),
                ],
              }),
          ...(req.query.date ? { date: String(req.query.date) } : {}),
        },
        orderBy: { date: "desc" },
      }),
    );
  }),
);
router.post(
  "/attendance",
  wrap(async (req, res) => {
    permit(req, [...admins, "Teacher", "Class Teacher", "HR Manager"]);
    const d = z
      .object({
        date: iso,
        period: str.default("Daily"),
        records: z
          .array(
            z.object({
              studentId: z.string().optional(),
              employeeId: z.string().optional(),
              status: z.enum([
                "Present",
                "Absent",
                "Late",
                "Half Day",
                "Leave",
              ]),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(req.body);
    if (d.date > date())
      fail(400, "Attendance cannot be marked in the future.");
    for (const r of d.records) {
      if (!!r.studentId === !!r.employeeId)
        fail(400, "Choose one person type.");
      if (r.studentId) await requireStudent(req, r.studentId);
      if (r.employeeId) permit(req, [...admins, "HR Manager"]);
    }
    await db.$transaction(
      d.records.map((r) => {
        const personKey = r.studentId || r.employeeId!;
        return db.attendance.upsert({
          where: {
            personKey_date_period: {
              personKey,
              date: d.date,
              period: d.period,
            },
          },
          create: {
            ...r,
            personKey,
            date: d.date,
            period: d.period,
            markedBy: req.account.id,
          },
          update: { status: r.status, markedBy: req.account.id },
        });
      }),
    );
    await audit(req, "mark", "attendance", d.date);
    res.json({ ok: true });
  }),
);
router.post(
  "/attendance/check",
  wrap(async (req, res) => {
    const { action } = z
      .object({ action: z.enum(["in", "out"]) })
      .parse(req.body);
    const employee = await db.employee.findUnique({
      where: { userId: req.account.id },
    });
    if (!employee) fail(403, "An employee profile is required.");
    const key = { personKey: employee!.id, date: date(), period: "Daily" };
    const prior = await db.attendance.findUnique({
      where: { personKey_date_period: key },
    });
    if (action === "in") {
      if (prior?.checkIn) fail(409, "Already checked in today.");
      await db.attendance.upsert({
        where: { personKey_date_period: key },
        create: {
          ...key,
          employeeId: employee!.id,
          checkIn: new Date(),
          status: "Present",
          markedBy: req.account.id,
        },
        update: { checkIn: new Date(), status: "Present" },
      });
    } else {
      if (!prior?.checkIn || prior.checkOut)
        fail(400, "Check in first, or checkout is already recorded.");
      await db.attendance.update({
        where: { id: prior.id },
        data: { checkOut: new Date() },
      });
    }
    res.json({ ok: true });
  }),
);
router.get(
  "/fees",
  wrap(async (req, res) => {
    permit(req, [...admins, "Accountant", "Parent", "Student"]);
    const ids = (await allowedStudents(req)).map((s) => s.id);
    res.json(
      await db.invoice.findMany({
        where: { studentId: { in: ids } },
        include: {
          student: { select: { name: true } },
          payments: { include: { refunds: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
  }),
);
router.post(
  "/fees",
  wrap(async (req, res) => {
    permit(req, [...admins, "Accountant"]);
    const d = z
      .object({
        studentId: str,
        title: str,
        amount: money.refine((n) => n > 0),
        dueDate: iso,
        session: str,
      })
      .parse(req.body);
    await requireStudent(req, d.studentId);
    const r = await db.invoice.create({
      data: { ...d, number: `INV-${id()}` },
    });
    await audit(req, "create", "invoice", r.id);
    res.status(201).json(r);
  }),
);
router.post('/fees/:id/payment', wrap(async (req,res)=>{
  permit(req,[...admins,'Accountant']);
  fail(409,'Record a payment collection and submit it for verification before issuing a receipt.');
}));
router.get(
  "/exams",
  wrap(async (req, res) => {
    const students = await allowedStudents(req);
    const teaching =
      privileged(req.account) ||
      ["Teacher", "Class Teacher"].includes(req.account.role);
    res.json(
      await db.exam.findMany({
        where: {
          ...(privileged(req.account)
            ? {}
            : { className: { in: students.map((s) => s.className) } }),
          ...(!teaching ? { published: true } : {}),
        },
        include: {
          marks: { where: { studentId: { in: students.map((s) => s.id) } } },
        },
      }),
    );
  }),
);
router.post(
  "/exams",
  wrap(async (req, res) => {
    permit(req, [...admins, "Teacher", "Class Teacher"]);
    const d = z
      .object({
        name: str,
        className: str,
        subject: str,
        date: iso,
        maxMarks: z.coerce.number().int().min(1).max(1000),
        passMarks: z.coerce.number().int().min(0),
        session: str,
      })
      .parse(req.body);
    if (d.passMarks > d.maxMarks)
      fail(400, "Passing marks exceed maximum marks.");
    if (
      !privileged(req.account) &&
      !(await allowedStudents(req)).some((s) => s.className === d.className)
    )
      fail(403, "This class is not assigned to you.");
    const e = await db.exam.create({ data: d });
    await audit(req, "create", "exam", e.id);
    res.status(201).json(e);
  }),
);
router.post(
  "/exams/:id/marks",
  wrap(async (req, res) => {
    permit(req, [...admins, "Teacher", "Class Teacher"]);
    const d = z
      .object({
        studentId: str,
        score: z.coerce.number().min(0),
        remarks: z.string().max(2000).default(""),
      })
      .parse(req.body);
    await requireStudent(req, d.studentId);
    const e = await db.exam.findUnique({ where: { id: req.params.id } }),
      s = await db.student.findUnique({ where: { id: d.studentId } });
    if (!e || e.className !== s?.className || e.session !== s?.session || d.score > e.maxMarks)
      fail(400, "Check the class and marks range.");
    if(e!.published)fail(409,'Published examination marks are locked.');
    const pending=await db.entry.findMany({where:{module:'approvals',status:'Pending'}});
    if(pending.some(r=>(r.data as any).type==='exam'&&(r.data as any).entityId===e!.id))fail(409,'Cancel the pending approval before editing marks.');
    const m = await db.mark.upsert({
      where: { examId_studentId: { examId: e!.id, studentId: d.studentId } },
      create: { ...d, examId: e!.id },
      update: d,
    });
    await audit(req, "marks", "exam", e!.id);
    res.json(m);
  }),
);
router.patch('/exams/:id',wrap(async(req,res)=>{permit(req,admins);fail(409,'Submit the examination through the approval workflow to publish results.');}));
router.get(
  "/payroll",
  wrap(async (req, res) => {
    const manage =
      privileged(req.account) ||
      ["HR Manager", "Accountant"].includes(req.account.role);
    res.json(
      await db.payroll.findMany({
        where: manage
          ? {}
          : { employee: { userId: req.account.id }, status: "Approved" },
        include: { employee: { select: { name: true } } },
      }),
    );
  }),
);
router.post(
  "/payroll",
  wrap(async (req, res) => {
    permit(req, [...admins, "HR Manager"]);
    const d = z
      .object({
        employeeId: str,
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        allowances: money,
        deductions: money,
      })
      .parse(req.body);
    const e = await db.employee.findUnique({ where: { id: d.employeeId } });
    if (!e || e.archived) fail(400, "Select an active employee.");
    const net = e!.salary + d.allowances - d.deductions;
    if (net < 0) fail(400, "Deductions exceed earnings.");
    const p = await db.payroll.create({
      data: { ...d, basic: e!.salary, net },
    });
    await audit(req, "generate", "payroll", p.id);
    res.status(201).json(p);
  }),
);
router.patch('/payroll/:id',wrap(async(req,res)=>{permit(req,[...admins,'Accountant']);fail(409,'Submit payroll through the approval workflow.');}));
async function scopedEntries(req: Request, module: string) {
  if(req.account.permissions?.[module]==='none')return [];
  const config = modules[module];
  if (!config) fail(404, "Module not found.");
  let rows = await db.entry.findMany({
    where: { module, archived: false },
    orderBy: { createdAt: "desc" },
  });
  if (module === "library") {
    const loans = await db.entry.findMany({
      where: { module: "loans", archived: false, status: "Active" },
    });
    rows = rows.map((r) => ({
      ...r,
      data: {
        ...(r.data as any),
        available:
          Number((r.data as any).quantity) -
          loans.filter((l) => l.title === r.id).length,
      },
    }));
  }
  const personal = ["leave", "submissions"];
  if (privileged(req.account)||isDelegated(req.account,module)||hasDelegatedRead(req.account,module)) return rows;
  if(['progress','studentAssessments'].includes(module)){const ids=(await allowedStudents(req)).map(s=>s.id);return rows.filter(r=>ids.includes(r.studentId||'')&&(req.account.role!=='Student'||r.status==='Approved'||module==='progress'));}
  if(['employeeAssessments','appraisals'].includes(module)){if(req.account.role==='HR Manager')return rows;const employee=await db.employee.findUnique({where:{userId:req.account.id}});return rows.filter(r=>(r.data as any).employeeId===employee?.id&&r.status==='Approved');}
  if(module==='workReports')return req.account.role==='HR Manager'?rows:rows.filter(r=>r.userId===req.account.id);
  if (module === "leave")
    return rows.filter((r) => r.userId === req.account.id);
  if (
    config.roles.includes(req.account.role) &&
    !["Student", "Parent"].includes(req.account.role) &&
    !["Teacher", "Class Teacher"].includes(req.account.role)
  )
    return rows;
  const students = await allowedStudents(req),
    ids = students.map((s) => s.id),
    classes = students.map((s) => `${s.className}/${s.section}`);
  if (
    ["Teacher", "Class Teacher"].includes(req.account.role) &&
    ["academics", "homework", "timetable", "submissions"].includes(module)
  )
    {const employee=await db.employee.findUnique({where:{userId:req.account.id}});return rows.filter(
      (r) =>
        (!!employee&&(r.data as any).teacherId===employee.id) || r.userId === req.account.id ||
        ids.includes(r.studentId || "") ||
        classes.includes(
          `${(r.data as any).className || r.title}/${(r.data as any).section}`,
        ),
    );}
  if (module === "submissions")
    return rows.filter(
      (r) => r.userId === req.account.id || ids.includes(r.studentId || ""),
    );
  if (["homework", "timetable", "academics"].includes(module))
    return rows.filter((r) =>
      classes.includes(
        `${(r.data as any).className || r.title}/${(r.data as any).section}`,
      ),
    );
  if (["loans", "transport"].includes(module))
    return rows.filter((r) => ids.includes(r.studentId || ""));
  if (module === "notices")
    return rows.filter((r) => {
      const d = r.data as any;
      return (
        d.publishDate <= date() &&
        [
          "Everyone",
          req.account.role === "Student"
            ? "Students"
            : req.account.role === "Parent"
              ? "Parents"
              : "Employees",
        ].includes(d.audience)
      );
    });
  if (["events", "library"].includes(module)) return rows;
  return [];
}
router.get(
  "/records/:module",
  wrap(async (req, res) => {
    if (req.params.module === "admissions") {
      permit(req, modules.admissions.roles);
      return res.json(
        await db.admission.findMany({ orderBy: { createdAt: "desc" } }),
      );
    }
    const records = await scopedEntries(req, req.params.module);
    const authors = await db.user.findMany({where:{id:{in:records.map(r=>r.userId).filter((id):id is string=>!!id)}},select:{id:true,name:true}});
    const linkedModule:Record<string,string>={loans:'library',transport:'routes',submissions:'homework',routes:'vehicles'};
    const target = linkedModule[req.params.module];
    const related = target ? await db.entry.findMany({where:{module:target,id:{in:records.map(r=>req.params.module==='routes'?(r.data as any).vehicleId:r.title)}}}) : [];
    const vehicles = req.params.module==='transport' ? await db.entry.findMany({where:{module:'vehicles',id:{in:related.map(r=>(r.data as any).vehicleId)}}}) : [];
    res.json(records.map(r=>{
      const relation=related.find(v=>v.id===(req.params.module==='routes'?(r.data as any).vehicleId:r.title));
      const vehicle=vehicles.find(v=>v.id===(relation?.data as any)?.vehicleId);
      return {...r,createdBy:authors.find(a=>a.id===r.userId)?.name,relatedTitle:relation?.title,...(vehicle?{vehicleRegistration:vehicle.title,driverName:(vehicle.data as any).driver,driverPhone:(vehicle.data as any).phone}:{})};
    }));
  }),
);
async function saveEntry(req: Request, res: Response) {
  const module = req.params.module,
    config = modules[module];
  if (!config || module === "admissions") fail(404, "Module not found.");
  permit(req, config.roles);
  if(['studentAssessments','employeeAssessments','appraisals'].includes(module)&&Number(req.body.score)>100)fail(400,'Assessment score cannot exceed 100.');
  if(module === "accessRequests") fail(403,"Recovery requests are created from the sign-in page.");
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of config.fields) {
    let field: z.ZodTypeAny =
      f.type === "number"
        ? z.coerce.number().finite().min(0).max(10000000)
        : f.type === "date"
          ? iso
          : f.type === "select"
            ? z.enum(f.options as [string, ...string[]])
            : f.type === "time"
              ? z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
              : z
                  .string()
                  .trim()
                  .min(f.required ? 1 : 0)
                  .max(10000);
    if (
      f.type === "number" &&
      ["quantity", "capacity", "minimum"].includes(f.key)
    )
      field = z.coerce
        .number()
        .int()
        .min(f.key === "capacity" ? 1 : 0)
        .max(10000000);
    if (!f.required) field = field.optional();
    shape[f.key] = field;
  }
  const d: Record<string, any> = z.object(shape).strict().parse(req.body);
  const prior = req.params.id
    ? await db.entry.findUnique({ where: { id: req.params.id } })
    : null;
  if (req.params.id && (!prior || prior.module !== module))
    fail(404, "Record not found.");
  if (
    prior &&
    !privileged(req.account) &&
    prior.userId !== req.account.id &&
    ["leave", "submissions", "homework"].includes(module)
  )
    fail(403, "You can only edit your own record.");
  if (
    prior &&
    ["leave", "submissions", "loans", "transport"].includes(module) &&
    prior.status !== "Pending" &&
    prior.status !== "Active"
  )
    fail(400, "This record is finalised.");
  if (d.studentId) await requireStudent(req, d.studentId);
  if(d.employeeId&&!(await db.employee.findFirst({where:{id:d.employeeId,archived:false}})))fail(400,'Choose an active employee.');
  if(module==='recruitment'){z.string().email().parse(d.email);if(prior&&(prior.data as any).employeeId)fail(409,'An onboarded candidate cannot be edited.');}
  if(prior&&['studentAssessments','employeeAssessments','appraisals','schoolReports','workReports','leave'].includes(module)){if(prior.status==='Approved')fail(409,'Approved records are locked.');const pending=await db.entry.findMany({where:{module:'approvals',status:'Pending'}});if(pending.some(r=>(r.data as any).entityId===prior.id))fail(409,'Cancel the pending approval before editing.');}
  if(prior&&module==='workReports'&&!privileged(req.account)&&prior.userId!==req.account.id)fail(403,'Edit your own work report.');
  if (d.start && d.end && d.end < d.start)
    fail(400, "End must be after start.");
  if (module === "timetable" && d.start === d.end)
    fail(400, "A period needs a positive duration.");
  if (
    ["Teacher", "Class Teacher"].includes(req.account.role) &&
    ["timetable", "homework"].includes(module) &&
    !(await allowedStudents(req)).some(
      (s) => s.className === d.className && s.section === d.section,
    )
  )
    fail(403, "Class is not assigned to you.");
  const row = await db.$transaction(
    async (tx) => {
      if (module === "timetable") {
        const existing = await tx.entry.findMany({
          where: { module, archived: false, id: { not: prior?.id || "" } },
        });
        if (
          existing.some((r) => {
            const v = r.data as any;
            return (
              v.day === d.day &&
              v.start < d.end &&
              v.end > d.start &&
              (v.teacherId === d.teacherId ||
                v.room === d.room ||
                (v.className === d.className && v.section === d.section))
            );
          })
        )
          fail(
            409,
            "Teacher, classroom or class is already booked for this period.",
          );
      }
      if (module === "library" && prior) {
        const active = await tx.entry.count({
          where: {
            module: "loans",
            title: prior.id,
            archived: false,
            status: "Active",
          },
        });
        if (d.quantity < active)
          fail(
            409,
            "Quantity cannot be lower than the number of issued copies.",
          );
      }
      if (module === "loans") {
        const book = await tx.entry.findFirst({
          where: { id: d.title, module: "library", archived: false },
        });
        if (!book) fail(400, "Enter a valid book record ID.");
        const count = await tx.entry.count({
          where: {
            module: "loans",
            title: d.title,
            archived: false,
            status: "Active",
            id: { not: prior?.id || "" },
          },
        });
        if (count >= Number((book!.data as any).quantity))
          fail(409, "No copies available.");
      }
      if (module === "transport") {
        const route = await tx.entry.findFirst({
          where: { id: d.title, module: "routes", archived: false },
        });
        if (!route) fail(400, "Route not found.");
        const vehicle = await tx.entry.findFirst({
          where: {
            id: (route!.data as any).vehicleId,
            module: "vehicles",
            archived: false,
          },
        });
        if (!vehicle) fail(400, "Route requires a valid vehicle.");
        const all = await tx.entry.findMany({
          where: { module: "routes", archived: false },
        });
        const routes = all
          .filter((r) => (r.data as any).vehicleId === vehicle!.id)
          .map((r) => r.id);
        const count = await tx.entry.count({
          where: {
            module: "transport",
            archived: false,
            title: { in: routes },
            id: { not: prior?.id || "" },
          },
        });
        if (count >= Number((vehicle!.data as any).capacity))
          fail(409, "Vehicle is at capacity.");
        if (
          await tx.entry.findFirst({
            where: {
              module,
              studentId: d.studentId,
              archived: false,
              id: { not: prior?.id || "" },
            },
          })
        )
          fail(409, "Student already has a transport assignment.");
      }
      if (
        module === "routes" &&
        !(await tx.entry.findFirst({
          where: { id: d.vehicleId, module: "vehicles", archived: false },
        }))
      )
        fail(400, "Vehicle record does not exist.");
      if (
        ["academics", "timetable"].includes(module) &&
        !(await tx.employee.findFirst({
          where: { id: d.teacherId, archived: false },
        }))
      )
        fail(400, "Choose an active teacher.");
      let studentId = d.studentId || null;
      if (module === "submissions") {
        const hw = await tx.entry.findFirst({
          where: { id: d.title, module: "homework", archived: false },
        });
        const student = await tx.student.findFirst({
          where: { userId: req.account.id, archived: false },
        });
        if (
          !student ||
          !hw ||
          (hw.data as any).className !== student.className ||
          (hw.data as any).section !== student.section
        )
          fail(403, "Assignment is not assigned to you.");
        if ((hw!.data as any).dueDate < date())
          fail(400, "The submission deadline has passed.");
        if (
          d.documentId &&
          !(await tx.document.findFirst({
            where: { id: d.documentId, userId: req.account.id },
          }))
        )
          fail(400, "Document is not owned by you.");
        studentId = student!.id;
      }
      const data = { title: d.title, data: d, studentId, ...(prior?.status==='Rejected'&&['studentAssessments','employeeAssessments','appraisals','schoolReports','workReports'].includes(module)?{status:'Draft'}:{}) };
      return prior
        ? tx.entry.update({ where: { id: prior.id }, data })
        : tx.entry.create({
            data: {
              ...data,
              module,
              userId: req.account.id,
              status: module === "leave" ? "Pending" : ['studentAssessments','employeeAssessments','appraisals','schoolReports','workReports'].includes(module)?'Draft':'Active',
            },
          });
    },
    { isolationLevel: "Serializable" },
  );
  await audit(req, prior ? "update" : "create", module, row.id);
  res.status(prior ? 200 : 201).json(row);
}
router.post("/records/:module", wrap(saveEntry));
router.put("/records/:module/:id", wrap(saveEntry));
router.patch(
  "/records/:module/:id",
  wrap(async (req, res) => {
    const { module, id } = req.params;
    const d = z.object({ status: str }).parse(req.body);
    if (module === "admissions") {
      permit(req, modules.admissions.roles);
      if (
        !["New", "Contacted", "Under review", "Accepted", "Declined"].includes(
          d.status,
        )
      )
        fail(400, "Invalid status.");
      await db.admission.update({ where: { id }, data: d });
    } else {
      const r = await db.entry.findFirst({
        where: { id, module, archived: false },
      });
      if (!r) fail(404, "Record not found.");
      if (module === "leave") {
        permit(req, admins);
        fail(409,'Submit leave through the approval workflow.');
      } else if (module === "loans") {
        permit(req, [...admins, "Librarian"]);
        if (d.status !== "Returned" || r!.status !== "Active")
          fail(400, "Invalid return.");
      } else fail(400, "Status transition not supported.");
      let extra: any = {};
      if (module === "loans") {
        const book = await db.entry.findUnique({ where: { id: r!.title } });
        const lateDays = Math.max(
          0,
          Math.floor(
            (Date.parse(date()) - Date.parse((r!.data as any).dueDate)) /
              86400000,
          ),
        );
        extra = {
          data: {
            ...(r!.data as any),
            returnedDate: date(),
            fine: Math.round(
              lateDays * Number((book?.data as any)?.dailyFine || 0) * 100,
            ),
          },
        };
      }
      await db.entry.update({ where: { id }, data: { ...d, ...extra } });
    }
    await audit(req, "status-change", module, id);
    res.json({ ok: true });
  }),
);
router.delete(
  "/records/:module/:id",
  wrap(async (req, res) => {
    const { module, id } = req.params;
    const config = modules[module];
    if (!config) fail(404, "Module not found.");
    permit(req, config.roles);
    const r = await db.entry.findFirst({
      where: { id, module, archived: false },
    });
    if (!r) fail(404, "Record not found.");
    if (
      !privileged(req.account) &&
      ["leave", "submissions", "homework"].includes(module) &&
      r!.userId !== req.account.id
    )
      fail(403, "Not your record.");
    if (["library", "vehicles", "routes"].includes(module)) {
      const dependencies = await db.entry.findMany({
        where: {
          archived: false,
          module: { in: ["loans", "routes", "transport"] },
        },
      });
      if (
        dependencies.some(
          (e) =>
            (e.title === id && e.status !== "Returned") ||
            (e.data as any).vehicleId === id,
        )
      )
        fail(409, "Remove active assignments before archiving this record.");
    }
    await db.entry.update({ where: { id }, data: { archived: true } });
    await audit(req, "archive", module, id);
    res.json({ ok: true });
  }),
);
router.get(
  "/cms",
  wrap(async (req, res) => {
    permit(req, admins);
    const saved = await db.websitePage.findMany();
    res.json(
      Object.entries({
        ...publicPages,
        ...Object.fromEntries(saved.map((p) => [p.id, p])),
      }).map(([id, p]) => ({ id, ...p })),
    );
  }),
);
router.put(
  "/cms/:id",
  wrap(async (req, res) => {
    permit(req, admins);
    const d = z
      .object({ title: str, body: z.string().max(20000) })
      .parse(req.body);
    const r = await db.websitePage.upsert({
      where: { id: req.params.id },
      create: { id: req.params.id, ...d },
      update: d,
    });
    await audit(req, "publish", "page", r.id);
    res.json(r);
  }),
);
router.get(
  "/audit",
  wrap(async (req, res) => {
    permit(req, ["Super Admin"]);
    res.json(
      await db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    );
  }),
);
router.get(
  "/dashboard",
  wrap(async (req, res) => {
    const students = await allowedStudents(req),
      ids = students.map((s) => s.id);
    const invoices = await db.invoice.findMany({
      where: { studentId: { in: ids } },
      include: { payments: { include: { refunds: true } } },
    });
    const attendance = await db.attendance.findMany({
      where: { date: date(), studentId: { in: ids } },
    });
    const total = invoices.reduce((s, i) => s + i.amount, 0),
      collected = invoices.reduce(
        (s, i) =>
          s +
          i.payments.reduce(
            (t, p) =>
              t + p.amount - p.refunds.reduce((a, r) => a + r.amount, 0),
            0,
          ),
        0,
      );
    const staff = req.account.permissions.employees!=="none" && (privileged(req.account) || req.account.role === "HR Manager");
    const financial = req.account.permissions.fees!=='none' && (privileged(req.account) || ["Accountant", "Student"].includes(req.account.role));
    res.json({
      students: students.length,
      employees: staff
        ? await db.employee.count({ where: { archived: false } })
        : null,
      total: financial ? total : 0,
      collected: financial ? collected : 0,
      pending: financial ? total - collected : 0,
      present: attendance.filter(
        (a) => a.status === "Present" || a.status === "Late",
      ).length,
      marked: attendance.length,
      admissions: privileged(req.account)
        ? await db.admission.count({ where: { status: "New" } })
        : null,
      notices: await scopedEntries(req, "notices"),
      events: await scopedEntries(req, "events"),
      children: ["Parent", "Student"].includes(req.account.role)
        ? students
        : [],
      monthly: (financial ? invoices : [])
        .flatMap((i) => i.payments)
        .reduce((a: any, p) => {
          const m = p.createdAt.toISOString().slice(0, 7);
          a[m] = (a[m] || 0) + p.amount / 100;
          return a;
        }, {}),
    });
  }),
);
registerExtensions(router, {
  wrap,
  permit,
  fail,
  audit,
  requireStudent,
  allowedStudents,
  scopedEntries,
});
registerWorkflowRoutes(router,{wrap,permit,fail,audit,allowedStudents,scopedEntries});
registerNotificationRoutes(router,{wrap,fail});
registerAccessRoutes(router,{wrap,permit,fail,audit});
registerActivityRoutes(router,{wrap,permit,fail});
registerMemberRoutes(router,{wrap,permit,fail,audit,allowedStudents,scopedEntries});
const uploadDir = process.env.VERCEL ? path.join("/tmp", "uploads") : path.resolve("uploads");
mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype),
    ),
});
router.post(
  "/documents",
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) fail(400, "Upload a PDF, PNG or JPEG up to 5 MB.");
    const file = req.file!;
    const bytes = readFileSync(file.path);
    const valid =
      (file.mimetype === "application/pdf" &&
        bytes.subarray(0, 5).toString() === "%PDF-") ||
      (file.mimetype === "image/jpeg" &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255) ||
      (file.mimetype === "image/png" &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    if (!valid) {
      unlinkSync(file.path);
      fail(400, "File content does not match its type.");
    }
    const record = await db.document.create({
      data: {
        name: path.basename(file.originalname),
        mime: file.mimetype,
        path: file.path,
        size: file.size,
        userId: req.account.id,
      },
    });
    res.status(201).json({ id: record.id, name: record.name });
  }),
);
router.get(
  "/documents",
  wrap(async (req, res) =>
    res.json(
      await db.document.findMany({
        where: privileged(req.account) ? {} : req.account.role==='HR Manager'?{user:{employees:{some:{archived:false}}}}:{ userId: req.account.id },
        select: { id: true, name: true, size: true, createdAt: true },
      }),
    ),
  ),
);
router.get(
  "/documents/:id",
  wrap(async (req, res) => {
    const d = await db.document.findUnique({ where: { id: req.params.id } });
    if (!d) fail(404, "Document not found.");
    if (!privileged(req.account) && d!.userId !== req.account.id) {
      const staffDocument=req.account.role==='HR Manager'&&await db.employee.findFirst({where:{userId:d!.userId,archived:false}});
      const submissions = await scopedEntries(req, 'submissions');
      if (!staffDocument&&!submissions.some(s=>(s.data as any).documentId===d!.id)) fail(404, "Document not found.");
    }
    res.type(d!.mime).download(path.resolve(d!.path), d!.name);
  }),
);
router.get(
  "/reports/:kind/:id",
  wrap(async (req, res) => {
    const { kind, id } = req.params;
    let title = "",
      lines: string[] = [];
    if (kind === "receipt") {
      permit(req, [...admins, "Accountant", "Parent", "Student"]);
      const p = await db.payment.findUnique({
        where: { id },
        include: { invoice: { include: { student: true } } },
      });
      if (!p) fail(404, "Receipt not found.");
      await requireStudent(req, p!.invoice.studentId);
      title = "Fee receipt";
      lines = [
        p!.receipt,
        `Student: ${p!.invoice.student.name}`,
        `Invoice: ${p!.invoice.number}`,
        p!.invoice.title,
        `Amount: INR ${(p!.amount / 100).toFixed(2)}`,
        `Method: ${p!.method}`,
        `Date: ${p!.createdAt.toISOString().slice(0, 10)}`,
      ];
    } else if (
      kind === "student" ||
      kind === "reportcard" ||
      kind === "idcard"
    ) {
      await requireStudent(req, id);
      const s = await db.student.findUnique({ where: { id } });
      title =
        kind === "reportcard"
          ? "Academic report"
          : kind === "idcard"
            ? "Student ID card"
            : "Student profile";
      lines = [
        s!.name,
        s!.admissionNo,
        `Class ${s!.className} / ${s!.section}`,
        `Session ${s!.session}`,
      ];
      if (kind === "reportcard") {
        const grading = await db.configuration.findUnique({
          where: { id: "grading" },
        });
        const bands = grading
          ? (grading.data as typeof defaultGrades)
          : defaultGrades;
        const marks = await db.mark.findMany({
          where: { studentId: id, exam: { published: true } },
          include: { exam: true },
        });
        if (!marks.length) fail(404, "No published results yet.");
        for (const m of marks) {
          const pct = (m.score / m.exam.maxMarks) * 100;
          lines.push(
            `${m.exam.name} - ${m.exam.subject}: ${m.score}/${m.exam.maxMarks} (${pct.toFixed(1)}%) ${gradeFor(pct, bands)}`,
          );
        }
      }
    } else if (kind === "payslip") {
      const p = await db.payroll.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (
        !p ||
        (!privileged(req.account) &&
          !["HR Manager", "Accountant"].includes(req.account.role) &&
          (p.employee.userId !== req.account.id || p.status !== "Approved"))
      )
        fail(404, "Payslip not found.");
      title = "Salary statement";
      lines = [
        p!.employee.name,
        p!.month,
        `Basic: INR ${p!.basic / 100}`,
        `Allowances: INR ${p!.allowances / 100}`,
        `Deductions: INR ${p!.deductions / 100}`,
        `Net: INR ${p!.net / 100}`,
        `Status: ${p!.status}`,
      ];
    } else fail(404, "Report type not found.");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${kind}-${id}.pdf"`,
    );
    const doc = new PDFDocument({ margin: 60 });
    doc.pipe(res);
    doc.fontSize(12).fillColor("#53614d").text((await schoolSettings()).name.toUpperCase());
    doc.moveDown(2).fontSize(28).fillColor("#26342a").text(title);
    doc.moveDown().fontSize(12);
    for (const line of lines) doc.text(line).moveDown(0.8);
    doc
      .moveDown(3)
      .fontSize(9)
      .fillColor("#777777")
      .text(
        "Generated from school records. Contact the administration for corrections.",
      );
    doc.end();
  }),
);
app.use("/api", router);
app.use((req, res, next) => {
  if (req.url.startsWith("/api")) return next();
  router(req, res, next);
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use(express.static(path.resolve("dist")));
app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  const status =
    err instanceof z.ZodError
      ? 400
      : err.status ||
        (err.code === "P2002"
          ? 409
          : err.code === "P2025"
            ? 404
            : err.code === "P2034"
              ? 409
              : err.code === "LIMIT_FILE_SIZE"
                ? 400
                : 500);
  if (status === 500) console.error("Request failed", err.code || err.name);
  res
    .status(status)
    .json({
      error:
        err instanceof z.ZodError
          ? err.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : err instanceof HttpError
            ? err.message
            : err.code === "P2002"
              ? "A record with these details already exists."
              : err.code === "P2034"
                ? "Concurrent change detected. Please retry."
                : err.code === "LIMIT_FILE_SIZE"
                  ? "File exceeds 5 MB."
                  : status === 404
                    ? "Record not found."
                    : err.message && (err.message.includes("DATABASE_URL") || err.message.includes("Can't reach database") || err.code === "P1001" || err.code === "P1000")
                      ? "Database connection not configured or unreachable. Please set DATABASE_URL in environment variables."
                      : "The request could not be completed.",
    });
});
