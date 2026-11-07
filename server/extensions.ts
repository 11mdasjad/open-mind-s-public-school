import { z } from "zod";
import { db } from "./db";
import { admins } from "../shared/modules";
import {
  gateway,
  paymentsEnabled,
  validSignature,
  reconcilePayment,
} from "./payments";
import { randomBytes } from "node:crypto";
import { defaultGrades } from "./grades";
import PDFDocument from "pdfkit";
export function registerExtensions(
  router: any,
  {
    wrap,
    permit,
    fail,
    audit,
    requireStudent,
    allowedStudents,
    scopedEntries,
  }: any,
) {
  router.get(
    "/exports/:filename",
    wrap(async (req: any, res: any) => {
      const module = req.params.filename.replace(/\.pdf$/, "");
      let rows: any[] = [];
      const students = await allowedStudents(req),
        ids = students.map((s: any) => s.id);
      if (module === "students")
        rows = students.map((s: any) => ({
          Name: s.name,
          Admission: s.admissionNo,
          Class: s.className,
          Section: s.section,
          Session: s.session,
        }));
      else if (module === "employees") {
        const manage =
          admins.includes(req.account.role) ||
          req.account.role === "HR Manager";
        rows = (
          await db.employee.findMany({
            where: {
              archived: false,
              ...(manage ? {} : { userId: req.account.id }),
            },
          })
        ).map((e) => ({
          Name: e.name,
          ID: e.employeeNo,
          Department: e.department,
          Designation: e.designation,
          Joined: e.joiningDate,
        }));
      } else if (module === "fees") {
        permit(req, [...admins, "Accountant", "Parent", "Student"]);
        rows = (
          await db.invoice.findMany({
            where: { studentId: { in: ids } },
            include: {
              student: true,
              payments: { include: { refunds: true } },
            },
          })
        ).map((i) => ({
          Student: i.student.name,
          Invoice: i.number,
          Title: i.title,
          TotalINR: i.amount / 100,
          OutstandingINR:
            (i.amount -
              i.payments.reduce(
                (s, p) =>
                  s + p.amount - p.refunds.reduce((a, r) => a + r.amount, 0),
                0,
              )) /
            100,
          Due: i.dueDate,
        }));
      } else if (module === "payroll") {
        const manage =
          admins.includes(req.account.role) ||
          ["HR Manager", "Accountant"].includes(req.account.role);
        rows = (
          await db.payroll.findMany({
            where: manage
              ? {}
              : { employee: { userId: req.account.id }, status: "Approved" },
            include: { employee: true },
          })
        ).map((p) => ({
          Employee: p.employee.name,
          Month: p.month,
          NetINR: p.net / 100,
          Status: p.status,
        }));
      } else if (module === "exams")
        rows = (
          await db.exam.findMany({
            where: admins.includes(req.account.role)
              ? {}
              : {
                  className: { in: students.map((s: any) => s.className) },
                  ...(["Parent", "Student"].includes(req.account.role)
                    ? { published: true }
                    : {}),
                },
          })
        ).map((e) => ({
          Examination: e.name,
          Class: e.className,
          Subject: e.subject,
          Date: e.date,
          Maximum: e.maxMarks,
          Published: e.published,
        }));
      else if (module === "admissions") {
        permit(req, [...admins, "Receptionist"]);
        rows = (await db.admission.findMany()).map((a) => ({
          Student: a.childName,
          Parent: a.parentName,
          Class: a.className,
          Status: a.status,
          Date: a.createdAt.toISOString().slice(0, 10),
        }));
      } else if (module === "attendance") {
        const own = await db.employee.findUnique({
          where: { userId: req.account.id },
        });
        rows = (
          await db.attendance.findMany({
            where:
              admins.includes(req.account.role) ||
              req.account.role === "HR Manager"
                ? {}
                : {
                    OR: [
                      { studentId: { in: ids } },
                      ...(own ? [{ employeeId: own.id }] : []),
                    ],
                  },
            include: { student: true, employee: true },
          })
        ).map((a) => ({
          Name: a.student?.name || a.employee?.name,
          Date: a.date,
          Period: a.period,
          Status: a.status,
          CheckIn: a.checkIn?.toISOString() || "",
          CheckOut: a.checkOut?.toISOString() || "",
        }));
      } else {
        rows = (await scopedEntries(req, module)).map((r: any) => ({
          Title: r.title,
          Status: r.status,
          ...Object.fromEntries(
            Object.entries(r.data).filter(
              ([key]) =>
                !key.endsWith("Id") &&
                !["bankAccount", "bankIfsc"].includes(key),
            ),
          ),
        }));
      }
      if (req.query.q)
        rows = rows.filter((r) =>
          JSON.stringify(r)
            .toLowerCase()
            .includes(String(req.query.q).toLowerCase()),
        );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="open-mind-${module}.pdf"`,
      );
      const doc = new PDFDocument({ margin: 45, size: "A4" });
      doc.pipe(res);
      doc
        .fillColor("#344332")
        .fontSize(11)
        .text("OPEN MIND'S PUBLIC SCHOOL")
        .moveDown()
        .fontSize(23)
        .text(`${module.charAt(0).toUpperCase() + module.slice(1)} report`)
        .moveDown(0.4)
        .fontSize(9)
        .fillColor("#777777")
        .text(
          `${rows.length} records · Generated ${new Date().toISOString().slice(0, 10)}`,
        )
        .moveDown();
      rows.forEach((r, i) => {
        if (doc.y > 700) doc.addPage();
        doc
          .fontSize(10)
          .fillColor("#344332")
          .text(
            `${i + 1}. ${Object.entries(r)
              .map(([k, v]) => `${k}: ${v ?? "—"}`)
              .join("  |  ")}`,
            { lineGap: 4 },
          )
          .moveDown();
      });
      if (!rows.length) doc.text("No matching records.");
      doc.end();
    }),
  );
  router.get(
    "/configuration/grading",
    wrap(async (_req: any, res: any) => {
      const c = await db.configuration.findUnique({ where: { id: "grading" } });
      res.json(c?.data || defaultGrades);
    }),
  );
  router.put(
    "/configuration/grading",
    wrap(async (req: any, res: any) => {
      permit(req, admins);
      const bands = z
        .array(
          z.object({
            label: z.string().trim().min(1).max(12),
            min: z.coerce.number().min(0).max(100),
          }),
        )
        .min(2)
        .max(15)
        .parse(req.body);
      if (
        !bands.some((b) => b.min === 0) ||
        new Set(bands.map((b) => b.min)).size !== bands.length ||
        new Set(bands.map((b) => b.label)).size !== bands.length
      )
        fail(
          400,
          "Include a zero threshold and use unique labels and thresholds.",
        );
      await db.configuration.upsert({
        where: { id: "grading" },
        create: { id: "grading", data: bands },
        update: { data: bands },
      });
      await audit(req, "update", "configuration", "grading");
      res.json(bands);
    }),
  );
  router.post(
    "/fees/:id/concession",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Accountant"]);
      const d = z
        .object({
          amount: z.coerce.number().positive().max(10000000),
          reason: z.string().min(3).max(1000),
        })
        .parse(req.body);
      const amount = Math.round(d.amount * 100);
      const saved = await db.$transaction(
        async (tx) => {
          const invoice = await tx.invoice.findUnique({
            where: { id: req.params.id },
            include: { payments: { include: { refunds: true } } },
          });
          if (!invoice) return fail(404, "Invoice not found.");
          const collected = invoice.payments.reduce(
            (s, p) =>
              s + p.amount - p.refunds.reduce((a, r) => a + r.amount, 0),
            0,
          );
          if (invoice.amount - amount < collected)
            fail(
              400,
              "Concession cannot reduce the invoice below payments already collected.",
            );
          await tx.entry.create({
            data: {
              module: "feeConcessions",
              title: invoice.number,
              studentId: invoice.studentId,
              userId: req.account.id,
              data: {
                invoiceId: invoice.id,
                amount,
                reason: d.reason,
                previousAmount: invoice.amount,
              },
            },
          });
          return tx.invoice.update({
            where: { id: invoice.id },
            data: { amount: { decrement: amount } },
          });
        },
        { isolationLevel: "Serializable" },
      );
      await audit(req, "concession", "invoice", saved.id);
      res.json(saved);
    }),
  );
  router.post(
    "/payments/:id/refund",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Accountant"]);
      const d = z
        .object({
          amount: z.coerce.number().positive().max(10000000),
          reason: z.string().min(3).max(1000),
          reference: z.string().min(3).max(100),
        })
        .parse(req.body);
      const amount = Math.round(d.amount * 100);
      const refund = await db.$transaction(
        async (tx) => {
          const p = await tx.payment.findUnique({
            where: { id: req.params.id },
            include: { refunds: true },
          });
          if (!p) return fail(404, "Payment not found.");
          if (p.method === "Razorpay")
            fail(
              400,
              "Gateway refunds require reconciliation with the payment provider; offline refund recording is not allowed for gateway payments.",
            );
          if (amount > p.amount - p.refunds.reduce((s, r) => s + r.amount, 0))
            fail(400, "Refund exceeds the remaining paid amount.");
          return tx.refund.create({
            data: {
              paymentId: p.id,
              amount,
              reason: d.reason,
              reference: d.reference,
              recordedBy: req.account.id,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
      await audit(req, "record-offline-refund", "payment", req.params.id);
      res.status(201).json(refund);
    }),
  );
  router.get(
    "/integrations",
    wrap(async (req: any, res: any) =>
      res.json({
        payments: paymentsEnabled(),
        email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
        sms: Boolean(
          process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_FROM,
        ),
      }),
    ),
  );
  router.post(
    "/fees/:id/order",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Accountant", "Parent", "Student"]);
      const invoice = await db.invoice.findUnique({
        where: { id: req.params.id },
        include: { payments: { include: { refunds: true } } },
      });
      if (!invoice) return fail(404, "Invoice not found.");
      await requireStudent(req, invoice.studentId);
      const amount =
        invoice.amount -
        invoice.payments.reduce(
          (s: any, p: any) =>
            s +
            p.amount -
            p.refunds.reduce((a: number, r: any) => a + r.amount, 0),
          0,
        );
      if (amount <= 0) fail(400, "This invoice is already paid.");
      const order = await gateway("/orders", "POST", {
        amount,
        currency: "INR",
        receipt: invoice.number,
        notes: { invoiceId: invoice.id },
      });
      await db.gatewayOrder.create({
        data: { id: order.id, invoiceId: invoice.id, amount },
      });
      res
        .status(201)
        .json({
          orderId: order.id,
          key: process.env.RAZORPAY_KEY_ID,
          amount,
          currency: "INR",
        });
    }),
  );
  router.post(
    "/payments/verify",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Accountant", "Parent", "Student"]);
      const d = z
        .object({
          razorpay_order_id: z.string(),
          razorpay_payment_id: z.string(),
          razorpay_signature: z.string(),
        })
        .parse(req.body);
      const order = await db.gatewayOrder.findUnique({
        where: { id: d.razorpay_order_id },
        include: { invoice: true },
      });
      if (!order) return fail(404, "Order not found.");
      await requireStudent(req, order.invoice.studentId);
      if (
        !process.env.RAZORPAY_KEY_SECRET ||
        !validSignature(
          `${order.id}|${d.razorpay_payment_id}`,
          d.razorpay_signature,
          process.env.RAZORPAY_KEY_SECRET,
        )
      )
        fail(400, "Payment signature verification failed.");
      res.json(await reconcilePayment(order.id, d.razorpay_payment_id));
    }),
  );
  router.post(
    "/students/promote",
    wrap(async (req: any, res: any) => {
      permit(req, admins);
      const d = z
        .object({
          studentIds: z.array(z.string()).min(1).max(500),
          className: z.string().min(1),
          section: z.string().min(1),
          session: z.string().min(1),
        })
        .parse(req.body);
      const students = await db.student.findMany({
        where: { id: { in: d.studentIds }, archived: false },
      });
      if (students.length !== new Set(d.studentIds).size)
        fail(400, "Select active students.");
      await db.$transaction(
        students.flatMap((s) => [
          db.entry.create({
            data: {
              module: "enrollmentHistory",
              title: s.admissionNo,
              studentId: s.id,
              userId: req.account.id,
              data: {
                className: s.className,
                section: s.section,
                session: s.session,
                changedAt: new Date().toISOString(),
              },
            },
          }),
          db.student.update({
            where: { id: s.id },
            data: {
              className: d.className,
              section: d.section,
              session: d.session,
            },
          }),
        ]),
      );
      await audit(req, "promote", "students", d.studentIds.join(","));
      res.json({ count: students.length });
    }),
  );
  router.post(
    "/records/submissions/:id/feedback",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Teacher", "Class Teacher"]);
      const d = z
        .object({
          score: z.coerce.number().min(0).max(100),
          feedback: z.string().min(1).max(5000),
        })
        .parse(req.body);
      const r = await db.entry.findFirst({
        where: { id: req.params.id, module: "submissions", archived: false },
      });
      if (!r?.studentId) return fail(404, "Submission not found.");
      await requireStudent(req, r.studentId);
      const saved = await db.entry.update({
        where: { id: r.id },
        data: {
          data: { ...(r.data as any), ...d, reviewedBy: req.account.id },
          status: "Reviewed",
        },
      });
      await audit(req, "feedback", "submission", r.id);
      res.json(saved);
    }),
  );
  router.post(
    "/records/inventory/:id/movement",
    wrap(async (req: any, res: any) => {
      permit(req, admins);
      const d = z
        .object({
          direction: z.enum(["In", "Out"]),
          quantity: z.coerce.number().int().min(1).max(100000),
          reason: z.string().min(1).max(1000),
        })
        .parse(req.body);
      const saved = await db.$transaction(
        async (tx) => {
          const item = await tx.entry.findFirst({
            where: { id: req.params.id, module: "inventory", archived: false },
          });
          if (!item) fail(404, "Item not found.");
          const stock =
            Number((item!.data as any).quantity) +
            (d.direction === "In" ? d.quantity : -d.quantity);
          if (stock < 0) fail(400, "Not enough stock for this movement.");
          await tx.entry.create({
            data: {
              module: "stockMovements",
              title: item!.title,
              userId: req.account.id,
              data: {
                ...d,
                inventoryId: item!.id,
                previous: (item!.data as any).quantity,
                balance: stock,
              },
            },
          });
          return tx.entry.update({
            where: { id: item!.id },
            data: { data: { ...(item!.data as any), quantity: stock } },
          });
        },
        { isolationLevel: "Serializable" },
      );
      await audit(req, "stock-movement", "inventory", saved.id);
      res.json(saved);
    }),
  );
  router.post(
    "/records/feeStructures/:id/assign",
    wrap(async (req: any, res: any) => {
      permit(req, [...admins, "Accountant"]);
      const d = z
        .object({
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          period: z.string().min(1).max(50),
        })
        .parse(req.body);
      const structure = await db.entry.findFirst({
        where: { id: req.params.id, module: "feeStructures", archived: false },
      });
      if (!structure) return fail(404, "Fee structure not found.");
      const f = structure.data as any;
      const students = await db.student.findMany({
        where: { className: f.className, session: f.session, archived: false },
      });
      if (!students.length)
        fail(400, "No students match this class and session.");
      const title = `${structure.title} · ${d.period}`;
      const count = await db.$transaction(
        async (tx) => {
          if (
            await tx.entry.findFirst({
              where: {
                module: "feeAssignments",
                title: `${structure.id}:${d.period}`,
              },
            })
          )
            fail(
              409,
              "This fee structure was already assigned for this period.",
            );
          await tx.entry.create({
            data: {
              module: "feeAssignments",
              title: `${structure.id}:${d.period}`,
              data: { period: d.period, feeStructureId: structure.id },
              userId: req.account.id,
            },
          });
          for (const s of students)
            await tx.invoice.create({
              data: {
                number: `INV-${randomBytes(8).toString("hex")}`,
                studentId: s.id,
                title,
                amount: Math.round(Number(f.amount) * 100),
                dueDate: d.dueDate,
                session: f.session,
              },
            });
          return students.length;
        },
        { isolationLevel: "Serializable" },
      );
      await audit(req, "assign", "feeStructure", structure.id);
      res.json({ count });
    }),
  );
  router.get(
    "/attendance/self",
    wrap(async (req: any, res: any) => {
      const e = await db.employee.findUnique({
        where: { userId: req.account.id },
      });
      res.json(
        e
          ? await db.attendance.findMany({
              where: { employeeId: e.id },
              orderBy: { date: "desc" },
              take: 366,
            })
          : [],
      );
    }),
  );
  router.get(
    "/delivery-logs",
    wrap(async (req: any, res: any) => {
      permit(req, admins);
      res.json(
        await db.deliveryLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      );
    }),
  );
  router.post(
    "/communications/send",
    wrap(async (req: any, res: any) => {
      permit(req, admins);
      const d = z
        .object({
          channel: z.enum(["Email", "SMS"]),
          recipient: z.string().min(3).max(200),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(5000),
        })
        .parse(req.body);
      if (d.channel === "Email") {
        z.email().parse(d.recipient);
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
          fail(
            503,
            "Configure RESEND_API_KEY and EMAIL_FROM before sending email.",
          );
      } else {
        if (!/^\+[1-9]\d{7,14}$/.test(d.recipient))
          fail(400, "Use an international phone number such as +91…");
        if (
          !process.env.TWILIO_ACCOUNT_SID ||
          !process.env.TWILIO_AUTH_TOKEN ||
          !process.env.TWILIO_FROM
        )
          fail(
            503,
            "Configure the Twilio SMS environment variables before sending.",
          );
      }
      const log = await db.deliveryLog.create({
        data: { ...d, actorId: req.account.id },
      });
      try {
        let response: Response;
        if (d.channel === "Email")
          response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "Idempotency-Key": log.id,
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM,
              to: [d.recipient],
              subject: d.subject,
              text: d.body,
            }),
            signal: AbortSignal.timeout(15000),
          });
        else
          response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: d.recipient,
                From: process.env.TWILIO_FROM!,
                Body: d.body,
              }),
              signal: AbortSignal.timeout(15000),
            },
          );
        const result = await response.json();
        if (!response.ok) throw new Error("Provider rejected the message.");
        await db.deliveryLog.update({
          where: { id: log.id },
          data: {
            status: "Accepted by provider",
            providerId: result.id || result.sid,
          },
        });
        await audit(req, "send", "communication", log.id);
        res.json({ id: log.id, status: "Accepted by provider" });
      } catch {
        await db.deliveryLog.update({
          where: { id: log.id },
          data: {
            status: "Failed or unconfirmed",
            error:
              "Provider did not confirm acceptance. Check provider logs before retrying.",
          },
        });
        fail(
          502,
          "Provider did not confirm acceptance. Check delivery logs before retrying.",
        );
      }
    }),
  );
  router.get(
    "/reports-data/:module",
    wrap(async (req: any, res: any) => {
      const module = req.params.module;
      if (module === "stockMovements") {
        permit(req, admins);
        return res.json(
          await db.entry.findMany({
            where: { module },
            orderBy: { createdAt: "desc" },
          }),
        );
      }
      if (module === "enrollmentHistory") {
        const ids = (await allowedStudents(req)).map((s: any) => s.id);
        return res.json(
          await db.entry.findMany({
            where: { module, studentId: { in: ids } },
          }),
        );
      }
      res.json(await scopedEntries(req, module));
    }),
  );
}
