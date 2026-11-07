# School API

All paths below are prefixed by `/api`. JSON writes require `Content-Type: application/json` and `X-School-Request: 1`. Authenticated writes additionally require `X-CSRF-Token` returned by sign-in or `/auth/me`. The session cookie is HTTP-only and must accompany authenticated requests. Do not store passwords or session cookies in frontend persistent storage.

Errors use `{ "error": "human-readable explanation" }`. Common responses: `400` validation, `401` sign-in required, `403` permission denied, `404` missing/inaccessible record, `409` duplicate/conflict/concurrent mutation, `413` oversized request, `429` throttled, `503` integration not configured.

## Public and identity routes

| Method | Route               | Behavior                                                                        |
| ------ | ------------------- | ------------------------------------------------------------------------------- |
| GET    | `/health`           | Database readiness                                                              |
| GET    | `/public`           | Public pages, published public notices and events                               |
| GET    | `/setup`            | Whether empty local installation needs setup                                    |
| POST   | `/setup`            | Local-only first admin: name, email, password; disabled in production           |
| POST   | `/admissions`       | Save childName, parentName, email, phone, className, message; returns reference |
| POST   | `/admission-status` | Requires reference and matching email                                           |
| POST   | `/auth/login`       | Email or identifier/password, optional portal; returns user permissions and CSRF; sets session cookie           |
| POST   | `/auth/reset`       | Single-use activation/reset token and new password                              |
| GET    | `/auth/me`          | Current safe user and CSRF token                                                |
| POST   | `/auth/logout`      | Delete current session                                                          |
| POST   | `/auth/password`    | Verify current password, change password and revoke other sessions              |

Self-service password creation/change requires 12–128 characters. Super Admin can issue an initial or replacement password of 8–128 characters. Account activation/reset tokens expire after 24 hours; sessions expire after 8 hours. Failed login attempts are throttled and repeated account failures trigger a temporary lock.

## School records

| Methods     | Route               | Access/workflow                                                      |
| ----------- | ------------------- | -------------------------------------------------------------------- |
| GET, POST   | `/students`         | Scoped reads; admin/receptionist registration with linked accounts   |
| PUT, DELETE | `/students/:id`     | Validated edits; admin soft archive and student-account deactivation |
| POST        | `/students/promote` | Admin; studentIds, className, section, session; retains history      |
| GET, POST   | `/employees`        | Own/admin/HR reads; admin/HR registration                            |
| PUT, DELETE | `/employees/:id`    | Admin/HR edit/archive; no salary exposure through directory          |
| GET         | `/directory`        | Name, ID and designation only                                        |
| GET, POST   | `/users`            | Admin list; Super Admin create                                       |
| PATCH       | `/users/:id`        | Super Admin role/active flag; prevents changing own access           |
| POST        | `/users/:id/invite` | Authorized admin creates one-time activation/reset token             |
| GET         | `/dashboard`        | Aggregates computed from authorized database records                 |
| GET         | `/audit`            | Super Admin audit history                                            |

Student fields: `name,email,dob,gender,className,section,session,parentName,parentEmail,phone,address,details`. Employee fields: `name,email,phone,department,designation,joiningDate,qualification,salary,details`. Input currency is rupees; persisted values and API financial responses are paise. `details` contains optional profile metadata. Direct salary and bank information are restricted to the relevant employee and authorized management roles.

## Attendance and academics

| Methods   | Route                               | Behavior                                                                           |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| GET       | `/attendance?date=YYYY-MM-DD`       | Scoped register                                                                    |
| POST      | `/attendance`                       | date, period, records[{studentId OR employeeId,status}]; unique person/date/period |
| POST      | `/attendance/check`                 | Own employee check-in/out; action `in` or `out`                                    |
| GET       | `/attendance/self`                  | Own employee attendance history                                                    |
| GET, POST | `/exams`                            | Scoped list and authorized creation                                                |
| POST      | `/exams/:id/marks`                  | studentId, score, remarks; assigned class and max-mark validation                  |
| PATCH     | `/exams/:id`                        | Legacy route returns 409; submit type `exam` to approval workflow                                    |
| GET, PUT  | `/configuration/grading`            | Read bands; admin writes unique label/minimum percentage thresholds                |
| POST      | `/records/submissions/:id/feedback` | Authorized teacher/admin score and feedback                                        |

Supported attendance values: Present, Absent, Late, Half Day, Leave. Future attendance is rejected. An existing marking is updated rather than duplicated.

## Finance and payroll

| Methods   | Route                               | Behavior                                                                                                 |
| --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET, POST | `/fees`                             | Scoped invoices; admin/accountant issue invoices                                                         |
| POST      | `/fees/:id/payment`                 | Legacy route returns 409; use `/fees/:id/payment-requests` and approval workflow                      |
| POST      | `/fees/:id/concession`              | Amount and reason; cannot reduce below net collections                                                   |
| POST      | `/payments/:id/refund`              | Record completed offline refund; amount/reason/unique reference; bounded by unrefunded payment           |
| POST      | `/records/feeStructures/:id/assign` | Due date and billing period; create invoices for matching class/session once                             |
| GET, POST | `/payroll`                          | Authorized payroll list/generation; employeeId, month, allowances, deductions                            |
| PATCH     | `/payroll/:id`                      | Legacy route returns 409; submit type `payroll` to approval workflow                                                                       |
| GET       | `/integrations`                     | Whether payment/email/SMS configuration is available; no secret values                                   |
| POST      | `/fees/:id/order`                   | Create Razorpay order for server-calculated balance                                                      |
| POST      | `/payments/verify`                  | Validate checkout signature and independently fetch captured payment                                     |
| POST      | `/payments/webhook`                 | Raw JSON body with valid `X-Razorpay-Signature`; intentionally uses gateway HMAC instead of session CSRF |

Manual collection methods: Cash, UPI, Bank transfer, Cheque. Non-cash collections require a transaction reference. A second reviewer verifies settlement before a receipt is issued. Online success is not accepted from the browser alone. Gateway refund processing is intentionally not exposed through the offline refund endpoint.

## Secondary modules

`GET/POST /records/:module`, `PUT/DELETE /records/:module/:id` provide validated reads/creation/edit/soft archive where applicable. Field definitions and write-role permissions are shared in `shared/modules.ts`. Server-side checks remain authoritative.

Modules: academics, timetable, homework, submissions, leave, library, loans, vehicles, routes, transport, inventory, purchases, notices, events, departments, feeStructures, admissions.

Special workflows:

- `PATCH /records/admissions/:id` changes the admission status.
- `PATCH /records/leave/:id` is retired (409); submit type `leave` through the approval queue.
- `PATCH /records/loans/:id` records return date and calculated late fine.
- `POST /records/inventory/:id/movement` records direction In/Out, integer quantity and reason atomically.
- `GET /reports-data/stockMovements` exposes admin stock history.
- `GET /reports-data/enrollmentHistory` exposes scoped enrollment history.

Timetable periods reject teacher, room and class overlaps. Library issues enforce available copies; routes require valid vehicles; transport assignments enforce capacity and prevent duplicate student assignment. Scheduling uses local ISO date/time strings; no GPS or biometric provider is assumed.

## CMS, messages, files and exports

| Methods   | Route                        | Behavior                                                      |
| --------- | ---------------------------- | ------------------------------------------------------------- |
| GET       | `/cms`                       | Admin editable page title/body records                        |
| PUT       | `/cms/:id`                   | Admin update/upsert page                                      |
| POST      | `/communications/send`       | Admin explicitly submits channel, recipient, subject and body |
| GET       | `/delivery-logs`             | Admin provider acceptance/failure history                     |
| GET, POST | `/documents`                 | List authorized documents / upload multipart `file`           |
| GET       | `/documents/:id`             | Download own or admin-authorized file                         |
| GET       | `/reports/receipt/:id`       | Scoped fee receipt PDF                                        |
| GET       | `/reports/student/:id`       | Scoped student profile PDF                                    |
| GET       | `/reports/idcard/:id`        | Scoped student ID PDF                                         |
| GET       | `/reports/reportcard/:id`    | Scoped published examination marks and grade PDF              |
| GET       | `/reports/payslip/:id`       | Authorized payslip PDF                                        |
| GET       | `/exports/:module.pdf?q=...` | Authorized PDF report; optional text search                   |

Uploads accept JPEG, PNG or PDF only, require matching file signatures, and are capped at 5 MB. Stored names are generated; original filenames never determine storage paths. Documents are not served from a public static folder.

CSV/Excel exports and Excel parsing occur in the browser, using the records returned by these protected APIs. Imports submit each row through the normal validated registration route and report partial success explicitly.

## Dedicated role portals

`POST /api/auth/login` accepts `{identifier, password, portal}`. Identifier can be email, student admission number or employee number. Portal is `admin`, `student`, `employee` or `parent` and must match the server-assigned role. Existing `{email,password}` clients remain supported.

`GET /api/portal-summary` returns the authenticated member’s dashboard: linked student records, attendance, scoped school updates, authorized financial records and the employee’s own approved payslips.

`POST /api/auth/recovery` accepts `{identifier}` and returns the same generic response for known and unknown accounts. Known active accounts receive a pending administrator request without revealing existence to the caller. Admins list `/api/records/accessRequests`, issue the existing `/api/users/:id/invite` link, and `POST /api/access-requests/:id/resolve`.


## Flowchart roles, permissions and review workflows

Portal values: `admin`, `principal`, `teacher`, `hr`, `accounts`, `student`, `employee`. The server validates the selected portal against the stored role. Parent authentication is disabled; guardian contact records remain internal.

| Methods | Route | Behavior |
| --- | --- | --- |
| GET, PUT | `/school-settings` | Read school details; Super Admin saves name, code, academicSession, email, phone and address; session defaults new forms and name appears on individual PDF reports |
| GET | `/workspace-summary` | Permission-filtered counts, own employee essentials and recent authorized requests |
| GET | `/analytics` | Scoped class attendance, departments, academic summaries and authorized financial totals |
| GET | `/permission-catalog` | Super Admin: module names, base roles, defaults and allowed operational delegations |
| GET, POST | `/role-profiles` | Super Admin list/create `{name,baseRole,permissions:{module:"none"|"view"|"manage"}}` |
| PUT | `/role-profiles/:id` | Edit name/permissions; base role immutable |
| POST | `/users/:id/access` | Assign `{roleId}` or null for default base-role permissions; revoke member sessions |
| GET | `/workflow` | Reviewers see authorized requests; submitters see their own |
| POST | `/workflow/submit` | `{type,entityId}`: source snapshot, duplicate-pending guard, audit and notifications |
| POST | `/workflow/:id/cancel` | Submitter cancels own pending request |
| POST | `/workflow/:id/decide` | Authorized independent reviewer; `{decision:"Approved" or "Rejected",comment}`; atomic source update |
| GET | `/payment-verifications` | Accounts/management collection records and receipt references |
| POST | `/fees/:id/payment-requests` | `{amount,method,reference}`; amount rupees, draft collection, no ledger write |
| POST | `/recruitment/:id/onboard` | HR/management; Offer stage; `{joiningDate,qualification,salary}`; one-time employee creation and activation token |
| GET | `/notifications` | Own notifications only |
| GET | `/notifications/summary` | Own unread/total counts, latest five updates and snapshot time |
| GET | `/notifications/feed` | Own inbox; `status=All/Unread/Read`, `type=module`, `q`, `page`; 20 updates per page |
| POST | `/notifications/:id/read` | Mark own notification read |
| PATCH | `/notifications/:id/state` | `{status: "Read" or "Unread"}`; own notification only |
| POST | `/notifications/read-all` | `{before: ISO timestamp}`; mark own unread updates through the displayed snapshot |

Additional generic modules: `progress`, `studentAssessments`, `employeeAssessments`, `appraisals`, `recruitment`, `workReports`, `schoolReports`. Their field schemas are in `shared/modules.ts`.

Approval types: `exam`, `payroll`, `leave`, `studentAssessments`, `employeeAssessments`, `appraisals`, `schoolReports`, `workReports`, `paymentVerifications`. Reviewers need manage access to approvals; Accountants can review only manual payments. Submitters need manage access to the source module and its records. No user can decide their own request. Changed source fingerprints and duplicate decisions return 409. Approved exams and pending exam reviews lock marks. Manual payment approval rechecks the outstanding balance transactionally before creating a receipt.

The module permission check runs before route handlers, including exports and receipt/report/payslip downloads. Record scope is enforced separately. Permission-profile edits take effect server-side on the next request; assigning a profile also revokes sessions. `GET /auth/me` includes effective `permissions`, `accessRole`, and `accessRoleId`.


## Administrator activity centre

- `GET /activity`: Super Admin only. Query: `q`, `actor` (user ID), `role`, `category`, `outcome`, `from`, `to`, `page`, `source=activity|history`. Dates use IST; default range is seven days; 40 events per page. Returns scoped rows, total, staff activity/attendance summaries and member filter options. Historical business audit events remain accessible through `source=history`.
- `POST /portal-events`: authenticated `{module,action?:"navigate"|"export"}`; server verifies that the member can access the section. These navigation events are client-reported; record mutations and request outcomes are server-observed.
- `POST /users/:id/password`: Super Admin sets `{password}` (8–128 characters) for another active school account; deletes existing sessions and reset tokens. Self-service passwords retain their existing 12-character policy.

Detailed activity is stored in private Entry records (`module=activity`). No schema migration is required. Logs include actor identity/role, action, module, target label, safe submitted fields/values, request method/path, outcome/status, duration and timestamp. Do not use activity counts as an employee productivity score. An absence of actions means only that no matching portal actions were recorded. Routine summaries/polls are excluded. Credential material and raw request payloads are not stored. Request logging is best-effort on response completion; database failures are reported to server logs. Automated tests flush pending writes before cleanup, and use a higher global request-rate ceiling only in `NODE_ENV=test` for multi-role regression runs; production limits are unchanged.
