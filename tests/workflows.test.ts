import { test, before, after } from "node:test";
import { createHmac } from "node:crypto";
import {unlinkSync} from 'node:fs';
import assert from "node:assert/strict";
import { app } from "../server/app";
import { db } from "../server/db";
import {flushActivity} from "../server/activity";
import type { Server } from "node:http";
let server: Server, origin: string;
type Client = { cookie?: string; csrf?: string };
const admin: Client = {},
  studentClient: Client = {},
  principalClient: Client = {},
  teacherClient: Client = {};
async function request(
  path: string,
  method = "GET",
  body?: any,
  client: Client = admin,
) {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      "x-school-request": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(client.cookie ? { Cookie: client.cookie } : {}),
      ...(client.csrf ? { "x-csrf-token": client.csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = r.headers.get("content-type")?.includes("json")
    ? await r.json()
    : await r.arrayBuffer();
  return { status: r.status, data, cookie: r.headers.get("set-cookie") };
}
async function login(email: string, password: string, client: Client) {
  const r = await request("/auth/login", "POST", { email, password }, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  client.cookie = r.cookie!.split(";")[0];
  client.csrf = r.data.csrf;
  return r.data.user;
}
async function approve(type:string,entityId:string,client:Client=admin){
 const submitted=await request('/workflow/submit','POST',{type,entityId},client);
 assert.equal(submitted.status,201,JSON.stringify(submitted.data));
 const reviewed=await request(`/workflow/${submitted.data.id}/decide`,'POST',{decision:'Approved',comment:'Verified supporting records'},principalClient);
 assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
 return submitted.data.id;
}
before(async () => {
  assert.match(
    process.env.DATABASE_URL || "",
    /test[-_]/,
    "Tests must use an isolated database.",
  );
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  for(const document of await db.document.findMany()){
    try{unlinkSync(document.path)}catch{}
  }
  server?.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await flushActivity();
  await db.$disconnect();
});
test("school workflows, validation and account isolation", async (t) => {
  let student: any,
    secondStudent: any,
    employee: any,
    exam: any,
    invoice: any,
    book: any,
    route: any,
    payroll: any,
    homework: any;
  await t.test(
    "empty setup, administrator bootstrap, protected routes and session",
    async () => {
      assert.equal(
        (await request("/health", "GET", undefined, {})).status,
        200,
      );
      assert.equal(
        (await request("/setup", "GET", undefined, {})).data.required,
        true,
      );
      assert.equal(
        (await request("/students", "GET", undefined, {})).status,
        401,
      );
      assert.equal(
        (await request("/public", "GET", undefined, {})).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/setup",
            "POST",
            {
              name: "Test Administrator",
              email: "admin@test.example",
              password: "admin-test-password-123",
            },
            {},
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/setup",
            "POST",
            {
              name: "Intruder",
              email: "other@test.example",
              password: "admin-test-password-123",
            },
            {},
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/auth/login",
            "POST",
            { email: "admin@test.example", password: "bad" },
            {},
          )
        ).status,
        401,
      );
      await login("admin@test.example", "admin-test-password-123", admin);
      assert.equal((await request("/auth/me")).data.user.role, "Super Admin");
      assert.equal((await request('/users','POST',{name:'Review Principal',email:'principal@test.example',password:'principal-password-123',role:'Principal'})).status,201);
      await login('principal@test.example','principal-password-123',principalClient);
      assert.equal(
        (await request("/users", "POST", {}, { cookie: admin.cookie })).status,
        403,
      );
    },
  );
  await t.test("admission enquiry and private tracking", async () => {
    const d = {
      childName: "Applicant",
      parentName: "Parent",
      email: "applicant@test.example",
      phone: "9999999999",
      className: "3",
      message: "Visit request",
    };
    const r = await request("/admissions", "POST", d, {});
    assert.equal(r.status, 201);
    assert.equal(
      (
        await request(
          "/admission-status",
          "POST",
          { reference: r.data.reference, email: d.email },
          {},
        )
      ).data.status,
      "New",
    );
    assert.equal(
      (
        await request(
          "/admission-status",
          "POST",
          { reference: r.data.reference, email: "wrong@test.example" },
          {},
        )
      ).status,
      404,
    );
    const list = await request("/records/admissions");
    assert.equal(list.data.length, 1);
    assert.equal(
      (
        await request(`/records/admissions/${list.data[0].id}`, "PATCH", {
          status: "Contacted",
        })
      ).status,
      200,
    );
  });
  await t.test(
    "student registration keeps guardian contacts and creates only student activation",
    async () => {
      const d = {
        name: "Test Student",
        email: "student@test.example",
        dob: "2015-03-01",
        gender: "Female",
        className: "5",
        section: "A",
        session: "2026–2027",
        parentName: "Test Parent",
        parentEmail: "parent@test.example",
        phone: "9999999999",
        address: "Test address",
      };
      let r = await request("/students", "POST", d);
      assert.equal(r.status, 201, JSON.stringify(r.data));
      student = r.data.record;
      assert.equal(r.data.activationTokens.length, 1);
      for (const token of r.data.activationTokens)
        assert.equal(
          (
            await request(
              "/auth/reset",
              "POST",
              { token: token.token, password: "family-password-12345" },
              {},
            )
          ).status,
          200,
        );
      assert.equal(
        (
          await request(
            "/auth/reset",
            "POST",
            {
              token: r.data.activationTokens[0].token,
              password: "new-password-12345",
            },
            {},
          )
        ).status,
        400,
      );
      await login(d.email, "family-password-12345", studentClient);
      assert.equal((await request('/auth/login','POST',{email:d.parentEmail,password:'family-password-12345'},{})).status,401);
      r = await request("/students", "POST", {
        ...d,
        email: "second@test.example",
        parentEmail: "second-parent@test.example",
        name: "Second Student",
        className: "6",
      });
      assert.equal(r.status, 201);
      secondStudent = r.data.record;
      assert.equal((await request("/students", "POST", d)).status, 409);
      assert.equal(
        (await request("/students", "GET", undefined, studentClient)).data
          .length,
        1,
      );
      assert.equal(
        (await request("/students", "GET", undefined, studentClient)).data
          .length,
        1,
      );
      assert.equal(
        (await request("/students", "POST", d, studentClient)).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/reports/student/${secondStudent.id}`,
            "GET",
            undefined,
            studentClient,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "employee, teacher scope, academic assignment and timetable conflicts",
    async () => {
      const r = await request("/employees", "POST", {
        name: "Teacher One",
        email: "teacher@test.example",
        phone: "8888888888",
        department: "Academics",
        designation: "Teacher",
        joiningDate: "2026-04-01",
        qualification: "B.Ed",
        salary: 25000,
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      employee = r.data.record;
      await request(
        "/auth/reset",
        "POST",
        {
          token: r.data.activationTokens[0].token,
          password: "teacher-password-12345",
        },
        {},
      );
      await login(
        "teacher@test.example",
        "teacher-password-12345",
        teacherClient,
      );
      assert.equal(
        (await request("/students", "GET", undefined, teacherClient)).data
          .length,
        0,
      );
      assert.equal(
        (
          await request("/records/academics", "POST", {
            title: "5",
            session: "2026–2027",
            section: "A",
            subjects: "Math, English",
            teacherId: employee.id,
          })
        ).status,
        201,
      );
      assert.equal(
        (await request("/students", "GET", undefined, teacherClient)).data
          .length,
        1,
      );
      const period = {
        title: "Math",
        className: "5",
        section: "A",
        day: "Monday",
        start: "09:00",
        end: "09:45",
        teacherId: employee.id,
        room: "A1",
      };
      assert.equal(
        (await request("/records/timetable", "POST", period)).status,
        201,
      );
      assert.equal(
        (await request("/records/timetable", "POST", { ...period, room: "A2" }))
          .status,
        409,
      );
      assert.equal(
        (
          await request("/records/timetable", "POST", {
            ...period,
            start: "09:45",
            end: "10:30",
          })
        ).status,
        201,
      );
      assert.equal(
        (await request("/employees", "GET", undefined, teacherClient)).data
          .length,
        1,
      );
      assert.equal((await request("/directory")).data[0].salary, undefined);
    },
  );
  await t.test(
    "attendance upserts, future dates, scope, check in and check out",
    async () => {
      const payload = {
        date: "2026-01-01",
        period: "Daily",
        records: [{ studentId: student.id, status: "Present" }],
      };
      assert.equal(
        (await request("/attendance", "POST", payload, teacherClient)).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/attendance",
            "POST",
            {
              ...payload,
              records: [{ studentId: student.id, status: "Late" }],
            },
            teacherClient,
          )
        ).status,
        200,
      );
      const rows = (await request("/attendance?date=2026-01-01")).data;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "Late");
      assert.equal(
        (
          await request(
            "/attendance",
            "POST",
            {
              ...payload,
              records: [{ studentId: secondStudent.id, status: "Present" }],
            },
            teacherClient,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request("/attendance", "POST", {
            ...payload,
            date: "2099-01-01",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/attendance/check",
            "POST",
            { action: "in" },
            teacherClient,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/attendance/check",
            "POST",
            { action: "in" },
            teacherClient,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/attendance/check",
            "POST",
            { action: "out" },
            teacherClient,
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    "fee ledger, no overpayment, unique receipts and privacy",
    async () => {
      const r = await request("/fees", "POST", {
        studentId: student.id,
        title: "Tuition",
        amount: 5000,
        dueDate: "2026-12-01",
        session: "2026–2027",
      });
      assert.equal(r.status, 201);
      invoice = r.data;
      assert.equal(
        (
          await request(`/fees/${invoice.id}/payment-requests`, "POST", {
            amount: 6000,
            method: "Cash",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/fees/${invoice.id}/payment-requests`, "POST", {
            amount: 5000,
            method: "UPI",
          })
        ).status,
        400,
      );
      const p = await request(`/fees/${invoice.id}/payment-requests`, "POST", {
        amount: 3000,
        method: "Cash",
      });
      assert.equal(p.status, 201);
      await approve('paymentVerifications',p.data.id);
      p.data.id=(await request('/payment-verifications')).data.find((r:any)=>r.id===p.data.id).data.paymentId;
      assert.equal(
        (
          await request(
            `/reports/receipt/${p.data.id}`,
            "GET",
            undefined,
            studentClient,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/fees/${invoice.id}/payment-requests`,
            "POST",
            { amount: 100, method: "Cash" },
            studentClient,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/fees", "GET", undefined, teacherClient)).status,
        403,
      );
      assert.equal(
        (await request("/fees", "GET", undefined, studentClient)).data.length,
        1,
      );
    },
  );
  await t.test(
    "gateway capture verification, invalid signatures, webhook replay and amounts",
    async () => {
      assert.equal(
        (await request(`/fees/${invoice.id}/order`, "POST", {}, studentClient))
          .status,
        503,
      );
      const originalFetch = globalThis.fetch;
      const old = {
        key: process.env.RAZORPAY_KEY_ID,
        secret: process.env.RAZORPAY_KEY_SECRET,
        webhook: process.env.RAZORPAY_WEBHOOK_SECRET,
      };
      process.env.RAZORPAY_KEY_ID = "test-key";
      process.env.RAZORPAY_KEY_SECRET = "test-secret";
      process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook";
      let captured = false;
      let providerAmount = 200000;
      globalThis.fetch = (async (input: any, init: any) => {
        if (String(input).startsWith("https://api.razorpay.com/"))
          return new Response(
            JSON.stringify(
              String(input).endsWith("/orders")
                ? { id: "order_Test123", amount: 200000 }
                : {
                    id: "pay_Test123",
                    order_id: "order_Test123",
                    amount: providerAmount,
                    currency: "INR",
                    status: captured ? "captured" : "authorized",
                    captured,
                  },
            ),
            { headers: { "Content-Type": "application/json" } },
          );
        return originalFetch(input, init);
      }) as typeof fetch;
      try {
        assert.equal(
          (await request(`/fees/${invoice.id}/order`, "POST", {}, studentClient))
            .status,
          201,
        );
        const d = {
          razorpay_order_id: "order_Test123",
          razorpay_payment_id: "pay_Test123",
          razorpay_signature: createHmac("sha256", "test-secret")
            .update("order_Test123|pay_Test123")
            .digest("hex"),
        };
        assert.equal(
          (
            await request(
              "/payments/verify",
              "POST",
              { ...d, razorpay_signature: "bad" },
              studentClient,
            )
          ).status,
          400,
        );
        assert.equal(
          (await request("/payments/verify", "POST", d, studentClient)).status,
          409,
        );
        captured = true;
        providerAmount = 1;
        assert.equal(
          (await request("/payments/verify", "POST", d, studentClient)).status,
          409,
        );
        providerAmount = 200000;
        assert.equal(
          (await request("/payments/verify", "POST", d, studentClient)).status,
          200,
        );
        assert.equal(
          (await request("/payments/verify", "POST", d, studentClient)).status,
          200,
        );
        const body = JSON.stringify({
          event: "payment.captured",
          payload: {
            payment: {
              entity: { id: "pay_Test123", order_id: "order_Test123" },
            },
          },
        });
        const webhook = await originalFetch(origin + "/api/payments/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-razorpay-signature": createHmac("sha256", "test-webhook")
              .update(body)
              .digest("hex"),
          },
          body,
        });
        assert.equal(webhook.status, 200);
        assert.equal(
          await db.payment.count({ where: { reference: "pay_Test123" } }),
          1,
        );
      } finally {
        globalThis.fetch = originalFetch;
        for (const [name, value] of [
          ["RAZORPAY_KEY_ID", old.key],
          ["RAZORPAY_KEY_SECRET", old.secret],
          ["RAZORPAY_WEBHOOK_SECRET", old.webhook],
        ]) {
          if (value === undefined) delete process.env[name!];
          else process.env[name!] = value;
        }
      }
    },
  );
  await t.test(
    "marks validation, class scope and publication controls",
    async () => {
      const r = await request(
        "/exams",
        "POST",
        {
          name: "Term 1",
          className: "5",
          subject: "Math",
          date: "2026-11-01",
          maxMarks: 100,
          passMarks: 33,
          session: "2026–2027",
        },
        teacherClient,
      );
      assert.equal(r.status, 201);
      exam = r.data;
      assert.equal(
        (
          await request(
            `/exams/${exam.id}/marks`,
            "POST",
            { studentId: student.id, score: 101 },
            teacherClient,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/exams/${exam.id}/marks`,
            "POST",
            { studentId: student.id, score: 84, remarks: "Good work" },
            teacherClient,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/exams", "GET", undefined, studentClient)).data.length,
        0,
      );
      assert.equal(
        (await approve('exam',exam.id)) ? 200 : 0,
        200,
      );
      assert.equal(
        (await request("/exams", "GET", undefined, studentClient)).data[0]
          .marks[0].score,
        84,
      );
      assert.equal(
        (
          await request(
            `/reports/reportcard/${student.id}`,
            "GET",
            undefined,
            studentClient,
          )
        ).status,
        200,
      );
    },
  );
  await t.test("homework submission ownership and leave approval", async () => {
    const hw = await request(
      "/records/homework",
      "POST",
      {
        title: "Fractions",
        className: "5",
        section: "A",
        subject: "Math",
        dueDate: "2099-01-01",
        instructions: "Solve exercise one.",
      },
      teacherClient,
    );
    assert.equal(hw.status, 201);
    homework = hw.data;
    assert.equal(
      (await request("/records/homework", "GET", undefined, studentClient)).data
        .length,
      1,
    );
    assert.equal(
      (
        await request(
          "/records/submissions",
          "POST",
          { title: homework.id, answer: "My answer" },
          studentClient,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request("/records/submissions", "GET", undefined, teacherClient))
        .data.length,
      1,
    );
    const leave = await request(
      "/records/leave",
      "POST",
      {
        title: "Medical appointment",
        type: "Sick",
        start: "2026-11-12",
        end: "2026-11-13",
      },
      studentClient,
    );
    assert.equal(leave.status, 201);
    assert.equal(
      (
        await request(
          `/records/leave/${leave.data.id}`,
          "PATCH",
          { status: "Approved" },
          studentClient,
        )
      ).status,
      403,
    );
    const approvalId=await approve('leave',leave.data.id,studentClient);
    assert.equal((await request(`/workflow/${approvalId}/decide`,'POST',{decision:'Rejected',comment:'Repeated review'},principalClient)).status,409);

  });
  await t.test("payroll calculations, review and unique month", async () => {
    const d = {
      employeeId: employee.id,
      month: "2026-11",
      allowances: 2000,
      deductions: 500,
    };
    const r = await request("/payroll", "POST", d);
    assert.equal(r.status, 201);
    payroll = r.data;
    assert.equal(r.data.net, 2650000);
    assert.equal((await request("/payroll", "POST", d)).status, 409);
    assert.equal(
      (await request("/payroll", "GET", undefined, teacherClient)).data.length,
      0,
    );
    assert.equal(
      (await approve('payroll',payroll.id)) ? 200 : 0,
      200,
    );
    assert.equal(
      (
        await request(
          `/reports/payslip/${payroll.id}`,
          "GET",
          undefined,
          teacherClient,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/reports/payslip/${payroll.id}`,
          "GET",
          undefined,
          studentClient,
        )
      ).status,
      403,
    );
  });
  await t.test("library circulation and stock protection", async () => {
    book = (
      await request("/records/library", "POST", {
        title: "A Book",
        author: "Author",
        isbn: "9780000000001",
        category: "Fiction",
        quantity: 1,
      })
    ).data;
    const d = { title: book.id, studentId: student.id, dueDate: "2026-12-01" };
    const loan = await request("/records/loans", "POST", d);
    assert.equal(loan.status, 201);
    assert.equal(
      (
        await request("/records/loans", "POST", {
          ...d,
          studentId: secondStudent.id,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(`/records/library/${book.id}`, "DELETE")).status,
      409,
    );
    assert.equal(
      (
        await request(`/records/loans/${loan.data.id}`, "PATCH", {
          status: "Returned",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/records/loans", "POST", {
          ...d,
          studentId: secondStudent.id,
        })
      ).status,
      201,
    );
  });
  await t.test(
    "transport validates route, vehicle capacity and assignments",
    async () => {
      const v = await request("/records/vehicles", "POST", {
        title: "TEST-01",
        driver: "Driver",
        phone: "9999999999",
        capacity: 1,
        maintenanceDate: "2027-01-01",
      });
      assert.equal(v.status, 201);
      route = (
        await request("/records/routes", "POST", {
          title: "North route",
          vehicleId: v.data.id,
          stops: "Stop one",
          fee: 1000,
        })
      ).data;
      assert.equal(
        (
          await request("/records/transport", "POST", {
            title: route.id,
            studentId: student.id,
            stop: "Stop one",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request("/records/transport", "POST", {
            title: route.id,
            studentId: secondStudent.id,
            stop: "Stop one",
          })
        ).status,
        409,
      );
      assert.equal(
        (await request(`/records/vehicles/${v.data.id}`, "DELETE")).status,
        409,
      );
    },
  );
  await t.test("inventory, notices, events, CMS and audit", async () => {
    const entries: any = {
      inventory: {
        title: "Chairs",
        category: "Furniture",
        quantity: 10,
        minimum: 2,
        location: "A1",
      },
      purchases: {
        title: "Books",
        vendor: "Vendor",
        amount: 1000,
        date: "2026-01-01",
      },
      departments: { title: "Science", head: "Head" },
      feeStructures: {
        title: "Tuition",
        className: "5",
        session: "2026–2027",
        amount: 5000,
        frequency: "Quarterly",
      },
      events: {
        title: "Reading day",
        date: "2026-12-12",
        location: "Library",
        description: "Shared reading",
      },
      notices: {
        title: "Welcome",
        body: "A new term",
        audience: "Public",
        publishDate: "2026-01-01",
      },
    };
    for (const [module, data] of Object.entries(entries)) {
      const r = await request(`/records/${module}`, "POST", data);
      assert.equal(r.status, 201, `${module}: ${JSON.stringify(r.data)}`);
      assert.equal((await request(`/records/${module}`)).status, 200);
    }
    assert.equal(
      (
        await request("/cms/home", "PUT", {
          title: "Open minds",
          body: "New school message",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/public", "GET", undefined, {})).data.pages.home.body,
      "New school message",
    );
    assert.equal(
      (await request("/public", "GET", undefined, {})).data.notices.length,
      1,
    );
    assert.equal(
      (await request("/cms", "GET", undefined, studentClient)).status,
      403,
    );
    assert.ok((await request("/audit")).data.length > 20);
    assert.equal(
      (await request("/audit", "GET", undefined, teacherClient)).status,
      403,
    );
    const dashboard = await request("/dashboard");
    assert.equal(dashboard.data.students, 2);
    assert.equal(dashboard.data.collected, 500000);
    assert.equal(
      (await request("/dashboard", "GET", undefined, teacherClient)).data
        .collected,
      0,
    );
  });
  await t.test(
    "stock movements, class fee assignment, feedback and promotions",
    async () => {
      const stock = (await request("/records/inventory")).data[0];
      assert.equal(
        (
          await request(`/records/inventory/${stock.id}/movement`, "POST", {
            direction: "Out",
            quantity: 11,
            reason: "Too much",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/records/inventory/${stock.id}/movement`, "POST", {
            direction: "Out",
            quantity: 3,
            reason: "Classroom use",
          })
        ).data.data.quantity,
        7,
      );
      const submission = (
        await request("/records/submissions", "GET", undefined, teacherClient)
      ).data[0];
      assert.equal(
        (
          await request(
            `/records/submissions/${submission.id}/feedback`,
            "POST",
            { score: 90, feedback: "Clear working" },
            teacherClient,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/records/submissions", "GET", undefined, studentClient))
          .data[0].data.score,
        90,
      );
      const structure = (await request("/records/feeStructures")).data[0];
      assert.equal(
        (
          await request(
            `/records/feeStructures/${structure.id}/assign`,
            "POST",
            { dueDate: "2026-12-01", period: "December" },
          )
        ).data.count,
        1,
      );
      assert.equal(
        (
          await request(
            `/records/feeStructures/${structure.id}/assign`,
            "POST",
            { dueDate: "2026-12-01", period: "December" },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request("/communications/send", "POST", {
            channel: "Email",
            recipient: "parent@test.example",
            subject: "Hello",
            body: "School update",
          })
        ).status,
        503,
      );
      assert.equal(
        (
          await request("/students/promote", "POST", {
            studentIds: [student.id],
            className: "6",
            section: "B",
            session: "2027–2028",
          })
        ).data.count,
        1,
      );
      assert.equal(
        (
          await request(
            "/reports-data/enrollmentHistory",
            "GET",
            undefined,
            studentClient,
          )
        ).data.length,
        1,
      );
    },
  );
  await t.test(
    "refund limits, grading configuration, PDF export and private documents",
    async () => {
      const invoiceWithPayments = (await request("/fees")).data.find(
        (i: any) => i.id === invoice.id,
      );
      const cash = invoiceWithPayments.payments.find(
        (p: any) => p.method === "Cash",
      );
      assert.equal(
        (
          await request(`/payments/${cash.id}/refund`, "POST", {
            amount: 4000,
            reason: "Too much",
            reference: "REF-TEST-1",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/payments/${cash.id}/refund`, "POST", {
            amount: 100,
            reason: "Fee correction",
            reference: "REF-TEST-1",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(`/payments/${cash.id}/refund`, "POST", {
            amount: 100,
            reason: "Fee correction",
            reference: "REF-TEST-1",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(`/fees/${invoice.id}/concession`, "POST", {
            amount: 101,
            reason: "Scholarship",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/fees/${invoice.id}/concession`, "POST", {
            amount: 50,
            reason: "Scholarship",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/configuration/grading", "PUT", [
            { label: "Pass", min: 50 },
            { label: "Developing", min: 0 },
          ])
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/configuration/grading", "PUT", [
            { label: "A", min: 50 },
            { label: "B", min: 50 },
          ])
        ).status,
        400,
      );
      assert.equal(
        (await request("/exports/students.pdf", "GET", undefined, studentClient))
          .status,
        200,
      );
      assert.equal(
        (await request("/exports/fees.pdf", "GET", undefined, teacherClient))
          .status,
        403,
      );
      const form = new FormData();
      form.append(
        "file",
        new Blob(["%PDF-1.4\nTest document"], { type: "application/pdf" }),
        "test-document.pdf",
      );
      const r = await fetch(origin + "/api/documents", {
        method: "POST",
        headers: {
          "x-school-request": "1",
          "x-csrf-token": studentClient.csrf!,
          Cookie: studentClient.cookie!,
        },
        body: form,
      });
      assert.equal(r.status, 201);
      const doc = await r.json();
      assert.equal(
        (await request(`/documents/${doc.id}`, "GET", undefined, studentClient))
          .status,
        200,
      );
      assert.equal(
        (await request(`/documents/${doc.id}`, "GET", undefined, teacherClient))
          .status,
        404,
      );
      const submitted = await db.entry.findFirstOrThrow({where:{module:'submissions',studentId:student.id}});
      await db.entry.update({where:{id:submitted.id},data:{data:{...(submitted.data as any),documentId:doc.id}}});
      assert.equal((await request(`/documents/${doc.id}`,'GET',undefined,studentClient)).status,200,'Student can download own attached submission');
      assert.equal((await request(`/documents/${doc.id}`,'GET',undefined,{})).status,401,'Anonymous requests cannot download a submission');
      const bad = new FormData();
      bad.append(
        "file",
        new Blob(["<script>bad</script>"], { type: "image/png" }),
        "fake.png",
      );
      const rejected = await fetch(origin + "/api/documents", {
        method: "POST",
        headers: {
          "x-school-request": "1",
          "x-csrf-token": studentClient.csrf!,
          Cookie: studentClient.cookie!,
        },
        body: bad,
      });
      assert.equal(rejected.status, 400);
    },
  );
  await t.test("role portals, identifier sign-in, private summaries and account recovery", async()=>{
    const wrong=await request('/auth/login','POST',{identifier:student.admissionNo,password:'family-password-12345',portal:'admin'},{});
    assert.equal(wrong.status,403);assert.equal(wrong.cookie,null);
    const identified=await request('/auth/login','POST',{identifier:student.admissionNo,password:'family-password-12345',portal:'student'},{});
    assert.equal(identified.status,200);assert.equal(identified.data.user.role,'Student');
    const employeeLogin=await request('/auth/login','POST',{identifier:employee.employeeNo,password:'teacher-password-12345',portal:'teacher'},{});
    assert.equal(employeeLogin.status,200);
    const studentSummary=await request('/portal-summary','GET',undefined,studentClient);
    assert.equal(studentSummary.status,200);assert.equal(studentSummary.data.kind,'student');
    assert.deepEqual(studentSummary.data.students.map((s:any)=>s.id),[student.id]);
    assert.equal(studentSummary.data.employee,null);assert.equal(studentSummary.data.payroll.length,0);
    assert.ok(studentSummary.data.invoices.every((i:any)=>i.studentId===student.id));
    const teacherSummary=await request('/portal-summary','GET',undefined,teacherClient);
    assert.equal(teacherSummary.status,200);assert.equal(teacherSummary.data.kind,'teacher');
    assert.equal(teacherSummary.data.employee.id,employee.id);assert.deepEqual(teacherSummary.data.invoices,[]);
    assert.ok(teacherSummary.data.payroll.every((p:any)=>p.employeeId===employee.id&&p.status==='Approved'));
    const recovery=await request('/auth/recovery','POST',{identifier:student.admissionNo},{});
    const unknown=await request('/auth/recovery','POST',{identifier:'unknown@test.example'},{});
    assert.equal(recovery.status,200);assert.deepEqual(recovery.data,unknown.data);
    const requests=await request('/records/accessRequests');const record=requests.data.find((r:any)=>r.userId===student.userId);
    assert.ok(record);assert.equal(record.status,'Pending');
    assert.equal((await request('/records/accessRequests','GET',undefined,studentClient)).status,403);
    assert.equal((await request(`/access-requests/${record.id}/resolve`,'POST',{},studentClient)).status,403);
    assert.equal((await request(`/access-requests/${record.id}/resolve`,'POST',{})).status,200);
    assert.equal((await request('/records/accessRequests','POST',{})).status,403);
  });
  await t.test('flowchart roles, principal reviews, HR onboarding and delegated permissions',async()=>{
    const hr:Client={}, accounts:Client={}, general:Client={};
    const staffUsers:any={};
    for(const [role,portal,client] of [['HR Manager','hr',hr],['Accountant','accounts',accounts],['Employee','employee',general]] as const){
      const email=portal+'@flow.test';
      const created=await request('/users','POST',{name:'Flow '+role,email,password:'flow-password-12345',role});
      assert.equal(created.status,201);staffUsers[portal]=created.data;
      const signed=await request('/auth/login','POST',{email,password:'flow-password-12345',portal},{});
      assert.equal(signed.status,200);client.cookie=signed.cookie!.split(';')[0];client.csrf=signed.data.csrf;
      assert.equal((await request('/workspace-summary','GET',undefined,client)).status,200);
    }
    assert.equal((await request('/users','GET',undefined,principalClient)).status,403);
    assert.equal((await request('/employees','POST',{},principalClient)).status,403);
    assert.equal((await request('/role-profiles','GET',undefined,hr)).status,403);
    const school=(await request('/school-settings')).data;
    assert.equal((await request('/school-settings','PUT',{...school,academicSession:'2027–2028'},principalClient)).status,403);
    assert.equal((await request('/school-settings','PUT',{...school,academicSession:'2027–2028'})).status,200);
    assert.equal((await request('/school-settings')).data.academicSession,'2027–2028');
    assert.equal((await request('/auth/login','POST',{email:'parent@test.example',password:'family-password-12345',portal:'parent'},{})).status,400);
    const candidate={title:'New Teacher',email:'candidate@flow.test',phone:'9999999999',position:'Teacher',department:'Science',stage:'Applied',notes:'Interview ready'};
    const applied=await request('/records/recruitment','POST',candidate,hr);assert.equal(applied.status,201,JSON.stringify(applied.data));
    const joining={joiningDate:'2026-11-01',qualification:'B.Ed',salary:25000};
    assert.equal((await request(`/recruitment/${applied.data.id}/onboard`,'POST',joining,hr)).status,409);
    assert.equal((await request(`/records/recruitment/${applied.data.id}`,'PUT',{...candidate,stage:'Offer'},hr)).status,200);
    const hired=await request(`/recruitment/${applied.data.id}/onboard`,'POST',joining,hr);assert.equal(hired.status,201,JSON.stringify(hired.data));
    assert.equal(hired.data.activationTokens.length,1);assert.equal(hired.data.record.salary,2500000);
    assert.equal((await request(`/recruitment/${applied.data.id}/onboard`,'POST',joining,hr)).status,409);
    const appraisal={title:'Term appraisal',employeeId:hired.data.record.id,period:'Term 1',score:88,strengths:'Preparation',development:'Classroom practice'};
    assert.equal((await request('/records/appraisals','POST',{...appraisal,score:101},hr)).status,400);
    const appraised=await request('/records/appraisals','POST',appraisal,hr);assert.equal(appraised.status,201);
    const pending=await request('/workflow/submit','POST',{type:'appraisals',entityId:appraised.data.id},hr);assert.equal(pending.status,201);
    assert.equal((await request('/workflow/submit','POST',{type:'appraisals',entityId:appraised.data.id},hr)).status,409);
    assert.equal((await request(`/records/appraisals/${appraised.data.id}`,'PUT',{...appraisal,score:90},hr)).status,409);
    assert.equal((await request(`/workflow/${pending.data.id}/decide`,'POST',{decision:'Approved',comment:'Own approval'},hr)).status,403);
    assert.equal((await request(`/workflow/${pending.data.id}/decide`,'POST',{decision:'Approved',comment:'Checked review'},accounts)).status,403);
    assert.equal((await request(`/workflow/${pending.data.id}/decide`,'POST',{decision:'Approved',comment:'Checked review'},principalClient)).status,200);
    assert.equal((await request(`/records/appraisals/${appraised.data.id}`,'PUT',{...appraisal,score:90},hr)).status,409);
    const report=await request('/records/workReports','POST',{title:'Weekly work',period:'Week 1',achievements:'Updated records',nextSteps:'File review'},general);assert.equal(report.status,201);
    const work=await request('/workflow/submit','POST',{type:'workReports',entityId:report.data.id},general);assert.equal(work.status,201);
    assert.equal((await request('/workflow','GET',undefined,studentClient)).data.some((r:any)=>r.id===work.data.id),false);
    await db.entry.update({where:{id:report.data.id},data:{title:'Changed after submission'}});
    assert.equal((await request(`/workflow/${work.data.id}/decide`,'POST',{decision:'Approved',comment:'Must be current'},principalClient)).status,409);
    assert.equal((await request(`/workflow/${work.data.id}/cancel`,'POST',{},general)).status,200);
    await approve('workReports',report.data.id,general);
    student=(await request('/students')).data.find((s:any)=>s.id===student.id);
    assert.equal((await request('/records/academics','POST',{title:student.className,section:student.section,session:student.session,teacherId:employee.id,subjects:'Science'})).status,201);
    const progress={title:'Science progress',studentId:student.id,subject:'Science',period:'Term 1',academic:'Steady progress',behaviour:'Collaborative',nextSteps:'Practice diagrams'};
    assert.equal((await request('/records/progress','POST',progress,teacherClient)).status,201);
    assert.equal((await request('/records/progress','POST',{...progress,studentId:secondStudent.id},teacherClient)).status,403);
    assert.ok((await request('/records/progress','GET',undefined,studentClient)).data.every((r:any)=>r.studentId===student.id));
    const assessment=await request('/records/studentAssessments','POST',{title:'Principal review',studentId:student.id,period:'Term 1',score:87,observations:'Good progress',recommendations:'Read daily'},principalClient);assert.equal(assessment.status,201);
    const review=await request('/workflow/submit','POST',{type:'studentAssessments',entityId:assessment.data.id},principalClient);assert.equal(review.status,201);
    assert.equal((await request(`/workflow/${review.data.id}/decide`,'POST',{decision:'Approved',comment:'Self review'},principalClient)).status,403);
    assert.equal((await request(`/workflow/${review.data.id}/decide`,'POST',{decision:'Approved',comment:'Second reviewer'})).status,200);
    const fee=await request('/fees','POST',{studentId:student.id,title:'Activities',amount:100,dueDate:'2026-12-01',session:student.session},accounts);assert.equal(fee.status,201);
    const collection=await request(`/fees/${fee.data.id}/payment-requests`,'POST',{amount:100,method:'UPI',reference:'UPI-test-reference'},accounts);assert.equal(collection.status,201);
    assert.equal((await request('/fees','GET',undefined,accounts)).data.find((r:any)=>r.id===fee.data.id).payments.length,0);
    assert.equal((await request(`/fees/${fee.data.id}/payment`,'POST',{amount:100,method:'Cash'},accounts)).status,409);
    const verify=await request('/workflow/submit','POST',{type:'paymentVerifications',entityId:collection.data.id},accounts);assert.equal(verify.status,201);
    assert.equal((await request(`/workflow/${verify.data.id}/decide`,'POST',{decision:'Approved',comment:'Self verify'},accounts)).status,403);
    assert.equal((await request(`/workflow/${verify.data.id}/decide`,'POST',{decision:'Approved',comment:'Receipt checked'},principalClient)).status,200);
    assert.equal((await request('/fees','GET',undefined,accounts)).data.find((r:any)=>r.id===fee.data.id).payments.length,1);
    const notices=(await request('/notifications','GET',undefined,general)).data;assert.ok(notices.length);
    assert.equal((await request(`/notifications/${notices[0].id}/read`,'POST',{},studentClient)).status,404);
    assert.equal((await request(`/notifications/${notices[0].id}/read`,'POST',{},general)).status,200);
    assert.equal((await request('/role-profiles','POST',{name:'Forbidden role',baseRole:'Employee',permissions:{users:'manage'}})).status,400);
    const profile=await request('/role-profiles','POST',{name:'Inventory assistant',baseRole:'Employee',permissions:{inventory:'manage',payroll:'none'}});assert.equal(profile.status,201);
    assert.equal((await request(`/users/${staffUsers.employee.id}/access`,'POST',{roleId:profile.data.id})).status,200);
    assert.equal((await request('/auth/me','GET',undefined,general)).status,401);
    await login('employee@flow.test','flow-password-12345',general);
    const item={title:'Classroom supplies',category:'Stationery',quantity:12,minimum:2,location:'Office',vendor:'School store'};
    const inventory=await request('/records/inventory','POST',item,general);assert.equal(inventory.status,201,JSON.stringify(inventory.data));
    assert.equal((await request('/payroll','GET',undefined,general)).status,403);
    assert.equal((await request('/portal-summary','GET',undefined,general)).data.payroll.length,0);
    assert.equal((await request(`/role-profiles/${profile.data.id}`,'PUT',{name:'Inventory reader',baseRole:'Employee',permissions:{inventory:'view',payroll:'none'}})).status,200);
    assert.ok((await request('/records/inventory','GET',undefined,general)).data.some((r:any)=>r.id===inventory.data.id));
    assert.equal((await request('/records/inventory','POST',item,general)).status,403);
    assert.equal((await request(`/users/${student.userId}/access`,'POST',{roleId:profile.data.id})).status,400);
    assert.equal((await request('/analytics','GET',undefined,teacherClient)).data.billed,null);
    assert.equal((await request(`/exams/${exam.id}`,'PATCH',{published:true})).status,409);
  });
  await t.test('administrator activity tracking, privacy, pagination and credential management',async()=>{
    const created=await request('/users','POST',{name:'Credential Teacher',email:'credential-teacher@test.example',role:'Teacher',password:'teaching123'});assert.equal(created.status,201);
    const member:Client={};await login('credential-teacher@test.example','teaching123',member);
    assert.equal((await request('/activity','GET',undefined,member)).status,403);
    assert.equal((await request('/activity','GET',undefined,principalClient)).status,403);
    assert.equal((await request('/activity','GET',undefined,studentClient)).status,403);
    assert.equal((await request('/portal-events','POST',{module:'users'},member)).status,403);
    assert.equal((await request(`/users/${created.data.id}/password`,'POST',{password:'replacement123'},studentClient)).status,403);
    const linked=await request('/employees','POST',{name:'Credential Teacher',email:'credential-teacher@test.example',phone:'9999999999',department:'Science',designation:'Teacher',joiningDate:'2026-11-01',qualification:'B.Ed',salary:23000});assert.equal(linked.status,201,JSON.stringify(linked.data));assert.equal(linked.data.activationTokens.length,0);
    await login('credential-teacher@test.example','teaching123',member);
    assert.equal((await request(`/users/${created.data.id}/password`,'POST',{password:'newteacher123'})).status,200);
    assert.equal((await request('/auth/me','GET',undefined,member)).status,401);
    assert.equal((await request('/auth/login','POST',{email:'credential-teacher@test.example',password:'teaching123'},{})).status,401);
    await login('credential-teacher@test.example','newteacher123',member);
    for(let i=0;i<42;i++)assert.equal((await request('/portal-events','POST',{module:'homework'},member)).status,201);
    const activity=await request('/activity?actor='+created.data.id);assert.equal(activity.status,200,JSON.stringify(activity.data));assert.equal(activity.data.rows.length,40);assert.ok(activity.data.total>40);assert.ok(activity.data.rows.every((r:any)=>r.data.actorId===created.data.id));
    const next=await request('/activity?actor='+created.data.id+'&page=2');assert.ok(next.data.rows.length>0);assert.ok(!activity.data.rows.some((r:any)=>next.data.rows.some((s:any)=>s.id===r.id)));
    const filtered=await request('/activity?actor='+created.data.id+'&outcome=Blocked');assert.ok(filtered.data.total>0);assert.ok(filtered.data.rows.every((r:any)=>r.status==='Blocked'));
    assert.ok(filtered.data.rows.some((r:any)=>r.data.route==='/activity'),'Denied access to monitoring must also be logged');
    const successOnly=await request('/activity?actor='+created.data.id+'&outcome=Success');assert.equal(successOnly.data.summary.blocked,0);
    const searched=await request('/activity?q=credential%20teacher');assert.ok(searched.data.total>0);
    const staff=activity.data.staff.find((u:any)=>u.id===created.data.id);assert.ok(staff.lastActivity);assert.ok(staff.actions>40);assert.equal(staff.attendance,'Not recorded');
    const history=await request('/activity?source=history');assert.equal(history.status,200);assert.ok(history.data.rows.some((r:any)=>r.title==='set password'||r.title==='Set account password'));
    assert.equal((await request('/activity?from=2026-12-01&to=2026-01-01')).status,400);
    assert.equal((await request('/activity?category=Downloads')).status,200);
    await flushActivity();const stored=JSON.stringify(await db.entry.findMany({where:{module:'activity'}}));
    for(const secret of ['teaching123','newteacher123','replacement123','passwordHash','x-csrf-token',member.csrf!])assert.equal(stored.includes(secret),false,'Activity must never contain credentials');
    assert.equal((await request('/records/activity','GET',undefined,studentClient)).status,403);
  });
  await t.test('generated employee credentials: login, rotation, permissions and privacy',async()=>{
    const created=await request('/employees','POST',{name:'Generated Teacher',email:'generated-teacher@test.example',phone:'9999999999',department:'Science',designation:'Teacher',joiningDate:'2026-11-01',qualification:'B.Ed',salary:23000,generateCredentials:true});
    assert.equal(created.status,201);const first=created.data.credentials;assert.equal(first.portal,'teacher');assert.ok(first.password.length>=20);assert.equal(created.data.activationTokens.length,0);
    const member:Client={};await login(first.email,first.password,member);
    assert.equal((await request('/auth/login','POST',{identifier:first.employeeNo,password:first.password,portal:'teacher'},{})).status,200);
    const url=`/employees/${created.data.record.id}/credentials`;
    assert.equal((await request(url,'POST',{},member)).status,403);
    assert.equal((await request(url,'POST',{},principalClient)).status,403);
    const rotated=await request(url,'POST',{});assert.equal(rotated.status,200);const second=rotated.data.credentials;assert.notEqual(second.password,first.password);assert.equal(second.portal,'teacher');
    assert.equal((await request('/auth/me','GET',undefined,member)).status,401);
    assert.equal((await request('/auth/login','POST',{email:first.email,password:first.password},{})).status,401);
    await login(second.email,second.password,member);
    const listed=JSON.stringify((await request('/employees')).data);assert.ok(!listed.includes(first.password)&&!listed.includes(second.password));
    const resets=await db.passwordReset.count({where:{userId:created.data.record.userId}});assert.equal(resets,0);
    await flushActivity();const events=JSON.stringify(await db.entry.findMany({where:{module:'activity'}}));assert.ok(!events.includes(first.password)&&!events.includes(second.password),'Generated passwords are not in activity logs');
    await request(`/employees/${created.data.record.id}`,'DELETE',{});assert.equal((await request(url,'POST',{})).status,404);
  });
  await t.test('administrator-linked employee gets a separate login without changing administrator access',async()=>{
    const input={name:'Administrator linked teacher',email:'admin@test.example',phone:'9999999999',department:'Science',designation:'Teacher',joiningDate:'2026-11-01',qualification:'B.Ed',salary:23000};
    const rejected=await request('/employees','POST',{...input,generateCredentials:true});assert.equal(rejected.status,409);assert.match(rejected.data.error,/different employee email/);
    const linked=await request('/employees','POST',input);assert.equal(linked.status,201);assert.equal(linked.data.credentials,undefined);
    const record=linked.data.record;const original=await db.user.findUniqueOrThrow({where:{email:input.email}});
    assert.equal((await request('/employees')).data.find((e:any)=>e.id===record.id).accountRole,'Super Admin');
    assert.equal((await request(`/employees/${record.id}/login`,'POST',{email:'separate-teacher@test.example'},teacherClient)).status,403);
    assert.equal((await request(`/employees/${record.id}/login`,'POST',{email:input.email})).status,409);
    const split=await request(`/employees/${record.id}/login`,'POST',{email:'separate-teacher@test.example'});assert.equal(split.status,200);assert.equal(split.data.credentials.employeeNo,record.employeeNo);assert.equal(split.data.credentials.portal,'teacher');
    await login(split.data.credentials.email,split.data.credentials.password,{});
    const current=await db.user.findUniqueOrThrow({where:{id:original.id}});assert.equal(current.passwordHash,original.passwordHash);assert.equal(current.role,'Super Admin');assert.equal((await request('/auth/me')).status,200);
    assert.equal((await request(`/employees/${record.id}/login`,'POST',{email:'second-separate@test.example'})).status,409);
  });
  await t.test('student creation by HR, teachers and principal; removal only by admin and principal',async()=>{
    const makeStudent=(key:string)=>({name:'Permission Student '+key,email:key+'@student-permission.test',dob:'2015-03-01',gender:'Female',className:'NEW-'+key,section:'A',session:'2026–2027',parentName:'Guardian '+key,parentEmail:key+'@guardian-permission.test',phone:'9999999999',address:'Test address'});
    const privateStudent=await request('/students','POST',makeStudent('private'));assert.equal(privateStudent.status,201);
    for(const [role,key] of [['Teacher','teacher'],['Class Teacher','class-teacher'],['HR Manager','hr'],['Principal','principal'],['School Admin','school-admin']]){
      const client:Client=role==='Teacher'?teacherClient:role==='Principal'?principalClient:{};
      if(!client.cookie){const email=key+'@student-permission.test';assert.equal((await request('/users','POST',{name:role,email,role,password:'permission-password-123'})).status,201);await login(email,'permission-password-123',client);}
      const input=makeStudent('added-'+key),created=await request('/students','POST',input,client);assert.equal(created.status,201,role+' should add students');assert.equal(created.data.activationTokens.length,1);
      const rows=(await request('/students','GET',undefined,client)).data;assert.ok(rows.some((r:any)=>r.id===created.data.record.id),role+' can see their newly added student');
      if(['Teacher','Class Teacher'].includes(role))assert.ok(!rows.some((r:any)=>r.id===privateStudent.data.record.id),'Unrelated students remain outside teacher scope');
      const removed=await request('/students/'+created.data.record.id,'DELETE',undefined,client);
      if(['Principal','School Admin'].includes(role)){
        assert.equal(removed.status,200);assert.equal((await db.student.findUniqueOrThrow({where:{id:created.data.record.id}})).archived,true);assert.equal((await db.user.findUniqueOrThrow({where:{id:created.data.record.userId}})).active,false);assert.equal(await db.passwordReset.count({where:{userId:created.data.record.userId}}),0);
      }else{
        assert.equal(removed.status,403,role+' cannot remove students');assert.equal((await request('/students/'+created.data.record.id,'PUT',input,client)).status,403,role+' only received add access');assert.equal((await db.student.findUniqueOrThrow({where:{id:created.data.record.id}})).archived,false);
      }
    }
    for(const [role,key] of [['Receptionist','receptionist'],['Vice Principal','vice-principal'],['Employee','employee']]){
      const email=key+'@remove-permission.test';await request('/users','POST',{name:role,email,role,password:'permission-password-123'});const client:Client={};await login(email,'permission-password-123',client);assert.equal((await request('/students/'+privateStudent.data.record.id,'DELETE',undefined,client)).status,403,role+' cannot remove students');
    }
    assert.equal((await request('/students/'+privateStudent.data.record.id,'DELETE')).status,200);
  });
  await t.test('linked notification delivery, recipient isolation, unread sync and scheduled notices',async()=>{
    const current=await db.student.findUniqueOrThrow({where:{id:student.id}});
    await request('/records/academics','POST',{title:current.className,section:current.section,session:current.session,subjects:'Science',teacherId:employee.id});
    const assigned=await request('/notifications/feed?type=academics','GET',undefined,teacherClient);assert.equal(assigned.status,200);assert.ok(assigned.data.rows.some((n:any)=>n.title==='Class assignment updated'));
    const hw=await request('/records/homework','POST',{title:'Notification test homework',className:current.className,section:current.section,subject:'Science',dueDate:'2099-12-31',instructions:'Observe a plant'},teacherClient);assert.equal(hw.status,201,JSON.stringify(hw.data));
    const studentFeed=await request('/notifications/feed?type=homework&q=Notification%20test','GET',undefined,studentClient);assert.equal(studentFeed.status,200);const homeworkNotice=studentFeed.data.rows.find((n:any)=>n.data.recordId===hw.data.id);assert.ok(homeworkNotice);assert.equal(homeworkNotice.canOpen,true);
    assert.equal(await db.entry.count({where:{module:'notifications',userId:secondStudent.userId,data:{path:['recordId'],equals:hw.data.id}}}),0,'Other classes do not receive the assignment');
    assert.ok(!(await request('/notifications/feed?type=homework','GET',undefined,principalClient)).data.rows.some((n:any)=>n.id===homeworkNotice.id),'Notices are private to the intended account');
    const submitted=await request('/records/submissions','POST',{title:hw.data.id,answer:'A plant observation'},studentClient);assert.equal(submitted.status,201);
    const teacherFeed=await request('/notifications/feed?type=submissions','GET',undefined,teacherClient);assert.ok(teacherFeed.data.rows.some((n:any)=>n.data.recordId===submitted.data.id));
    assert.equal((await request(`/notifications/${homeworkNotice.id}/state`,'PATCH',{status:'Read'},teacherClient)).status,404);
    const summaryBefore=(await request('/notifications/summary','GET',undefined,studentClient)).data;
    assert.equal((await request(`/notifications/${homeworkNotice.id}/state`,'PATCH',{status:'Read'},studentClient)).status,200);
    assert.equal((await request('/notifications/summary','GET',undefined,studentClient)).data.unread,summaryBefore.unread-1);
    assert.equal((await request(`/notifications/${homeworkNotice.id}/state`,'PATCH',{status:'Unread'},studentClient)).status,200);
    assert.equal((await request('/notifications/summary','GET',undefined,studentClient)).data.unread,summaryBefore.unread);
    const notice=await request('/records/notices','POST',{title:'Employees only announcement',body:'Staff update for notification testing',audience:'Employees',publishDate:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})});assert.equal(notice.status,201);
    const staffFeed=(await request('/notifications/feed?type=notices','GET',undefined,teacherClient)).data;assert.ok(staffFeed.rows.some((n:any)=>n.data.recordId===notice.data.id));
    await request('/notifications/feed','GET',undefined,teacherClient);assert.equal(await db.entry.count({where:{module:'notifications',userId:employee.userId,data:{path:['recordId'],equals:notice.data.id}}}),1,'Polling does not duplicate notices');
    assert.ok(!(await request('/notifications/feed?type=notices','GET',undefined,studentClient)).data.rows.some((n:any)=>n.data.recordId===notice.data.id));
    const future=await request('/records/notices','POST',{title:'Scheduled announcement',body:'For a later day',audience:'Everyone',publishDate:'2099-12-31'});assert.ok(!(await request('/notifications/feed?type=notices','GET',undefined,teacherClient)).data.rows.some((n:any)=>n.data.recordId===future.data.id));
    const snap=(await request('/notifications/feed','GET',undefined,teacherClient)).data;
    const later=await request('/records/homework','POST',{title:'A newer assignment',className:current.className,section:current.section,subject:'Science',dueDate:'2099-12-31',instructions:'New update after the inbox snapshot'},teacherClient);assert.equal(later.status,201);
    assert.equal((await request('/notifications/read-all','POST',{before:snap.asOf},teacherClient)).status,200);assert.equal((await request('/notifications/summary','GET',undefined,teacherClient)).data.unread,1,'Mark all does not consume updates arriving after the displayed snapshot');
    const latest=(await request('/notifications/summary','GET',undefined,teacherClient)).data;
    await request('/notifications/read-all','POST',{before:latest.asOf},teacherClient);assert.equal((await request('/notifications/summary','GET',undefined,teacherClient)).data.unread,0);
    assert.equal((await request('/notifications/feed?page=0','GET',undefined,teacherClient)).status,400);
    const privateOwner=await db.user.findUniqueOrThrow({where:{email:'student@test.example'}});assert.equal((await request('/notifications/summary','GET',undefined,studentClient)).data.unread,await db.entry.count({where:{module:'notifications',userId:privateOwner.id,status:'Unread',archived:false}}));
  });
  await t.test("password changes, archive and revocation", async () => {
    assert.equal(
      (
        await request(
          "/auth/password",
          "POST",
          { current: "wrong", password: "new-password-12345" },
          studentClient,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/auth/password",
          "POST",
          { current: "family-password-12345", password: "new-password-12345" },
          studentClient,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`/students/${student.id}`, "DELETE")).status,
      200,
    );
    assert.equal(
      (await request("/auth/me", "GET", undefined, studentClient)).status,
      401,
    );
    assert.equal(
      (await request("/auth/logout", "POST", {}, admin)).status,
      200,
    );
    assert.equal(
      (await request("/auth/me", "GET", undefined, admin)).status,
      401,
    );
  });
});
