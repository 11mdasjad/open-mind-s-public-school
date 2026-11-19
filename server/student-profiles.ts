import {readFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {db} from './db';
import {allowedDraftStudents} from './student-register';
import {studentEditRoles} from '../shared/portals';

export function registerStudentProfiles(router: any, {wrap, fail, requireStudent, upload, audit}: any) {
  async function resolve(req: any) {
    const student = await db.student.findFirst({where: {id: req.params.id, archived: false}});
    if (student) { await requireStudent(req, student.id); return {...student, isDraft: false}; }
    if (!(await allowedDraftStudents(req)).some(row=>row.id===req.params.id)) fail(404, 'Student not found.');
    const draft = await db.entry.findFirst({where: {id: req.params.id, module: 'studentDrafts', archived: false}});
    if (!draft) fail(404, 'Student not found.');
    return {...draft!.data as any, id: draft!.id, admissionNo: '', isDraft: true};
  }
  const readable = (req: any, module: string) => ['view', 'manage'].includes(req.account.permissions?.[module]);
  const linksFor = (id: string) => ({module: 'studentDocuments', archived: false, data: {path: ['profileId'], equals: id}});
  router.get('/students/:id/profile', wrap(async (req: any, res: any) => {
    const student = await resolve(req);
    const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month || new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'}).slice(0, 7));
    const access = {
      fees: readable(req, 'fees') && ['Super Admin', 'School Admin', 'Principal', 'Accountant', 'Student', 'Parent'].includes(req.account.role),
      attendance: readable(req, 'attendance'), documents: readable(req, 'documents'),
      uploadDocuments: req.account.permissions?.documents === 'manage',
      edit: req.account.permissions?.students === 'manage' && studentEditRoles.includes(req.account.role),
      payments: req.account.permissions?.fees === 'manage' && ['Super Admin', 'School Admin', 'Principal', 'Accountant'].includes(req.account.role),
    };
    const [invoices, attendance, links] = await Promise.all([
      access.fees ? db.invoice.findMany({where: student.isDraft ? {draftStudentId:student.id} : {studentId: student.id}, include: {payments: {include: {refunds: true}}}, orderBy: {dueDate: 'desc'}}) : [],
      access.attendance ? db.attendance.findMany({where: {personKey: student.id, date: {gte: `${month}-01`, lte: `${month}-31`}}, orderBy: [{date: 'asc'}, {period: 'asc'}]}) : [],
      db.entry.findMany({where: linksFor(student.id), orderBy: {createdAt: 'desc'}}),

    ]);
    const pending=access.fees&&invoices.length?await db.entry.findMany({where:{module:'paymentVerifications',archived:false,status:{in:['Draft','Pending']},OR:invoices.map(invoice=>({data:{path:['invoiceId'],equals:invoice.id}}))},select:{id:true,data:true,status:true,userId:true}}):[];
    const files = await db.document.findMany({where: {id: {in: links.map(row => (row.data as any).documentId)}}, select: {id: true, name: true, mime: true, size: true, createdAt: true}});
    const linkedFiles = links.map(row => ({...files.find(file => file.id === (row.data as any).documentId), kind: (row.data as any).kind})).filter(file => file.id);
    res.json({student, access, month, invoices, attendance, pending: pending.map(({userId, ...record}) => ({...record, canSubmit: userId === req.account.id && access.payments && record.status === 'Draft'})), photo: linkedFiles.find(file => file.kind === 'Photo') || null, documents: access.documents ? linkedFiles.filter(file => file.kind !== 'Photo') : []});
  }));
  router.post('/students/:id/profile/files', upload.single('file'), wrap(async (req: any, res: any) => {
    let saved = false;
    try {
      const student = await resolve(req);
      if (!studentEditRoles.includes(req.account.role)) fail(403, 'You cannot edit this student.');
      const kind = z.enum(['Photo', 'Document']).parse(req.body.kind);
      if (kind === 'Document' && req.account.permissions?.documents !== 'manage') fail(403, 'Document management access is required.');
      const file = req.file;
      if (!file) fail(400, 'Choose a PDF, PNG or JPEG up to 5 MB.');
      const bytes = readFileSync(file.path);
      const image = (file.mimetype === 'image/png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (file.mimetype === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
      const pdf = file.mimetype === 'application/pdf' && bytes.subarray(0,5).toString() === '%PDF-';
      if (!(kind === 'Photo' ? image : image || pdf)) fail(400, kind === 'Photo' ? 'Choose a PNG or JPEG photo.' : 'File content does not match its type.');
      const document = await db.$transaction(async tx => {
        const doc = await tx.document.create({data: {name: path.basename(file.originalname), mime: file.mimetype, size: file.size, path: file.path, userId: req.account.id}});
        if (kind === 'Photo') {
          const old = await tx.entry.findMany({where: linksFor(student.id)});
          await tx.entry.updateMany({where: {id: {in: old.filter(row => (row.data as any).kind === 'Photo').map(row => row.id)}}, data: {archived: true}});
        }
        await tx.entry.create({data: {module: 'studentDocuments', title: doc.name, userId: req.account.id, studentId: student.isDraft ? null : student.id, data: {profileId: student.id, documentId: doc.id, kind}}});
        return doc;
      });
      saved = true;
      await audit(req, 'upload', 'student-document', document.id);
      res.status(201).json({id: document.id, name: document.name});
    } finally { if (!saved && req.file) { try { unlinkSync(req.file.path); } catch {} } }
  }));
  router.get('/students/:id/profile/files/:documentId', wrap(async (req: any, res: any) => {
    const student = await resolve(req);
    const link = (await db.entry.findMany({where: linksFor(student.id)})).find(row => (row.data as any).documentId === req.params.documentId);
    if (!link || ((link.data as any).kind !== 'Photo' && !readable(req, 'documents'))) fail(404, 'Document not found.');
    const doc = await db.document.findUnique({where: {id: req.params.documentId}});
    if (!doc) fail(404, 'Document not found.');
    res.set('Cache-Control', 'private, no-store');
    if ((link!.data as any).kind === 'Photo') res.type(doc!.mime).sendFile(path.resolve(doc!.path));
    else res.type(doc!.mime).download(path.resolve(doc!.path), doc!.name);
  }));
}
