import {NotificationBell,NotificationCenter} from './NotificationCenter';
import {EmployeeCredentials} from './EmployeeCredentials';
import {EmployeeDirectory} from './EmployeeDirectory';
import {AdminDashboard} from './AdminDashboard';
import {ActivityDashboard} from './ActivityDashboard';
import {WorkspaceDashboard,FlowPanel,SchoolSettings} from './FlowWorkspace';
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  UserRound,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Wallet,
  FileCheck,
  NotebookPen,
  BriefcaseBusiness,
  CalendarClock,
  Library,
  Bus,
  Boxes,
  Megaphone,
  BarChart3,
  Globe,
  ShieldCheck,
  Settings,
  History,
  LogOut,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Archive,
  Check,
  X,
  Menu,
  MoreHorizontal,
  FileText,
  Upload,
  Leaf,
  Copy,
  Clock,
  Receipt,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { api, rupees, today } from "./api";
import {canAccessModule,portalForRole,canManageModule,portalHome,portalNames,portalTab,studentCreateRoles,studentArchiveRoles,studentEditRoles} from "../shared/portals";
import {MemberDashboard,MemberProfile} from "./MemberDashboard";
import { Brand, Modal } from "./App";
import { modules, admins, roles, type Field } from "../shared/modules";
import "./portal-theme.css";
type Row = Record<string, any>;
const studentFields: Field[] = [
  { key: "name", label: "Full name", required: true },
  { key: "email", label: "Student email", type: "email", required: true },
  { key: "dob", label: "Date of birth", type: "date", required: true },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: ["Female", "Male", "Other"],
    required: true,
  },
  { key: "className", label: "Class", required: true },
  { key: "section", label: "Section", required: true },
  { key: "session", label: "Academic session", required: true },
  { key: "parentName", label: "Parent / guardian name", required: true },
  { key: "parentEmail", label: "Parent email", type: "email", required: true },
  { key: "phone", label: "Parent phone", type: "tel", required: true },
  { key: "address", label: "Address", type: "textarea", required: true },
];
studentFields.push(
  ...[
    { key: "details.fatherName", label: "Father’s name" },
    { key: "details.motherName", label: "Mother’s name" },
    { key: "details.bloodGroup", label: "Blood group" },
    { key: "details.nationality", label: "Nationality" },
    { key: "details.state", label: "State" },
    { key: "details.district", label: "District" },
    { key: "details.pinCode", label: "PIN code" },
    { key: "details.alternatePhone", label: "Alternate phone", type: "tel" },
    { key: "details.occupation", label: "Parent occupation" },
    { key: "details.previousSchool", label: "Previous school" },
    { key: "details.rollNumber", label: "Roll number" },
    { key: "details.house", label: "House" },
    { key: "details.admissionDate", label: "Admission date", type: "date" },
  ],
);
const employeeFields: Field[] = [
  { key: "name", label: "Full name", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "tel", required: true },
  { key: "department", label: "Department", required: true },
  {
    key: "designation",
    label: "Designation",
    type: "select",
    options: [
      "Teacher",
      "Class Teacher",
      "Employee",
      "Administration",
      "Support",
    ],
    required: true,
  },
  { key: "joiningDate", label: "Joining date", type: "date", required: true },
  { key: "qualification", label: "Qualification", required: true },
  {
    key: "salary",
    label: "Monthly basic salary (₹)",
    type: "number",
    required: true,
  },
];
employeeFields.push(
  ...[
    { key: "details.dob", label: "Date of birth", type: "date" },
    {
      key: "details.gender",
      label: "Gender",
      type: "select",
      options: ["Female", "Male", "Other"],
    },
    { key: "details.address", label: "Address", type: "textarea" },
    { key: "details.emergencyContact", label: "Emergency contact" },
    { key: "details.experience", label: "Experience" },
    {
      key: "details.employmentType",
      label: "Employment type",
      type: "select",
      options: ["Full-time", "Part-time", "Contract"],
    },
    { key: "details.bankAccount", label: "Bank account (restricted)" },
    { key: "details.bankIfsc", label: "Bank IFSC (restricted)" },
    {
      key: "details.leaveAllowance",
      label: "Annual leave entitlement (days)",
      type: "number",
    },
  ],
);
const extraFields: Record<string, Field[]> = {
  fees: [
    { key: "studentId", label: "Student", type: "student", required: true },
    { key: "title", label: "Fee description", required: true },
    { key: "amount", label: "Amount (₹)", type: "number", required: true },
    { key: "dueDate", label: "Due date", type: "date", required: true },
    { key: "session", label: "Academic session", required: true },
  ],
  exams: [
    { key: "name", label: "Examination name", required: true },
    { key: "className", label: "Class", required: true },
    { key: "subject", label: "Subject", required: true },
    { key: "date", label: "Exam date", type: "date", required: true },
    { key: "maxMarks", label: "Maximum marks", type: "number", required: true },
    {
      key: "passMarks",
      label: "Passing marks",
      type: "number",
      required: true,
    },
    { key: "session", label: "Academic session", required: true },
  ],
  payroll: [
    { key: "employeeId", label: "Employee", type: "employee", required: true },
    { key: "month", label: "Payroll month", type: "month", required: true },
    {
      key: "allowances",
      label: "Allowances (₹)",
      type: "number",
      required: true,
    },
    {
      key: "deductions",
      label: "Deductions (₹)",
      type: "number",
      required: true,
    },
  ],
  users: [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    {
      key: "role",
      label: "Role",
      type: "select",
      options: roles,
      required: true,
    },
    {
      key: "password",
      label: "Initial password (8+ characters)",
      type: "password",
      required: true,
    },
  ],
};
const nav = [
  {
    group: "YOUR WORKSPACE",
    items: [
      ["overview", "Overview", LayoutDashboard],
      ["admissions", "Admissions", GraduationCap],
      ["students", "Students", Users],
      ["employees", "Employees", BriefcaseBusiness],
    ],
  },
  {
    group: "LEARNING & CARE",
    items: [
      ["academics", "Academic setup", BookOpen],
      ["timetable", "Timetable", CalendarDays],
      ["attendance", "Attendance", ClipboardCheck],
      ["exams", "Examinations", FileCheck],
      ["homework", "Homework", NotebookPen],
      ["submissions", "Submissions", FileText],
      ["leave", "Leave requests", CalendarClock],
      ["progress", "Student progress", NotebookPen],
      ["studentAssessments", "Student assessments", GraduationCap],
    ],
  },
  {
    group: "SCHOOL OPERATIONS",
    items: [
      ["fees", "Fees & payments", Wallet],
      ["feeStructures", "Fee structures", Receipt],
      ["payroll", "HR & payroll", BriefcaseBusiness],
      ["departments", "Departments", Users],
      ["recruitment", "Recruitment & onboarding", Users],
      ["appraisals", "Employee appraisals", FileCheck],
      ["employeeAssessments", "Employee assessments", ClipboardCheck],
      ["workReports", "Work reports", FileText],
      ["paymentVerifications", "Payment verification", Wallet],
      ["library", "Library", Library],
      ["loans", "Book circulation", BookOpen],
      ["events", "School calendar", CalendarDays],
      ["notices", "Communication", Megaphone],
    ],
  },
  {
    group: "MANAGE",
    items: [
      ["reports", "Reports", BarChart3],
      ["analytics", "Central reports & analytics", BarChart3],
      ["schoolReports", "School reports", FileText],
      ["approvals", "Approval workflow", ClipboardCheck],
      ["notifications", "Notifications", Bell],
      ["permissions", "Roles & permissions", ShieldCheck],
      ["cms", "Website CMS", Globe],
      ["users", "Users & access", ShieldCheck],
      ["accessRequests", "Account recovery", ShieldCheck],
      ["documents", "Documents", FileText],
      ["audit", "Activity log", History],
      ["settings", "Settings", Settings],
    ],
  },
];
function MapPinIcon(p: any) {
  return <Bus {...p} />;
}
const labelFor = (key: string) =>
  (nav.flatMap((g) => g.items).find((i) => i[0] === key)?.[1] as string) || key;
function pathFor(tab: string) {
  return modules[tab]
    ? `/records/${tab}`
    : tab === "parents"
      ? "/users"
      : `/${tab}`;
}
function exportCsv(rows: Row[], name: string) {
  const flat = rows.map((r) =>
    Object.fromEntries(
      Object.entries(r)
        .filter(
          ([k]) => !["passwordHash", "userId", "parentId", "path"].includes(k),
        )
        .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v]),
    ),
  );
  const keys = [...new Set(flat.flatMap(Object.keys))];
  const safe = (v: any) => {
    const s = String(v ?? "");
    return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(
    [
      "\ufeff" +
        [
          keys.map(safe).join(","),
          ...flat.map((r) => keys.map((k) => safe(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-mind-${name}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export function Portal({
  route,
  user,
  onLogout,
}: {
  user: Row;
  route: string;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState(portalTab(location.hash.slice(1))),
    [rows, setRows] = useState<Row[]>([]),
    [stats, setStats] = useState<Row>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [modal, setModal] = useState<Row | null>(null),
    [toast, setToast] = useState(""),
    [revision, setRevision] = useState(0),
    [sidebar, setSidebar] = useState(false),
    [students, setStudents] = useState<Row[]>([]),
    [employees, setEmployees] = useState<Row[]>([]),
    [dateFilter, setDateFilter] = useState(today()),
    [integrations, setIntegrations] = useState<Row>({}),
    [school,setSchool]=useState<Row>({}),
    [sessionFilter, setSessionFilter] = useState("");
  const isAdmin = admins.includes(user.role),
    teacher = ["Teacher", "Class Teacher"].includes(user.role),
    family = ["Student", "Parent"].includes(user.role);
  const kind=portalForRole(user.role);
  const canSee=(key:string)=>canAccessModule(user.role,key,user.permissions);
  const canManage=(key:string)=>canManageModule(user.role,key,user.permissions);
  const operational=["principal","teacher","hr","accounts"].includes(kind);
  const member=!isAdmin;
  const displayLabel=(key:string)=>key==='overview'?`${portalNames[kind]} dashboard`:key==='students'&&family?(user.role==='Parent'?'My children':'My profile'):key==='employees'&&member&&user.role!=='HR Manager'?'My profile':key==='payroll'&&member&&!['HR Manager','Accountant'].includes(user.role)?'My payslips':key==='submissions'&&family?'My submissions':labelFor(key);
  const roleCanAdd = () =>
    tab === "students"
      ? studentCreateRoles.includes(user.role)
      : tab === "employees"
        ? isAdmin || user.role === "HR Manager"
        : tab === "fees"
          ? isAdmin || user.role === "Accountant"
          : tab === "exams"
            ? isAdmin || teacher
            : tab === "payroll"
              ? isAdmin || user.role === "HR Manager"
              : tab === "users"
                ? user.role === "Super Admin"
                : modules[tab]?.fields.length &&
                  modules[tab].roles.includes(user.role) &&
                  !(tab === "submissions" && user.role !== "Student");
  const canAdd=()=>canManage(tab)&&(roleCanAdd()||!!modules[tab]?.fields.length);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 5000);
  };
  const refresh = () => setRevision((r) => r + 1);
  const go = (key: string,recordId?:string) => {
    if(key!==tab){setRows([]);setLoading(true);setError('');}
    location.hash = portalHome(user.role,key)+(recordId?`?record=${encodeURIComponent(recordId)}`:'');
    setTab(key);
    setSidebar(false);
    setQuery(recordId||"");
    setFilter("");
    setSessionFilter("");
    setPage(1);
  };
  useEffect(()=>{if(canSee(tab))void api('/portal-events','POST',{module:tab}).catch(()=>{});},[tab]);
  useEffect(() => {
    const nextTab=portalTab(route);
    if(nextTab!==tab){setRows([]);setLoading(true);setError('');setTab(nextTab);}
    setQuery(new URLSearchParams(route.split('?')[1]||'').get('record')||'');setFilter('');setSessionFilter('');setPage(1);
  }, [route]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setRows([]);
    if(!canSee(tab)){setError('This section is not available in your portal.');setLoading(false);return;}
    const p =
      tab === "overview"
        ? api(operational?"/workspace-summary":member?"/portal-summary":"/dashboard")
        : ["audit","settings", "reports","approvals","notifications","permissions","analytics","paymentVerifications"].includes(tab)
          ? Promise.resolve([])
          : api(
              pathFor(tab) +
                (tab === "attendance" ? `?date=${dateFilter}` : ""),
            );
    p.then((d) => {
      if (live) {
        if (tab === "overview") setStats(d);
        else
          setRows(
            tab === "parents" ? d.filter((u: Row) => u.role === "Parent") : d,
          );
      }
    })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tab, revision, dateFilter]);
  useEffect(() => {
    api("/school-settings").then(setSchool).catch(()=>{});
    api("/integrations")
      .then(setIntegrations)
      .catch(() => {});
    if(canSee('students'))api("/students").then(setStudents).catch(()=>{});
    else setStudents([]);
    api("/directory")
      .then(setEmployees)
      .catch(() => {});
  }, [revision]);
  async function action(url: string, method = "POST", body?: any) {
    try {
      await api(url, method, body);
      notify("Saved successfully.");
      setModal(null);
      refresh();
    } catch (e: any) {
      notify(e.message);
    }
  }
  const filtered = rows.filter(
    (r) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) &&
      (!filter ||
        (r.status || r.role || r.className || r.data?.className) === filter) &&
      (!sessionFilter || (r.session || r.data?.session) === sessionFilter),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const shown = filtered.slice(
    (Math.min(page, pages) - 1) * 8,
    Math.min(page, pages) * 8,
  );
  const filters = [
    ...new Set(
      rows
        .map((r) => r.status || r.role || r.className || r.data?.className)
        .filter(Boolean),
    ),
  ];
  const addEmployee = () => setModal({type:'form',title:'Add employee',fields:employeeFields,endpoint:'/employees',module:'employees',defaults:{joiningDate:today()}});
  const add = () => tab === "submissions" ? setModal({type:"submit",title:"Submit an assignment"}) :
    setModal({
      type: "form",
      title: `Add ${tab === "students" ? "student" : tab === "employees" ? "employee" : tab === "fees" ? "fee invoice" : tab === "exams" ? "examination" : tab === "payroll" ? "payroll" : tab === "users" ? "user" : modules[tab]?.singular.toLowerCase()}`,
      fields:
        tab === "students"
          ? studentFields
          : tab === "employees"
            ? employeeFields
            : extraFields[tab] || modules[tab]?.fields,
      endpoint: pathFor(tab),
      defaults: {
        session: school.academicSession||`${new Date().getFullYear()}–${new Date().getFullYear() + 1}`,
        section: "A",
        allowances: 0,
        deductions: 0,
        quantity: 1,
        minimum: 2,
        maxMarks: 100,
        passMarks: 33,
        date: today(),
        publishDate: today(),
      },
    });
  function edit(r: Row) {
    setModal({
      type: "form",
      title: `Edit ${modules[tab]?.singular || tab.slice(0, -1)}`,
      fields:
        tab === "students"
          ? studentFields
          : tab === "employees"
            ? employeeFields
            : modules[tab]?.fields,
      endpoint: `${pathFor(tab)}/${r.id}`,
      method: "PUT",
      defaults: r.data || {
        ...r,
        ...(tab === "employees" ? { salary: r.salary / 100 } : {}),
      },
    });
  }
  const separateEmployeeLogin=(employee:Row)=>setModal({type:'form',title:'Create separate employee login',fields:[{key:'email',label:'Separate employee email',type:'email',required:true}],endpoint:`/employees/${employee.id}/login`});
  const generateEmployeeLogin=(employee:Row)=>setModal({type:'confirm',title:`Generate credentials for ${employee.name}`,text:'This creates a new password and signs out existing sessions. Save the new credentials to share with this employee.',run:async()=>{try{const result=await api(`/employees/${employee.id}/credentials`,'POST',{});setModal({type:'credentials',title:'Employee login is ready',credentials:result.credentials});}catch(e:any){notify(e.message);}}});
  function rowActions(r: Row) {
    if(['leave','studentAssessments','employeeAssessments','appraisals','schoolReports','workReports'].includes(tab))return <div className="row-actions"><button className="small-button" onClick={()=>setModal({type:'details',record:r,title:r.title})}>View details</button>{canManage(tab)&&r.status!=='Approved'&&!(tab==='leave'&&r.status==='Rejected')&&(!['leave','workReports'].includes(tab)||r.userId===user.id)&&<><button className="small-button" onClick={()=>edit(r)}>Edit</button>{r.status!=='Rejected'&&<button className="small-button" onClick={()=>action('/workflow/submit','POST',{type:tab,entityId:r.id})}>Submit for approval</button>}</>}</div>;
    if(tab==='recruitment')return <div className="row-actions"><button className="small-button" onClick={()=>setModal({type:'details',record:r,title:r.title})}>View details</button>{canManage(tab)&&!r.data.employeeId&&<><button className="small-button" onClick={()=>edit(r)}>Edit candidate</button>{['Offer','Hired'].includes(r.data.stage)&&<button className="small-button" onClick={()=>setModal({type:'form',title:'Onboard employee',endpoint:`/recruitment/${r.id}/onboard`,fields:[{key:'joiningDate',label:'Joining date',type:'date',required:true},{key:'qualification',label:'Qualification',required:true},{key:'salary',label:'Monthly salary (₹)',type:'number',required:true}]})}>Onboard employee</button>}</>}</div>;

    if(tab==='accessRequests') return <div className="row-actions"><button className="small-button" onClick={async()=>{try{const d=await api(`/users/${r.userId}/invite`,'POST',{});setModal({type:'invites',tokens:[{...d,email:r.createdBy||'School account'}]})}catch(e:any){notify(e.message)}}}>Create reset link</button>{r.status==='Pending'&&<button className="small-button" onClick={()=>action(`/access-requests/${r.id}/resolve`)}>Mark resolved</button>}</div>;

    if (tab === "inventory" && canManage(tab))
      return (
        <div className="row-actions">
          <button
            className="small-button"
            onClick={() =>
              setModal({
                type: "form",
                title: `Stock movement · ${r.title}`,
                fields: [
                  {
                    key: "direction",
                    label: "Direction",
                    type: "select",
                    options: ["In", "Out"],
                    required: true,
                  },
                  {
                    key: "quantity",
                    label: "Quantity",
                    type: "number",
                    required: true,
                  },
                  { key: "reason", label: "Reason", required: true },
                ],
                endpoint: `/records/inventory/${r.id}/movement`,
              })
            }
          >
            Stock in / out
          </button>
          <button
            className="icon-button"
            aria-label="Edit asset"
            onClick={() => edit(r)}
          >
            <Pencil size={15} />
          </button>
        </div>
      );
    if (tab === "submissions" && canManage(tab))
      return (
        <div className="row-actions"><button className="small-button" onClick={()=>setModal({type:'details',record:r,title:r.relatedTitle||r.title})}>View work</button><button
          className="small-button"
          onClick={() =>
            setModal({
              type: "form",
              title: "Review assignment",
              fields: [
                {
                  key: "score",
                  label: "Score (out of 100)",
                  type: "number",
                  required: true,
                },
                {
                  key: "feedback",
                  label: "Feedback",
                  type: "textarea",
                  required: true,
                },
              ],
              defaults: r.data,
              endpoint: `/records/submissions/${r.id}/feedback`,
            })
          }
        >
          Review work
        </button></div>
      );
    if (tab === "feeStructures" && (isAdmin || user.role === "Accountant"))
      return (
        <div className="row-actions">
          <button
            className="small-button"
            onClick={() =>
              setModal({
                type: "form",
                title: "Assign class fees",
                fields: [
                  {
                    key: "period",
                    label: "Billing period (e.g. November 2026)",
                    required: true,
                  },
                  {
                    key: "dueDate",
                    label: "Due date",
                    type: "date",
                    required: true,
                  },
                ],
                endpoint: `/records/feeStructures/${r.id}/assign`,
              })
            }
          >
            Assign to class
          </button>
          <button
            className="icon-button"
            aria-label="Edit fee structure"
            onClick={() => edit(r)}
          >
            <Pencil size={15} />
          </button>
        </div>
      );
    if (tab === "cms" && canManage(tab))
      return (
        <button
          className="small-button"
          onClick={() =>
            setModal({
              type: "form",
              title: `Edit ${r.id} page`,
              fields: [
                { key: "title", label: "Page title", required: true },
                {
                  key: "body",
                  label: "Page content",
                  type: "textarea",
                  required: true,
                },
              ],
              defaults: r,
              method: "PUT",
              endpoint: `/cms/${r.id}`,
            })
          }
        >
          <Pencil size={14} /> Edit page
        </button>
      );
    if (tab === "users" || tab === "parents")
      return (
        <div className="row-actions">
          {["Super Admin", "School Admin"].includes(user.role) && (
            <button
              className="small-button"
              onClick={async () => {
                try {
                  const d = await api(`/users/${r.id}/invite`, "POST", {});
                  setModal({
                    type: "invites",
                    tokens: [{ email: r.email, token: d.token }],
                  });
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              Reset link
            </button>
          )}
          {user.role === "Super Admin" && r.id !== user.id && (
            <>
              <button className="small-button" onClick={()=>setModal({type:'form',title:`Set password · ${r.name}`,endpoint:`/users/${r.id}/password`,fields:[{key:'password',label:'New password (8+ characters)',type:'password',required:true}]})}>Set password</button>
              <button
                className="icon-button"
                aria-label="Edit role"
                onClick={() =>
                  setModal({
                    type: "form",
                    title: "Change access role",
                    fields: [
                      {
                        key: "role",
                        label: "Role",
                        type: "select",
                        options: roles,
                        required: true,
                      },
                    ],
                    defaults: r,
                    method: "PATCH",
                    endpoint: `/users/${r.id}`,
                  })
                }
              >
                <Pencil size={15} />
              </button>
              <button
                className="small-button"
                onClick={() =>
                  setModal({
                    type: "confirm",
                    title: r.active
                      ? "Deactivate account?"
                      : "Activate account?",
                    text: `Change account access for ${r.name}.`,
                    run: () =>
                      action(`/users/${r.id}`, "PATCH", { active: !r.active }),
                  })
                }
              >
                {r.active ? "Deactivate" : "Activate"}
              </button>
            </>
          )}
        </div>
      );
    if (tab === "fees") {
      const balance =
        r.amount -
        r.payments.reduce(
          (a: number, p: Row) =>
            a +
            p.amount -
            (p.refunds || []).reduce((s: number, r: Row) => s + r.amount, 0),
          0,
        );
      return (
        <div className="row-actions">
          {balance > 0 && integrations.payments && (
            <button
              className="small-button"
              onClick={async () => {
                try {
                  const { checkout } = await import("./payments");
                  await checkout(r.id, notify, refresh);
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              Pay online
            </button>
          )}
          {balance > 0 && canManage("fees") && (
            <button
              className="small-button"
              onClick={() =>
                setModal({
                  type: "form",
                  title: "Record a collection for verification",
                  fields: [
                    {
                      key: "amount",
                      label: "Amount received (₹)",
                      type: "number",
                      required: true,
                    },
                    {
                      key: "method",
                      label: "Payment method",
                      type: "select",
                      options: ["Cash", "UPI", "Bank transfer", "Cheque"],
                      required: true,
                    },
                    {
                      key: "reference",
                      label: "Bank / cheque reference",
                      required: false,
                    },
                  ],
                  defaults: { amount: balance / 100 },
                  endpoint: `/fees/${r.id}/payment-requests`,
                })
              }
            >
              Record payment
            </button>
          )}
          {balance > 0 && canManage("fees") && (
            <button
              className="small-button"
              onClick={() =>
                setModal({
                  type: "form",
                  title: "Apply a fee concession",
                  fields: [
                    {
                      key: "amount",
                      label: "Concession amount (₹)",
                      type: "number",
                      required: true,
                    },
                    {
                      key: "reason",
                      label: "Reason / scholarship",
                      required: true,
                    },
                  ],
                  endpoint: `/fees/${r.id}/concession`,
                })
              }
            >
              Concession
            </button>
          )}
          <button
            className="icon-button"
            aria-label="View fee ledger"
            onClick={() => setModal({ type: "ledger", record: r })}
          >
            <Receipt size={17} />
          </button>
        </div>
      );
    }
    if (tab === "exams")
      return (
        <div className="row-actions">
          {canManage("exams") && !r.published && (
            <button
              className="small-button"
              onClick={() =>
                setModal({
                  type: "form",
                  title: "Enter student marks",
                  fields: [
                    {
                      key: "studentId",
                      label: "Student",
                      type: "student",
                      required: true,
                    },
                    {
                      key: "score",
                      label: `Marks (out of ${r.maxMarks})`,
                      type: "number",
                      required: true,
                    },
                    { key: "remarks", label: "Remarks", type: "textarea" },
                  ],
                  endpoint: `/exams/${r.id}/marks`,
                  defaults: { remarks: "" },
                })
              }
            >
              Enter marks
            </button>
          )}
          {canManage('exams')&&!r.published&&<button className="small-button" onClick={()=>action('/workflow/submit','POST',{type:'exam',entityId:r.id})}>Submit for approval</button>}
          <button
            className="icon-button"
            aria-label="View results"
            onClick={() => setModal({ type: "results", record: r })}
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
      );
    if(tab==='payroll')return <div className="row-actions">{r.status==='Draft'&&canManage('payroll')&&<button className="small-button" onClick={()=>action('/workflow/submit','POST',{type:'payroll',entityId:r.id})}>Submit for approval</button>}{r.status==='Approved'&&<a className="small-button" href={`/api/reports/payslip/${r.id}`}>Download payslip <Download size={15}/></a>}</div>;
    if (tab === "admissions" && canManage(tab))
      return (
        <button
          className="small-button"
          onClick={() =>
            setModal({
              type: "form",
              title: "Update application status",
              fields: [
                {
                  key: "status",
                  label: "Status",
                  type: "select",
                  required: true,
                  options: [
                    "New",
                    "Contacted",
                    "Under review",
                    "Accepted",
                    "Declined",
                  ],
                },
              ],
              defaults: r,
              endpoint: `/records/admissions/${r.id}`,
              method: "PATCH",
            })
          }
        >
          Review <ArrowUpRight size={14} />
        </button>
      );
    if (
      tab === "loans" &&
      r.status === "Active" &&
      (isAdmin || user.role === "Librarian")
    )
      return (
        <button
          className="small-button"
          onClick={() =>
            action(`/records/loans/${r.id}`, "PATCH", { status: "Returned" })
          }
        >
          Record return
        </button>
      );
    if (tab === "documents")
      return (
        <a href={`/api/documents/${r.id}`} className="small-button">
          <Download size={14} /> Download
        </a>
      );
    if (tab === "audit" || tab === "delivery-logs") return <span>—</span>;
    return (
      <div className="row-actions">
        {modules[tab] && <button className="small-button" onClick={()=>setModal({type:'details',record:r,title:r.relatedTitle||r.title})}>View details</button>}
        {tab === "students" && isAdmin && (
          <button
            className="small-button"
            onClick={() =>
              setModal({
                type: "promotion",
                title: "Promote or move student",
                record: r,
              })
            }
          >
            Promote / move
          </button>
        )}
        {tab === "students" && (
          <a
            className="icon-button"
            aria-label="Download student profile"
            href={`/api/reports/student/${r.id}`}
          >
            <Download size={15} />
          </a>
        )}
        {canAdd() && tab !== "submissions" && (
          <>
            {(tab!=='students'||studentEditRoles.includes(user.role))&&<button
              className="icon-button"
              aria-label="Edit record"
              onClick={() => edit(r)}
            >
              <Pencil size={15} />
            </button>}
            {(tab!=='students'||studentArchiveRoles.includes(user.role))&&<button
              className="icon-button"
              aria-label="Archive record"
              onClick={() =>
                setModal({
                  type: "confirm",
                  title: "Archive this record?",
                  text: "The record will be removed from active lists. Existing history is retained.",
                  run: () => action(`${pathFor(tab)}/${r.id}`, "DELETE"),
                })
              }
            >
              <Archive size={15} />
            </button>}
          </>
        )}
      </div>
    );
  }
  function columns(): { label: string; render: (r: Row) => ReactNode }[] {
    const c = (label: string, render: (r: Row) => ReactNode) => ({
      label,
      render,
    });
    const person = (r: Row) => (
      <div className="person-cell">
        <span className="avatar small">
          {(r.name || r.childName || r.title || "?").slice(0, 2).toUpperCase()}
        </span>
        <span>
          <strong>{r.name || r.childName || r.title}</strong>
          <small>{r.email || r.admissionNo || r.employeeNo}</small>
        </span>
      </div>
    );
    if (tab === "students")
      return [
        c("Student", person),
        c("Class", (r) => `${r.className} · ${r.section}`),
        c("Parent / guardian", (r) => (
          <span>
            {r.parentName}
            <small className="subtext">{r.phone}</small>
          </span>
        )),
        c("Admission no.", (r) => r.admissionNo),
        c("Session", (r) => r.session),
      ];
    if (tab === "employees")
      return [
        c("Team member", person),
        c("Department", (r) => r.department),
        c("Designation", (r) => r.designation),
        c("Joined", (r) => r.joiningDate),
        c("Employee no.", (r) => r.employeeNo),
      ];
    if (tab === "users" || tab === "parents")
      return [
        c("Name", person),
        c("Role", (r) => <span className="badge">{r.role}</span>),
        c("Status", (r) => <Status value={r.active ? "Active" : "Inactive"} />),
      ];
    if (tab === "fees")
      return [
        c("Invoice", (r) => (
          <span>
            <strong>{r.title}</strong>
            <small className="subtext">{r.number}</small>
          </span>
        )),
        c("Student", (r) => r.student.name),
        c("Total", (r) => rupees(r.amount)),
        c("Outstanding", (r) =>
          rupees(
            r.amount -
              r.payments.reduce(
                (a: number, p: Row) =>
                  a +
                  p.amount -
                  (p.refunds || []).reduce(
                    (s: number, r: Row) => s + r.amount,
                    0,
                  ),
                0,
              ),
          ),
        ),
        c("Due date", (r) => r.dueDate),
        c("Status", (r) => (
          <Status
            value={
              r.payments.reduce(
                (a: number, p: Row) =>
                  a +
                  p.amount -
                  (p.refunds || []).reduce(
                    (s: number, r: Row) => s + r.amount,
                    0,
                  ),
                0,
              ) >= r.amount
                ? "Paid"
                : r.dueDate < today()
                  ? "Overdue"
                  : "Pending"
            }
          />
        )),
      ];
    if (tab === "exams")
      return [
        c("Examination", (r) => (
          <span>
            <strong>{r.name}</strong>
            <small className="subtext">{r.subject}</small>
          </span>
        )),
        c("Class", (r) => r.className),
        c("Date", (r) => r.date),
        c("Maximum marks", (r) => r.maxMarks),
        c("Status", (r) => (
          <Status value={r.published ? "Published" : "Draft"} />
        )),
      ];
    if (tab === "payroll")
      return [
        c("Employee", (r) => r.employee.name),
        c("Month", (r) => r.month),
        c("Basic", (r) => rupees(r.basic)),
        c("Deductions", (r) => rupees(r.deductions)),
        c("Net pay", (r) => rupees(r.net)),
        c("Status", (r) => <Status value={r.status} />),
      ];
    if (tab === "admissions")
      return [
        c("Child", (r) => (
          <span>
            <strong>{r.childName}</strong>
            <small className="subtext">{r.reference}</small>
          </span>
        )),
        c("Parent", (r) => (
          <span>
            {r.parentName}
            <small className="subtext">
              {r.email} · {r.phone}
            </small>
          </span>
        )),
        c("Class", (r) => r.className),
        c("Message", (r) => (
          <span title={r.message}>{r.message?.slice(0, 60) || "—"}</span>
        )),
        c("Status", (r) => <Status value={r.status} />),
      ];
    if (tab === "cms")
      return [
        c("Page", (r) => (
          <span>
            <strong>{r.id}</strong>
            <small className="subtext">{r.title}</small>
          </span>
        )),
        c("Content", (r) => r.body.slice(0, 100) + "…"),
      ];
    if (tab === "delivery-logs")
      return [
        c("Channel", (r) => r.channel),
        c("Recipient", (r) => r.recipient),
        c("Subject", (r) => r.subject),
        c("Status", (r) => <Status value={r.status} />),
        c("Provider reference", (r) => r.providerId || r.error || "—"),
      ];
    if (tab === "audit")
      return [
        c("Action", (r) => r.action),
        c("Module", (r) => r.entity),
        c("Record", (r) => r.entityId),
        c("Actor", (r) => r.actorId),
        c("Time", (r) =>
          new Date(r.createdAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          }),
        ),
      ];
    if (tab === "library")
      return [
        c("Book", (r) => r.title),
        c("Author", (r) => r.data.author),
        c("ISBN", (r) => r.data.isbn),
        c("Copies", (r) => r.data.quantity),
        c("Available", (r) => <Status value={String(r.data.available)} />),
        c("Fine / day", (r) => rupees(Number(r.data.dailyFine || 0) * 100)),
      ];
    if (tab === "loans")
      return [
        c("Book", (r) => r.relatedTitle || r.title),
        c(
          "Student",
          (r) => students.find((s) => s.id === r.studentId)?.name || "Student",
        ),
        c("Due date", (r) => r.data.dueDate),
        c("Returned", (r) => r.data.returnedDate || "—"),
        c("Late fine", (r) => rupees(r.data.fine || 0)),
        c("Status", (r) => <Status value={r.status} />),
      ];
    if(tab==='accessRequests') return [c('Account',r=>r.createdBy||'School member'),c('Role',r=>r.data.accountRole),c('Requested',r=>new Date(r.data.requestedAt).toLocaleString()),c('Status',r=><Status value={r.status}/>)];
    if (tab === "submissions")
      return [
        c("Assignment", (r) => r.relatedTitle || r.title),
        c("Submitted by", (r) => r.createdBy || 'Student'),
        c("Submitted work", (r) => (
          <span title={r.data.answer}>{r.data.answer?.slice(0, 100)}</span>
        )),
        c("Score", (r) =>
          r.data.score === undefined ? "—" : `${r.data.score}/100`,
        ),
        c("Feedback", (r) => r.data.feedback || "Awaiting review"),
        c("Status", (r) => <Status value={r.status} />),
      ];
    if (tab === "leave") return [c('Applicant',r=>r.createdBy||'School member'),c('Reason',r=>r.title),c('Type',r=>r.data.type),c('From',r=>r.data.start),c('Until',r=>r.data.end),c('Status',r=><Status value={r.status}/>)];
    if (tab === "transport") return [c('Route',r=>r.relatedTitle||r.title),c('Student',r=>students.find(s=>s.id===r.studentId)?.name||'Student'),c('Stop',r=>r.data.stop),c('Vehicle',r=>r.vehicleRegistration||'—'),c('Driver',r=><span>{r.driverName}<small className="subtext">{r.driverPhone}</small></span>)];
    if (tab === "inventory") return [c('Item',r=>r.title),c('Category',r=>r.data.category),c('Quantity',r=>r.data.quantity),c('Location',r=>r.data.location),c('Stock',r=><Status value={Number(r.data.quantity)<=Number(r.data.minimum)?'Low stock':'Available'}/>)];
    if (tab === "documents")
      return [
        c("Document", (r) => (
          <span>
            <FileText size={15} /> {r.name}
          </span>
        )),
        c("Size", (r) => `${(r.size / 1024).toFixed(1)} KB`),
        c("Uploaded", (r) => new Date(r.createdAt).toLocaleDateString()),
      ];
    const fields = modules[tab]?.fields || [];
    return [
      ...fields.slice(0, 4).map((f) =>
        c(f.label, (r) => {
          const v = f.key==='vehicleId' && r.relatedTitle ? r.relatedTitle : r.data?.[f.key];
          return f.type === "student"
            ? students.find((s) => s.id === v)?.name || v
            : f.type === "employee"
              ? employees.find((e) => e.id === v)?.name || v
              : String(v ?? "—").slice(0, 80);
        }),
      ),
      c("Status", (r) => <Status value={r.status} />),
    ];
  }
  return (
    <div className={`portal-shell portal-${kind} ${kind==='admin'&&tab==='overview'?'portal-admin-overview':''}`}>
      <aside className={`portal-sidebar ${sidebar ? "open" : ""}`}>
        <Brand />
        <div className="school-tag">
          <span className="green-dot" /> {portalNames[kind]} portal <span>ERP</span>
        </div>
        <nav aria-label="Portal navigation">
          {nav.map((group) => {
            const items = group.items.filter((i) => canSee(i[0] as string));
            return items.length ? (
              <div className="nav-group" key={group.group}>
                <span>{group.group}</span>
                {items.map(([key, label, Icon]: any) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    onClick={() => go(key)}
                  >
                    <Icon size={17} />
                    {displayLabel(key)}
                    {tab === key && <span className="nav-dot" />}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <a href="#/" className="back-to-site">
          <Globe size={16} /> View school website <ArrowUpRight size={15} />
        </a>
        <button className="sidebar-user" onClick={() => go("settings")}>
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.accessRole||user.role}</small>
          </span>
          <Settings size={17} />
        </button>
      </aside>
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <div className="portal-main">
        <header className="portal-header">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-button"
              aria-label="Open navigation"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu size={20} />
            </button>
            <span>{portalNames[kind]} portal</span>
            <ChevronRight size={14} />
            <strong>{displayLabel(tab)}</strong>
          </div>
          <div className="portal-header-right">
            <span className="portal-date">
              {new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              }).format(new Date())}
            </span>
            <NotificationBell go={go}/>
            <span className="avatar small">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="portal-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "overview"
                  ? "A LITTLE CLARITY FOR YOUR DAY"
                  : "OPEN MIND'S · SCHOOL WORKSPACE"}
              </span>
              <h1>
                {tab === "overview"
                  ? `Hello, ${user.name.split(" ")[0]}.`
                  : family && tab === "students"
                    ? user.role === "Parent"
                      ? "My children"
                      : "My profile"
                    : displayLabel(tab)}
                {tab === "overview" && (
                  <span className="greeting-leaf">
                    <Leaf size={26} />
                  </span>
                )}
              </h1>
              <p>
                {tab === "overview"
                  ? `Here’s what’s happening in your ${family ? "learning journey" : "school community"}.`
                  : modules[tab]?.description ||
                    (
                      {
                        notifications: "Your school updates, linked to the people and records that matter.",
                        students:
                          "Every student. Every story. One connected community.",
                        employees:
                          "The people who make a difference, every day.",
                        fees: "A clear view of invoices, collections and outstanding balances.",
                        exams:
                          "Turn learning milestones into meaningful progress.",
                        payroll:
                          "Prepare salary records and review them before approval.",
                        cms: "Keep your school website fresh, without writing code.",
                        users: "Give every person the access they need.",
                        attendance:
                          "Show up. Check in. Keep every day accounted for.",
                        reports: "Your school records, ready to take with you.",
                      } as any
                    )[tab] ||
                    "Manage your school records with care."}
              </p>
            </div>
            <div className="heading-actions">
              {tab === "exams" && isAdmin && (
                <button
                  className="button light"
                  onClick={() =>
                    setModal({ type: "grading", title: "Grading rules" })
                  }
                >
                  Grading rules
                </button>
              )}
              {tab === "notices" && isAdmin && (
                <button
                  className="button light"
                  onClick={() =>
                    setModal({
                      type: "form",
                      title: "Send a school message",
                      fields: [
                        {
                          key: "channel",
                          label: "Channel",
                          type: "select",
                          options: ["Email", "SMS"],
                          required: true,
                        },
                        {
                          key: "recipient",
                          label: "Recipient email or international phone",
                          required: true,
                        },
                        { key: "subject", label: "Subject", required: true },
                        {
                          key: "body",
                          label: "Message",
                          type: "textarea",
                          required: true,
                        },
                      ],
                      endpoint: "/communications/send",
                    })
                  }
                >
                  Send message <ArrowUpRight size={16} />
                </button>
              )}
              {tab === 'overview' && isAdmin && canManage('employees') && <button className="button light" onClick={addEmployee}><Plus size={17}/> Add employee</button>}
              {tab === "overview" && isAdmin ? (
                <button className="button dark" onClick={() => go("students")}>
                  Manage students <ArrowUpRight size={16} />
                </button>
              ) : canAdd() ? (
                <button className="button dark" onClick={add}>
                  <Plus size={17} /> Add{" "}
                  {modules[tab]?.singular.toLowerCase() ||
                    (
                      {
                        students: "student",
                        employees: "employee",
                        fees: "invoice",
                        exams: "exam",
                        payroll: "payroll",
                        users: "user",
                      } as any
                    )[tab]}
                </button>
              ) : null}
            </div>
          </div>
          {new URLSearchParams(route.split('?')[1]||'').has('record')&&<div className="notification-record-context"><span>Showing the record linked to your notification. If it is no longer active or available to your account, it will not appear below.</span><button onClick={()=>go(tab)}>Show all records</button></div>}
          {error ? (
            <div className="error-state">
              <p>{error}</p>
              <button className="button light" onClick={refresh}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="skeleton-grid">
              {[1, 2, 3, 4].map((n) => (
                <div className="skeleton" key={n} />
              ))}
              <div className="skeleton full" />
            </div>
          ) : tab === "overview" && stats ? (
            operational?<WorkspaceDashboard data={stats} user={user} go={go}/>:member?<MemberDashboard data={stats} user={user} go={go} refresh={refresh} notify={notify}/>:<AdminDashboard stats={stats} user={user} go={go} session={school.academicSession} items={nav.flatMap(g=>g.items.filter(([key])=>key!=='overview'&&canSee(key as string)).map(([key,label,Icon]:any)=>({key,label,Icon,group:g.group,description:modules[key]?.description||'School records and tools'})))}/>
          ) : tab==='employees'&&isAdmin?<EmployeeDirectory employees={filtered} canViewActivity={user.role==='Super Admin'&&canSee('audit')} actions={r=><>{user.role==='Super Admin'&&admins.includes(r.accountRole)&&<button className="button dark" onClick={()=>separateEmployeeLogin(r)}><ShieldCheck size={15}/> Create separate employee login</button>}{user.role==='Super Admin'&&!admins.includes(r.accountRole)&&r.userId!==user.id&&<button className="button light" onClick={()=>generateEmployeeLogin(r)}><ShieldCheck size={15}/> Generate login credentials</button>}{rowActions(r)}</>} tools={<><button className="small-button" disabled={!rows.length} onClick={()=>exportCsv(rows,'employees')}><Download size={14}/> CSV</button><button className="small-button" disabled={!rows.length} onClick={()=>import('./excel').then(m=>m.downloadExcel(rows,'employees')).catch(()=>notify('Export could not be generated.'))}>Excel</button><a className="small-button" href="/api/exports/employees.pdf">PDF</a>{canAdd()&&<button className="small-button" onClick={()=>setModal({type:'import',title:'Import employees'})}><Upload size={14}/> Import</button>}</>}/>:tab==='audit'?<ActivityDashboard/>:tab==='notifications'?<NotificationCenter go={go}/>: ["approvals","notifications","permissions","analytics","paymentVerifications"].includes(tab)?<FlowPanel key={tab} tab={tab} user={user} go={go} notify={notify} focusRecordId={new URLSearchParams(route.split('?')[1]||'').get('record')||undefined}/>: ((tab === "students" && family)||(tab === "employees" && member && user.role!=="HR Manager")) ? (<MemberProfile records={rows} kind={family?"student":"employee"} user={user} go={go}/>) : tab === "settings" ? (
            <SettingsPage
              onSaved={refresh}
              user={user}
              onLogout={async () => {
                try {
                  await api("/auth/logout", "POST", {});
                  onLogout();
                } catch (e: any) {
                  notify(e.message);
                }
              }}
              notify={notify}
            />
          ) : tab === "reports" ? (
            <Reports students={students} notify={notify} />
          ) : tab === "attendance" ? (
            <Attendance
              user={user}
              students={students}
              employees={employees}
              rows={rows}
              day={dateFilter}
              setDay={setDateFilter}
              notify={notify}
              refresh={refresh}
            />
          ) : (
            <section className="data-panel">
              <div className="table-toolbar">
                <div className="table-title">
                  {labelFor(tab)} <span>{rows.length}</span>
                </div>
                <div className="table-controls">
                  <label className="table-search">
                    <Search size={15} />
                    <input
                      aria-label="Search records"
                      placeholder="Search records…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  {filters.length > 0 && (
                    <select
                      aria-label="Filter records"
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All records</option>
                      {filters.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  )}
                  {tab === "documents" && (
                    <label className="small-button upload-button">
                      <Upload size={14} /> Upload
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const body = new FormData();
                          body.append("file", f);
                          try {
                            await api("/documents", "POST", body);
                            notify("Document uploaded.");
                            refresh();
                          } catch (e: any) {
                            notify(e.message);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {rows.some((r) => r.session || r.data?.session) && (
                    <select
                      aria-label="Academic session filter"
                      value={sessionFilter}
                      onChange={(e) => {
                        setSessionFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All sessions</option>
                      {[
                        ...new Set(
                          rows
                            .map((r) => r.session || r.data?.session)
                            .filter(Boolean),
                        ),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  )}
                  {![
                    "cms",
                    "users",
                    "parents",
                    "documents",
                    "audit",
                    "delivery-logs",
                  ].includes(tab) && (
                    <a
                      className="small-button"
                      href={`/api/exports/${tab}.pdf?q=${encodeURIComponent(query)}`}
                      title="PDF export of authorised records matching your search"
                    >
                      PDF
                    </a>
                  )}
                  <button
                    className="small-button"
                    disabled={!filtered.length}
                    onClick={() => exportCsv(filtered, tab)}
                  >
                    <Download size={14} /> CSV
                  </button>
                  <button
                    className="small-button"
                    disabled={!filtered.length}
                    onClick={() =>
                      import("./excel")
                        .then((m) => m.downloadExcel(filtered, tab))
                        .catch(() => notify("Export could not be generated."))
                    }
                  >
                    Excel
                  </button>
                  {["students", "employees"].includes(tab) && canAdd() && (
                    <button
                      className="small-button"
                      onClick={() =>
                        setModal({ type: "import", title: `Import ${tab}` })
                      }
                    >
                      <Upload size={14} /> Import
                    </button>
                  )}
                </div>
              </div>
              {shown.length ? (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {columns().map((c) => (
                            <th key={c.label}>{c.label}</th>
                          ))}
                          <th className="actions-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((r) => (
                          <tr key={r.id}>
                            {columns().map((c) => (
                              <td key={c.label}>{c.render(r)}</td>
                            ))}
                            <td>{rowActions(r)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-pagination">
                    <span>
                      Showing {(Math.min(page, pages) - 1) * 8 + 1}–
                      {Math.min(Math.min(page, pages) * 8, filtered.length)} of{" "}
                      {filtered.length} records
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous page"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>
                        {Math.min(page, pages)} / {pages}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Next page"
                        disabled={page >= pages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <Empty
                  title={
                    query || filter
                      ? "No matching records."
                      : `Your ${labelFor(tab).toLowerCase()} start here.`
                  }
                  text={
                    query || filter
                      ? "Try another search or filter."
                      : "Records will appear here when they are added to your school."
                  }
                  action={
                    canAdd() ? (
                      <button className="button dark" onClick={add}>
                        <Plus size={16} /> Add your first record
                      </button>
                    ) : undefined
                  }
                />
              )}
            </section>
          )}
          <div className="portal-footer">
            <span>OPEN MIND'S PUBLIC SCHOOL</span>
            <span>A little more possibility, every day.</span>
          </div>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.title ||
            (
              {
                invites: "Accounts are ready to activate.",
                ledger: "Fee ledger",
                results: "Examination results",
              } as any
            )[modal.type] ||
            "Details"
          }
          onClose={() => setModal(null)}
          wide={modal.type === "form"}
        >
          {modal.type === 'credentials' ? <EmployeeCredentials credentials={modal.credentials} notify={notify}/>:modal.type === 'details' ? <div className="record-details"><dl>{(modules[tab]?.fields||[]).filter(f=>!['title','documentId'].includes(f.key)).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.type==='employee'?employees.find(e=>e.id===modal.record.data[f.key])?.name||'School employee':f.type==='student'?students.find(s=>s.id===modal.record.data[f.key])?.name||'Student':String(modal.record.data[f.key]??'—')}</dd></div>)}</dl>{modal.record.data.documentId&&<a className="button light" href={`/api/documents/${modal.record.data.documentId}`}><Download size={16}/> Download attachment</a>}{tab==='submissions'&&modal.record.data.feedback&&<p><strong>Teacher feedback:</strong> {modal.record.data.feedback}</p>}{tab==='homework'&&user.role==='Student'&&<button className="button dark" onClick={()=>setModal({type:'submit',title:'Submit your work',assignment:modal.record})}>Submit your work <ArrowUpRight size={16}/></button>}</div> : modal.type==='submit'? <SubmissionForm assignment={modal.assignment} onDone={()=>{setModal(null);refresh();notify('Your assignment has been submitted.');go('submissions')}}/> : modal.type === "grading" ? (
            <GradingRules
              onDone={() => {
                setModal(null);
                notify("Grading rules saved.");
              }}
            />
          ) : modal.type === "promotion" ? (
            <Promotion
              student={modal.record}
              onDone={() => {
                setModal(null);
                refresh();
                notify("Student enrollment updated.");
              }}
            />
          ) : modal.type === "import" ? (
            <ImportRecords
              kind={tab}
              onDone={(tokens: any[]) => {
                refresh();
                if (tokens.length) setModal({ type: "invites", tokens });
                else setModal(null);
              }}
            />
          ) : modal.type === "form" ? (
            <RecordForm
              fields={modal.fields}
              defaults={modal.defaults || {}}
              endpoint={modal.endpoint}
              method={modal.method || "POST"}
              students={students}
              employees={employees}
              module={modal.module||tab}
              onSave={(r) => {
                refresh();
                notify("Record saved successfully.");
                if(modal.endpoint?.endsWith('/payment-requests')){setModal(null);go('paymentVerifications');notify('Collection saved. Submit it for independent verification.');}
                else if(r.credentials)setModal({type:'credentials',title:'Employee login is ready',credentials:r.credentials});
                else if (r.activationTokens?.length)
                  setModal({ type: "invites", tokens: r.activationTokens });
                else setModal(null);
              }}
            />
          ) : modal.type === "confirm" ? (
            <div>
              <p>{modal.text}</p>
              <div className="modal-actions">
                <button className="button light" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button className="button dark" onClick={modal.run}>
                  Confirm <Check size={16} />
                </button>
              </div>
            </div>
          ) : modal.type === "invites" ? (
            <div className="invites">
              <p>
                Share each private activation link directly with its recipient.
                Links expire in 24 hours. No email has been sent automatically.
              </p>
              {modal.tokens.map((t: Row) => (
                <div key={t.email}>
                  <strong>{t.email}</strong>
                  <input
                    aria-label={`Activation link for ${t.email}`}
                    readOnly
                    value={`${location.origin}/#/activate/${t.token}`}
                  />
                  <button
                    className="small-button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(`${location.origin}/#/activate/${t.token}`)
                        .then(() => notify("Link copied."))
                        .catch(() =>
                          notify("Select the link and copy it manually."),
                        )
                    }
                  >
                    <Copy size={14} /> Copy link
                  </button>
                </div>
              ))}
            </div>
          ) : modal.type === "ledger" ? (
            <div className="ledger">
              <p>
                {modal.record.student.name} · {modal.record.title}
              </p>
              <div className="ledger-total">
                <span>Invoice total</span>
                <strong>{rupees(modal.record.amount)}</strong>
              </div>
              {modal.record.payments.length ? (
                modal.record.payments.map((p: Row) => (
                  <div className="ledger-payment" key={p.id}>
                    <div>
                      <strong>{rupees(p.amount)}</strong>
                      <small>
                        {p.method} ·{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                        {p.refunds?.length
                          ? ` · Refunded ${rupees(p.refunds.reduce((a: number, r: Row) => a + r.amount, 0))}`
                          : ""}
                      </small>
                    </div>
                    <div className="row-actions">
                      {p.method !== "Razorpay" &&
                        (isAdmin || user.role === "Accountant") && (
                          <button
                            className="small-button"
                            onClick={() =>
                              setModal({
                                type: "form",
                                title: "Record a completed offline refund",
                                fields: [
                                  {
                                    key: "amount",
                                    label: "Amount already refunded (₹)",
                                    type: "number",
                                    required: true,
                                  },
                                  {
                                    key: "reason",
                                    label: "Reason",
                                    required: true,
                                  },
                                  {
                                    key: "reference",
                                    label: "Refund voucher / bank reference",
                                    required: true,
                                  },
                                ],
                                endpoint: `/payments/${p.id}/refund`,
                              })
                            }
                          >
                            Record refund
                          </button>
                        )}
                      <a
                        href={`/api/reports/receipt/${p.id}`}
                        className="small-button"
                      >
                        <Download size={14} /> Receipt
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <p>No payments recorded.</p>
              )}
              <p className="form-note">
                {integrations.payments
                  ? "Online payments are verified by the school server and payment gateway."
                  : "Online gateway payments are not enabled in this installation."}
              </p>
            </div>
          ) : modal.type === "results" ? (
            <div>
              <p>
                {modal.record.name} · {modal.record.subject}
              </p>
              {modal.record.marks.length ? (
                modal.record.marks.map((m: Row) => (
                  <div className="result-row" key={m.id}>
                    <span>
                      {students.find((s) => s.id === m.studentId)?.name ||
                        "Student"}
                    </span>
                    <strong>
                      {m.score} / {modal.record.maxMarks}
                    </strong>
                    <Status
                      value={
                        m.score >= modal.record.passMarks
                          ? "Pass"
                          : "Needs support"
                      }
                    />
                  </div>
                ))
              ) : (
                <Empty
                  title="No marks entered yet."
                  text="Saved marks will appear here."
                />
              )}
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["Paid", "Active", "Approved", "Present", "Published", "Pass", "Returned", "Accepted"].includes(value) ? "positive" : ["Overdue", "Absent", "Rejected", "Declined", "Inactive"].includes(value) ? "negative" : "neutral"}`}
    >
      {value}
    </span>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Leaf size={29} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function RecordForm({
  fields,
  defaults,
  endpoint,
  method,
  students,
  employees,
  module,
  onSave,
}: {
  fields: Field[];
  defaults: Row;
  endpoint: string;
  method: string;
  students: Row[];
  employees: Row[];
  module: string;
  onSave: (r: any) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refs, setRefs] = useState<Row[]>([]);
  const refModule = (
    {
      loans: "library",
      transport: "routes",
      routes: "vehicles",
      submissions: "homework",
    } as any
  )[module];
  useEffect(() => {
    if (refModule)
      api(`/records/${refModule}`)
        .then(setRefs)
        .catch(() => {});
  }, [refModule]);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const d: Row = {};
        const form = new FormData(e.currentTarget);
        fields.forEach((f) => {
          const value = form.get(f.key);
          if (f.key.startsWith("details.")) {
            d.details ||= { ...(defaults.details || {}) };
            d.details[f.key.slice(8)] =
              f.type === "number" && value !== "" ? Number(value) : value || "";
          } else if (value !== "" && value !== null)
            d[f.key] = f.type === "number" ? Number(value) : value;
          else if (f.required) d[f.key] = "";
        });
        try {
          if(endpoint==='/employees'&&method==='POST')d.generateCredentials=true;
          onSave(await api(endpoint, method, d));
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => {
          const defaultValue = f.key.startsWith("details.")
            ? defaults.details?.[f.key.slice(8)]
            : defaults[f.key];
          const relation =
            f.type === "student"
              ? students
              : f.type === "employee"
                ? employees
                : null;
          const reference =
            refModule &&
            ((module === "routes" && f.key === "vehicleId") ||
              (module !== "routes" && f.key === "title"));
          return (
            <label
              className={f.type === "textarea" ? "span-2" : ""}
              key={f.key}
            >
              {f.label}
              {!f.required && <span className="optional">Optional</span>}
              {relation ? (
                <select
                  aria-label={f.label}
                  name={f.key}
                  defaultValue={defaultValue || ""}
                  required={f.required}
                >
                  <option value="">Select {f.type}</option>
                  {relation.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                      {r.className ? ` · ${r.className} ${r.section}` : ""}
                    </option>
                  ))}
                </select>
              ) : reference ? (
                <select
                  aria-label={f.label}
                  name={f.key}
                  defaultValue={defaultValue || ""}
                  required={f.required}
                >
                  <option value="">
                    Select{" "}
                    {refModule === "library"
                      ? "book"
                      : refModule === "homework"
                        ? "assignment"
                        : refModule === "vehicles"
                          ? "vehicle"
                          : "route"}
                  </option>
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  name={f.key}
                  defaultValue={defaultValue || ""}
                  required={f.required}
                >
                  <option value="">Select an option</option>
                  {f.options?.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  name={f.key}
                  required={f.required}
                  defaultValue={defaultValue || ""}
                  rows={5}
                />
              ) : (
                <input
                  aria-label={f.label}
                  name={f.key}
                  type={f.type || "text"}
                  required={f.required}
                  defaultValue={defaultValue ?? ""}
                  min={f.type === "number" ? 0 : undefined}
                  step={f.type === "number" ? "0.01" : undefined}
                  minLength={f.type === "password" ? 8 : undefined}
                />
              )}
            </label>
          );
        })}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {endpoint==='/employees'&&method==='POST'&&<p className="form-note">Use an email that is not already registered as a school login. The employee ID and password are generated after you save.</p>}
      {endpoint.startsWith('/employees/')&&endpoint.endsWith('/login')&&<p className="form-note">The employee keeps their existing ID. A new password will be generated for the separate employee account; your administrator login stays unchanged.</p>}
      <div className="form-footer">
        <span>
          <LockKeyholeIcon /> Saved securely to school records
        </span>
        <button className="button dark" disabled={busy}>
          {busy ? "Saving…" : endpoint==='/employees'&&method==='POST'?"Create employee & login":endpoint.endsWith('/login')?"Generate employee ID & password":"Save record"}
          <Check size={17} />
        </button>
      </div>
    </form>
  );
}
function LockKeyholeIcon() {
  return <ShieldCheck size={14} />;
}
function MailIcon(p: any) {
  return <GraduationCap {...p} />;
}
function GradingRules({ onDone }: { onDone: () => void }) {
  const [bands, setBands] = useState<{ label: string; min: number }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/configuration/grading")
      .then(setBands)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/configuration/grading", "PUT", bands);
          onDone();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="form-intro">
        A grade applies when the percentage reaches its minimum. Keep a zero
        threshold for the lowest band. Published report cards use these rules.
      </p>
      {bands.map((b, i) => (
        <div className="grading-row" key={i}>
          <label>
            Grade
            <input
              required
              aria-label={`Grade ${i + 1}`}
              value={b.label}
              onChange={(e) =>
                setBands(
                  bands.map((v, n) =>
                    n === i ? { ...v, label: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Minimum %
            <input
              required
              type="number"
              min={0}
              max={100}
              value={b.min}
              onChange={(e) =>
                setBands(
                  bands.map((v, n) =>
                    n === i ? { ...v, min: Number(e.target.value) } : v,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove grade ${b.label}`}
            onClick={() => setBands(bands.filter((_, n) => i !== n))}
          >
            <X size={17} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="small-button"
        onClick={() => setBands([...bands, { label: "", min: 0 }])}
      >
        <Plus size={14} /> Add grade
      </button>
      {error && <p className="error">{error}</p>}
      <button className="button dark" disabled={busy || bands.length < 2}>
        {busy ? "Saving…" : "Save grading rules"}
        <Check size={16} />
      </button>
    </form>
  );
}
function Promotion({ student, onDone }: { student: Row; onDone: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("/students/promote", "POST", {
            ...Object.fromEntries(new FormData(e.currentTarget)),
            studentIds: [student.id],
          });
          onDone();
        } catch (e: any) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="form-intro">
        Update {student.name}’s enrollment. The previous class, section and
        session are retained in enrollment history.
      </p>
      <label>
        New class
        <input name="className" required defaultValue={student.className} />
      </label>
      <label>
        New section
        <input name="section" required defaultValue={student.section} />
      </label>
      <label>
        Academic session
        <input name="session" required defaultValue={student.session} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="button dark" disabled={busy}>
        {busy ? "Saving…" : "Confirm enrollment change"} <Check size={16} />
      </button>
    </form>
  );
}
function ImportRecords({
  kind,
  onDone,
}: {
  kind: string;
  onDone: (tokens: any[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<string[]>([]),
    [tokens, setTokens] = useState<any[]>([]);
  const fields = kind === "students" ? studentFields : employeeFields;
  return (
    <div className="form">
      <p className="form-intro">
        Use the template column names. Each row is validated by the server.
        Successful rows are saved immediately; failed rows are listed
        separately. Account activation links are shown after import.
      </p>
      <button
        className="small-button"
        onClick={() =>
          import("./excel").then((m) =>
            m.downloadExcel(
              [Object.fromEntries(fields.map((f) => [f.key, ""]))],
              `${kind}-template`,
            ),
          )
        }
      >
        <Download size={14} /> Download Excel template
      </button>
      <label>
        Excel workbook (.xlsx)
        <input
          type="file"
          accept=".xlsx"
          disabled={busy || results.length > 0}
          onChange={async (e) => {
            setError("");
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              const parsed = await (await import("./excel")).readExcel(f);
              for (const [i, row] of parsed.entries())
                for (const field of fields.filter((f) => f.required))
                  if (row[field.key] === undefined || row[field.key] === "")
                    throw new Error(`Row ${i + 2}: missing ${field.key}`);
              setRows(parsed);
            } catch (e: any) {
              setError(e.message);
            }
          }}
        />
      </label>
      {rows.length > 0 && (
        <p className="form-note">
          {rows.length} rows ready to validate and import.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <div className="import-results">
          {results.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
        </div>
      )}
      {results.length > 0 && !busy ? (
        <button className="button dark" onClick={() => onDone(tokens)}>
          Finish & view activation links <ArrowRight size={16} />
        </button>
      ) : (
        <button
          className="button dark"
          disabled={!rows.length || busy || !!error}
          onClick={async () => {
            setBusy(true);
            const links: any[] = [];
            for (const [i, row] of rows.entries()) {
              try {
                const data: Row = {};
                for (const f of fields) {
                  const value =
                    f.type === "number"
                      ? Number(row[f.key] || 0)
                      : String(row[f.key] ?? "");
                  if (f.key.startsWith("details.")) {
                    data.details ||= {};
                    data.details[f.key.slice(8)] = value;
                  } else data[f.key] = value;
                }
                const r = await api(`/${kind}`, "POST", data);
                links.push(...(r.activationTokens || []));
                setResults((v) => [...v, `Row ${i + 2}: saved ${row.name}`]);
              } catch (e: any) {
                setResults((v) => [
                  ...v,
                  `Row ${i + 2}: failed — ${e.message}`,
                ]);
              }
            }
            setTokens(links);
            setBusy(false);
          }}
        >
          {busy ? "Importing records…" : `Import ${rows.length || ""} records`}
        </button>
      )}
    </div>
  );
}
function Attendance({
  user,
  students,
  employees,
  rows,
  day,
  setDay,
  notify,
  refresh,
}: {
  user: Row;
  students: Row[];
  employees: Row[];
  rows: Row[];
  day: string;
  setDay: (s: string) => void;
  notify: (s: string) => void;
  refresh: () => void;
}) {
  const [kind, setKind] = useState(admins.includes(user.role)||["Student","Parent","Teacher","Class Teacher"].includes(user.role)?"students":"self"),
    [className, setClassName] = useState(""),
    [search, setSearch] = useState(""),
    [marks, setMarks] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [selfHistory, setSelfHistory] = useState<Row[]>([]);
  const manage =
    admins.includes(user.role) ||
    ["Teacher", "Class Teacher", "HR Manager"].includes(user.role);
  const staff = admins.includes(user.role) || user.role === "HR Manager";
  useEffect(() => {
    setMarks(Object.fromEntries(rows.map((r) => [r.personKey, r.status])));
    if (!["Student", "Parent"].includes(user.role))
      api("/attendance/self")
        .then(setSelfHistory)
        .catch(() => {});
  }, [rows]);
  const all = kind === "students" ? students : employees;
  const people = all.filter(
    (p) =>
      (!className || p.className === className) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="data-panel">
      <div className="table-toolbar">
        <div className="segmented">
          <button
            className={kind === "students" ? "active" : ""}
            onClick={() => setKind("students")}
          >
            Students
          </button>
          {!["Student", "Parent"].includes(user.role) && (
            <button
              className={kind === "self" ? "active" : ""}
              onClick={() => setKind("self")}
            >
              My attendance
            </button>
          )}
          {staff && (
            <button
              className={kind === "employees" ? "active" : ""}
              onClick={() => setKind("employees")}
            >
              Employees
            </button>
          )}
        </div>
        <div className="table-controls">
          <input
            aria-label="Attendance date"
            type="date"
            value={day}
            max={today()}
            onChange={(e) => setDay(e.target.value)}
          />
          {kind === "students" && (
            <select
              aria-label="Filter by class"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            >
              <option value="">All classes</option>
              {[...new Set(students.map((s) => s.className))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
          <input
            aria-label="Search people"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {!["Student", "Parent"].includes(user.role) && (
        <div className="checkin-bar">
          <span>
            <Clock size={16} /> Employee self attendance
          </span>
          <div>
            <button
              className="small-button"
              onClick={async () => {
                try {
                  await api("/attendance/check", "POST", { action: "in" });
                  notify("Checked in.");
                  refresh();
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              Check in
            </button>
            <button
              className="small-button"
              onClick={async () => {
                try {
                  await api("/attendance/check", "POST", { action: "out" });
                  notify("Checked out.");
                  refresh();
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              Check out
            </button>
          </div>
        </div>
      )}
      {kind === "self" ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Hours</th></tr>
            </thead>
            <tbody>
              {selfHistory.filter(r => r.date === day).map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td><Status value={r.status}/></td>
                  <td>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                  <td>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                  <td>{r.checkIn && r.checkOut ? ((Date.parse(r.checkOut)-Date.parse(r.checkIn))/3600000).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!selfHistory.some(r => r.date === day) && <Empty title="No attendance recorded for this date." text="Use the date selector to review your check-ins and check-outs."/>}
          {selfHistory.length > 0 && <div className="attendance-footer"><span>{selfHistory.length} daily records in your history</span><button className="small-button" onClick={()=>exportCsv(selfHistory.map(r=>({date:r.date,status:r.status,checkIn:r.checkIn,checkOut:r.checkOut,hours:r.checkIn&&r.checkOut?((Date.parse(r.checkOut)-Date.parse(r.checkIn))/3600000).toFixed(2):''})),'my-attendance')}>Export history <Download size={14}/></button></div>}
        </div>
      ) : people.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>
                    {kind === "students" ? "Class / section" : "Designation"}
                  </th>
                  <th>Attendance status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small className="subtext">
                        {p.admissionNo || p.employeeNo}
                      </small>
                    </td>
                    <td>
                      {p.className
                        ? `${p.className} / ${p.section}`
                        : p.designation}
                    </td>
                    <td>
                      {manage ? (
                        <select
                          aria-label={`Attendance for ${p.name}`}
                          value={marks[p.id] || ""}
                          onChange={(e) =>
                            setMarks({ ...marks, [p.id]: e.target.value })
                          }
                        >
                          <option value="">Not marked</option>
                          {[
                            "Present",
                            "Absent",
                            "Late",
                            "Half Day",
                            "Leave",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <Status value={marks[p.id] || "Not marked"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="attendance-footer">
            <span>
              {people.filter((p) => marks[p.id]).length} of {people.length}{" "}
              marked
            </span>
            <div>
              <button
                className="small-button"
                onClick={() =>
                  exportCsv(
                    people.map((p) => ({
                      name: p.name,
                      date: day,
                      status: marks[p.id] || "Not marked",
                    })),
                    "attendance",
                  )
                }
              >
                <Download size={14} /> Export
              </button>
              {manage && (
                <>
                  <button
                    className="button light"
                    onClick={() =>
                      setMarks({
                        ...marks,
                        ...Object.fromEntries(
                          people.map((p) => [p.id, "Present"]),
                        ),
                      })
                    }
                  >
                    Mark all present
                  </button>
                  <button
                    className="button dark"
                    disabled={busy || !people.some((p) => marks[p.id])}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/attendance", "POST", {
                          date: day,
                          period: "Daily",
                          records: people
                            .filter((p) => marks[p.id])
                            .map((p) => ({
                              [kind === "students"
                                ? "studentId"
                                : "employeeId"]: p.id,
                              status: marks[p.id],
                            })),
                        });
                        notify("Attendance saved.");
                        refresh();
                      } catch (e: any) {
                        notify(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Saving…" : "Save attendance"} <Check size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <Empty
          title="No people in this view yet."
          text="Add records or choose another class to begin."
        />
      )}
    </section>
  );
}
function SettingsPage({
  onSaved,
  user,
  onLogout,
  notify,
}: {
  user: Row;
  onSaved:()=>void;
  onLogout: () => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-grid">
      {user.role==='Super Admin'&&<SchoolSettings notify={notify} onSaved={onSaved}/>}
      <section className="data-panel settings-card">
        <span className="avatar large">
          {user.name.slice(0, 2).toUpperCase()}
        </span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        <Status value={user.role} />
        <button className="button light" onClick={onLogout}>
          <LogOut size={17} /> Sign out
        </button>
      </section>
      <section className="data-panel settings-card">
        <h3>Change your password</h3>
        <p>Keep your school account secure.</p>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget;
            try {
              await api(
                "/auth/password",
                "POST",
                Object.fromEntries(new FormData(form)),
              );
              notify("Password changed. Other sessions were signed out.");
              form.reset();
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Current password
            <input
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <button className="button dark" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
            <Check size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
function Reports({
  students,
  notify,
}: {
  students: Row[];
  notify: (s: string) => void;
}) {
  const [student, setStudent] = useState("");
  return (
    <div className="reports-grid">
      <section className="data-panel report-card">
        <FileCheck size={28} />
        <h3>Student reports</h3>
        <p>Download a profile, ID card or published academic report.</p>
        <select
          aria-label="Select student for report"
          value={student}
          onChange={(e) => setStudent(e.target.value)}
        >
          <option value="">Choose a student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.className}
            </option>
          ))}
        </select>
        <div>
          {[
            ["student", "Student profile"],
            ["idcard", "ID card"],
            ["reportcard", "Report card"],
          ].map(([kind, label]) => (
            <button
              key={kind}
              className="small-button"
              disabled={!student}
              onClick={async () => {
                const r = await fetch(`/api/reports/${kind}/${student}`);
                if (!r.ok) {
                  const d = await r.json();
                  notify(d.error);
                  return;
                }
                const url = URL.createObjectURL(await r.blob());
                const a = document.createElement("a");
                a.href = url;
                a.download = `${kind}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={14} />
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="data-panel report-card">
        <BarChart3 size={28} />
        <h3>School data exports</h3>
        <p>
          Every record table includes search, filters and CSV export. Exports
          use your current filtered view and respect your account access.
        </p>
        <span className="badge positive">Open in Excel or Google Sheets</span>
        <p>
          Fee receipts are available from each invoice’s ledger. Approved
          payslips can be downloaded from HR & payroll.
        </p>
      </section>
    </div>
  );
}

function SubmissionForm({assignment,onDone}:{assignment?:Row;onDone:()=>void}){
  const [assignments,setAssignments]=useState<Row[]>(assignment?[assignment]:[]),[selected,setSelected]=useState(assignment?.id||''),[answer,setAnswer]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!assignment)api('/records/homework').then(setAssignments).catch(e=>setError(e.message))},[]);
  const chosen=assignments.find(a=>a.id===selected);
  return <form className="record-form submission-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{let documentId='';if(file){if(file.size>5*1024*1024)throw new Error('Choose a file smaller than 5 MB.');const form=new FormData();form.append('file',file);documentId=(await api('/documents','POST',form)).id;}await api('/records/submissions','POST',{title:selected,answer,documentId});onDone()}catch(e:any){setError(e.message)}finally{setBusy(false)}}}>
    <label>Assignment<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose your assignment</option>{assignments.map(a=><option key={a.id} value={a.id}>{a.title} · {a.data.subject}</option>)}</select></label>
    {chosen&&<div className="assignment-instructions"><strong>Due {chosen.data.dueDate}</strong><p>{chosen.data.instructions}</p></div>}
    <label>Your work<textarea required rows={7} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Write your answer or describe your attached work."/></label>
    <label>Attach your work (optional)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>PDF, PNG or JPEG · maximum 5 MB</small></label>
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="button dark" disabled={busy||!selected}>{busy?'Submitting…':'Submit assignment'}</button>
  </form>
}
