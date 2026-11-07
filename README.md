# Open Mind's Public School

A working school website and ERP built with React, TypeScript, Express, Prisma and PostgreSQL. The public website follows the supplied playful education reference: lavender backgrounds, purple and coral accents, editorial serif headings, original cutout portraits, learning programs and activity cards. The homepage includes downloadable activity guides, a working three-question quiz, school-life links, published notices and role-specific portal shortcuts. The admin overview includes a school illustration, interactive weekly calendar, linked record totals, fee and attendance summaries, a notice board, and searchable workspace categories. Vehicles, Routes, Transport, Inventory, Purchases and Delivery log are hidden from portal navigation and dashboard shortcuts; existing records remain stored. The sign-in screen keeps its green visual theme. Signed-in dashboards use a shared white, lavender and violet palette, with a purple sidebar, rounded white cards and dark headings across all seven role portals.

## Open the local application

The preview uses **http://127.0.0.1:5173/**. Choose **School portal → Create administrator account** for first-time local setup. There are no default passwords, fake school statistics or seeded student records.

Direct sign-in pages:

- Super Admin: http://127.0.0.1:5173/#/login/admin
- Principal: http://127.0.0.1:5173/#/login/principal
- Teacher: http://127.0.0.1:5173/#/login/teacher
- HR: http://127.0.0.1:5173/#/login/hr
- Fees & Accounts: http://127.0.0.1:5173/#/login/accounts
- Student: http://127.0.0.1:5173/#/login/student
- Employee: http://127.0.0.1:5173/#/login/employee


The green split-screen login uses an original generated 3D illustration. Each role opens its own dashboard and navigation. Students can sign in with their email or admission number; employees can use their email or employee ID. Selecting a portal does not grant a role: the server checks the account’s assigned access. Legacy `#/portal` links redirect to the account’s workspace.

Student and employee records create activation links for administrators to share privately. **Forgot password** creates an account recovery request; administrators open **Account recovery**, issue a reset link, share it privately, and mark the request resolved. This does not automatically send an email. Students can read assignment instructions and submit written work with an optional PDF/image; authorized teachers can view submitted attachments and provide feedback.

From this directory, after a fresh installation:

```sh
npm ci
npm run db:start
```

Keep the database terminal running. In another terminal:

```sh
npm run db:generate
npm run db:migrate
npm run dev
```

`db:start` runs a project-local PostgreSQL instance on `127.0.0.1:55432`. It creates a random database password, stores it in the ignored `data/` directory, and prepares the ignored `.env` file. No system database account or service is installed. Stop it with Ctrl+C; its data persists.

For an existing PostgreSQL server, set `DATABASE_URL` in `.env` instead and skip `db:start`.

The optional `db:local` script is the original SQLite fallback, with a separately generated schema. Do not run it against a PostgreSQL `.env`. PostgreSQL is the configured and tested default.

## Implemented workflows

| Area                 | Working features                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public website       | Responsive homepage, school/academics/facilities/admissions/contact pages, gallery, notices/events, careers/downloads/policy pages; genuine saved admission enquiries and private application tracking                                          |
| Authentication       | Administrator bootstrap, bcrypt passwords, database sessions, HTTP-only cookies, CSRF checks, login throttling/account lockout, single-use account activation/reset links, password changes and session revocation                              |
| Access               | Seven role portals; thirteen base roles; editable role profiles; server-enforced No access/View/Manage permissions; own student records, assigned teacher classes and restricted payroll                                                                          |
| Students and guardians | Registration, automatic admission numbers, guardian contact linkage including siblings, student-only activation links, personal/guardian/academic details, search, class/session filters, edit, archive, promotion with enrollment history, profile/ID/report-card PDF |
| Employees            | Registration, automatic employee IDs, activation, personal/professional/bank details, restricted salary data, edit/archive and department records                                                                                               |
| Attendance           | Class/date filters, per-person statuses, bulk marking, duplicate-proof daily upserts, own check-in/out and work-hour history, CSV/PDF reports                                                                                                   |
| Fees                 | Fee structures, class/session assignment with duplicate billing-period protection, invoices, offline collections, concessions/scholarships, completed offline refund recording, ledgers, receipts and outstanding balances                      |
| Online payments      | Optional Razorpay order creation, server-verified signatures, fetched captured status/amount/currency, signed raw-body webhooks, idempotent reconciliation and a reconciliation-required state for exceptional overpayments                     |
| Academics            | Class/session/section/subject setup and teacher assignment; timetable with teacher, room and class overlap checks                                                                                                                               |
| Examinations         | Exam creation, scoped mark entry, range validation, publication control, configurable grade thresholds and PDF report cards                                                                                                                     |
| Homework             | Class assignments, deadlines, student submissions, attached document IDs, teacher feedback and scores                                                                                                                                           |
| HR and payroll       | Basic pay, per-month allowances/deductions, unique monthly payroll, draft/review/approval, employee payslip PDF                                                                                                                                 |
| Leave                | Student/employee requests, date validation, approval/rejection, own-request isolation and prevention of self-approval                                                                                                                    |
| Library              | Catalogue, copies/available stock, issue/return, due dates, configurable per-book daily late fines and stock checks                                                                                                                             |
| Transport            | Vehicles, drivers, maintenance dates, routes/stops/fees, student assignments and vehicle capacity checks                                                                                                                                        |
| Inventory            | Asset/vendor records, minimum stock values, stock in/out with movement history and negative-stock prevention, purchase records                                                                                                                  |
| Communication        | Audience-filtered/scheduled in-app notices, events, explicit email/SMS sends when providers are configured, provider acceptance/failure logs                                                                                                    |
| CMS                  | Public page titles/body text and publishing of school notices/events                                                                                                                                                                            |
| Files                | Authenticated PDF/JPEG/PNG upload, 5 MB limit, file signature checks, own/admin download access                                                                                                                                                 |
| Reports              | Search and pagination, CSV/Excel exports, student/employee Excel import with per-row validation/results, PDF module reports, receipts, payslips and report cards                                                                                |
| Administration       | User creation, role changes, activation/deactivation, reset link generation, audit history                                                                                                                                                      |

All these workflows use the database. Browser storage is not used as the system of record. Money is stored as integer paise. External services are not simulated as successful when credentials are missing.

## Flowchart setup

The supplied ERP flowchart is implemented through seven workspaces. **Parent Portal is removed:** legacy parent sign-ins/sessions are denied and no parent activation links are issued. Guardian names, email and sibling associations remain in student records.

| Workspace | Connected modules |
| --- | --- |
| Super Admin | Students, employees, academics, school configuration, user roles, module permissions, CMS, reports and audit history |
| Principal | Student and employee assessments, progress/behaviour, department and academic analytics, staff appraisals, school reports and approvals |
| Teacher | Assigned classes/subjects, student progress, attendance, homework/submissions, marks entry and examination approval requests |
| HR | Employee records/documents, recruitment stages, one-time onboarding with activation link, payroll drafts, appraisals and departments |
| Fees & Accounts | Fee structures/assignment, invoices, Cash/UPI/bank/cheque collection requests, payment verification, receipts/ledger and financial analytics |
| Student | Own profile, fees/receipts, attendance, published results, timetable, homework and submissions |
| General Employee | Personal dashboard, approved payslips, leave, attendance, documents, work reports and explicitly delegated operational modules |

**Approval workflow:** create a record → submit from its module → another authorized reviewer opens **Approval workflow → View & review** → add a comment and approve/reject. Examination publication, payroll, leave, assessments, appraisals, school/work reports and manual payment verification share this queue. Requests include a source snapshot and reviewer history; self-approval and stale/duplicate decisions are blocked. Approved assessments are locked. Rejected assessments/reports can be edited and resubmitted. Rejected leave needs a new request. Cancel a pending request before editing its source.

Manual collections do not enter the ledger until verified. A verified payment generates its receipt and notifies the student. Automated Razorpay captures retain server-side gateway verification and do not require a separate manual approval.

**Connected notifications:** every portal has an account-specific inbox and a header bell with an unread badge and five recent updates. The inbox supports search, category and read/unread filters, date grouping, pagination and marking one or all updates as read. Opening an update marks it read and links to its source record, where the server still enforces the user's current permissions. The bell and inbox refresh together after changes, on returning to the browser tab and every 20 seconds while visible. Background polling is excluded from staff activity counts.

In-app updates cover student/employee record changes, account-access changes, class assignments, timetable changes, homework and submissions/feedback, attendance marking, individual invoices, verified manual payments, published examination results, approved payslips, leave/work reports, approval requests/decisions, progress/library records and school-calendar changes. Students receive class-matched or own-record updates. Published Everyone/Students/Employees notices are delivered to the matching portal audience when the inbox refreshes; future-dated notices wait until their publish date in IST and repeat polling does not duplicate them. These are in-app updates; they do not automatically send email, SMS or browser push notifications.

**Recruitment:** HR adds a candidate, records interviews, moves the stage to **Offer**, and chooses **Onboard employee**. The system creates a single linked employee account and provides an activation link for private sharing.

**Permissions:** Super Admin opens **Roles & permissions**, selects a base role, names a profile, and chooses No access/View/Manage for its modules. Assign it to a school member below the matrix. Assignment revokes that member’s sessions; they sign in again. A base role preserves its record scope. Operational modules can be delegated to employees; identity, finance and approval authority require a suitable base role. Student profiles cannot gain staff access. Super Admin access cannot be downgraded through this form.

**Initial configuration:** use the existing Super Admin account; add employee records for the Principal, HR and Accountant and assign their base roles in **Users & access**. Configure the school name/contact details and default academic session in **Settings**. Link teachers in **Academic setup**. Add student records and share student activation links. A second authorized reviewer is required for approvals; the system does not create default staff passwords or invent school records.

Notifications are private in-app updates with read/unread state. Central analytics use current scoped attendance, fees, examinations and department records. All new records are persisted in PostgreSQL using the existing validated Entry/Configuration models; no destructive migration is needed.

## Admin activity and account credentials

Open **Employees** in the admin sidebar, or use **Add employee** on the admin overview. **Create employee & login** creates a linked account and shows the generated password once, with email, employee ID, the correct role portal link, and copy/download controls. Teacher designations get the Teacher portal; other new employees get the Employee portal. Super Admin can use **Generate login credentials** inside an employee profile to replace an existing password and revoke its sessions/reset links. New credential generation rejects an email that already has a school login instead of silently linking it. Existing employee records linked to administrator accounts display **Create separate employee login**: enter an unused email to retain the employee ID and generate an independent role-correct login without changing administrator credentials. Imported records retain the activation-link flow. Generated passwords are hashed in storage and omitted from activity logs. The employee directory supports name/email/ID search, department filtering, and profile cards. Select a card to see contact and employment details plus that employee’s account-scoped activity stream, date/type/outcome filters, record audit, event details, and CSV export. Activity access remains restricted to Super Admin; an employee with no recorded actions shows an empty state.

Open **Super Admin → Activity log** for a searchable, paginated activity stream. Filters cover person, role, date range, activity type and outcome. The dashboard shows recorded actions, people with successful activity, record updates, blocked/failed requests, event details, and CSV export of the visible page. Auto-refresh runs every 30 seconds.

**Staff overview** shows successful actions in the selected view, the last recorded portal activity, active/inactive account state, and today's recorded attendance. No portal activity is not evidence that someone is absent or not working. **Record audit** preserves earlier business audit history. Detailed request tracking begins when this feature is enabled; it cannot reconstruct previous page views.

Tracking covers sign-in attempts, sign-out, portal navigation, data reads, uploads/downloads, changes, attendance check-in/out, approvals, financial actions, access changes and errors after account identification. Routine background summary/poll requests are excluded from activity counts. Activity values are allowlisted; passwords, tokens, cookies, signatures, attachment contents and session credentials are not stored. Access is restricted to Super Admin. These are operational database logs, not a claim of tamper-proof archival storage or monitoring outside the school application.

In **Users & access**, Super Admin can create Teacher/Student/staff logins and use **Set password** on existing active accounts. Admin-issued passwords require at least 8 characters; self-service creation/change still uses the 12-character policy. Resetting credentials revokes existing sessions and activation/reset links. Existing passwords are never readable. Register full student records through Students; assign teachers to their classes through Academic setup. An existing staff login can be linked to an employee record with the same email by Super Admin without resetting its password or role.

## Scope and release status

This is a functional implementation across the main school ERP modules, **not a claim that every detailed item in the master prompt is complete or that a production security audit has been performed**.

The following requested capabilities still need additional implementation or school-specific decisions:

- Comprehensive CMS editing of every homepage section, photo/video gallery management, banners and SEO. Current CMS edits page titles/body text, notices and events.
- Online application document workflows beyond enquiry and status tracking; account-linked document folders and cloud object storage.
- QR/biometric attendance, breaks/late/early rules, attendance correction approval and automatic absence messaging.
- Automatic payroll tax/PF/ESI, statutory rules, leave accrual/balances/deduction integration and formal leave policies. Payroll amounts are explicitly reviewed by school staff.
- Automated fee penalties, reminder campaigns, financial-period closing and gateway refund reconciliation. Offline refund recording is implemented; gateway payments cannot be incorrectly refunded through that endpoint.
- WhatsApp, live GPS, digital signatures and automated notification delivery webhooks.
- A richer academic model with historical class membership for past timetables/homework, subject-level report-card ranks, examination schedules/calendar exports and bulk marks import.
- Fully normalized standalone tables for every secondary module. Core finance/identity/student/staff/exam data is relational; secondary modules use validated `Entry` records with transactional application-level reference checks.
- Large-scale server-side search/pagination, deployment observability, scheduled backups and load/security testing.

Do not deploy this build as a finished replacement for all school administration processes without completing the applicable gaps and validating school policies.

## First use

1. Create the administrator through **School portal** in local development. In production, run the bootstrap command below; browser setup is disabled.
2. Add employees. Teacher/Class Teacher employees receive teaching roles; other employees start with Employee access. Super Admin can assign additional operational roles.
3. Add academic class/section/session records and select their class teacher. This determines teacher access to students.
4. Register students. Student activation links appear once and expire after 24 hours. Share each privately with its recipient. No email is sent automatically.
5. Set fee structures and assign each billing period to a class; create any individual invoices as needed.
6. Enter timetable, assignments, notices, examinations and operational records.

Use the same class/section/session spelling across records. A parent email can link multiple children; student and parent email addresses must differ. Existing parent emails cannot be silently reassigned through the student edit form.

Excel imports use the provided template headers. Up to 500 rows / 2 MB are accepted. Rows are saved individually and failures are listed; a partially successful import is not rolled back. Copy activation links before closing the import result.

## Build and verification

```sh
npm run build
npm test
npm run test:browser
```

- Build performs TypeScript checking and produces the frontend in `dist/`.
- API tests create an isolated PostgreSQL schema, exercise workflows and access restrictions, then drop that schema. They do not insert sample records into the actual school database.
- Browser tests use another isolated schema and a local server. The current script uses the installed macOS Google Chrome path. Adjust `executablePath` for another platform.
- Browser screenshots are generated in ignored `test-results/`.
- Payment tests mock the external gateway only. Real test-mode/live Razorpay payments and email/SMS delivery require provider credentials and have not been exercised.
- The on-demand Excel library is a large separate chunk; the main website does not download it until import/export is used.

## Production deployment

The app requires a persistent Node.js server, PostgreSQL and persistent uploads. The Sites static/Worker runtime cannot directly host this local PostgreSQL process and Express service, so no public deployment has been claimed. Docker deployment files are supplied; they have not been run in this environment because Docker is unavailable.

On a suitable server with Docker and a domain pointing to it:

```sh
cp .env.production.example .env.production
# Fill in the domain, a strong alphanumeric database password,
# the initial administrator email/password, and optional provider settings.
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production exec app npm run seed
```

Caddy terminates HTTPS. The database is not exposed to the host network. Production cookies are `Secure`; production sign-in requires HTTPS. Remove bootstrap credentials from the deployment environment after administrator creation. `seed` refuses to overwrite an existing installation.

For deployment without Docker:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run seed
NODE_ENV=production npm start
```

Provide a production `DATABASE_URL`, `APP_ORIGIN` and HTTPS reverse proxy. The default production HTTP port is 3001. Keep uploads on a durable private disk and back up both uploads and PostgreSQL. Do not serve the upload directory directly.

Example database backup in the Docker deployment:

```sh
mkdir -p backups
docker compose --env-file .env.production exec -T db pg_dump -U school -Fc openmind > backups/openmind.dump
```

Test restoring backups into an isolated database before relying on them. Retention and scheduling must be chosen by the school.

## Optional integrations

### Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Configure a `payment.captured` webhook at:

```text
https://YOUR_DOMAIN/api/payments/webhook
```

The checkout appears only when all three values exist. The server creates the amount from the outstanding ledger, validates the signature, fetches the payment from Razorpay and verifies captured status, order ID, amount and INR currency. Replayed verification/webhooks do not duplicate receipts. A captured payment exceeding the current balance is retained in `GatewayOrder` as `Reconciliation required` for an administrator to investigate; it is not silently added as a second collection.

See the [Razorpay payment verification reference](https://github.com/razorpay/razorpay-go/blob/master/documents/paymentVerification.md).

### Email and SMS

Email uses `RESEND_API_KEY` and a verified `EMAIL_FROM`. SMS uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM`. Administrators explicitly choose a recipient/channel and send from Communication. Provider acceptance is recorded as acceptance, not guaranteed delivery. A timeout is recorded as unconfirmed; check provider logs before retrying.

These integrations are optional and credentials stay server-side. See the [Resend email API](https://resend.com/docs/api-reference/emails/send-email) and [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource).

## Project layout

```text
src/                 Public website, portal screens, forms, charts and styles
server/              Express routes, sessions, permissions, workflows and reports
shared/              Field definitions, role lists and default public content
prisma/              PostgreSQL schema, migrations and administrator bootstrap
scripts/             Local PostgreSQL and isolated test runners
tests/               API integration and browser tests
public/images/       Local stock imagery and source attribution
```

The images are illustrative stock photographs, not verified photographs of Open Mind's Public School. Replace them with authorized school images before public launch. No student counts, achievements, affiliations, testimonials or principal identities have been invented. School contact details, confirmed class availability, fees and reviewed privacy/terms copy must be supplied by the school.

API route and permission documentation is in [API.md](API.md).

Student registration is available to Super Admin, School Admin, Principal, HR Manager, Teacher, Class Teacher and the existing Receptionist role. Teachers retain access to their assigned classes and students they registered. Student removal is archive-only and restricted to Super Admin, School Admin and Principal; it disables the student login and revokes sessions and reset links while preserving history. HR and teachers cannot edit or archive student records through the UI or API.
