export type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  min?: number;
};
export type Module = {
  label: string;
  singular: string;
  description: string;
  roles: string[];
  fields: Field[];
};
export const roles = [
  "Super Admin",
  "School Admin",
  "Principal",
  "Vice Principal",
  "Accountant",
  "HR Manager",
  "Teacher",
  "Class Teacher",
  "Librarian",
  "Transport Manager",
  "Receptionist",
  "Student",
  "Employee",
];
export const admins = [
  "Super Admin",
  "School Admin",
  "Principal",
  "Vice Principal",
];
const f = (
  key: string,
  label: string,
  type = "text",
  required = true,
  options?: string[],
): Field => ({ key, label, type, required, options });
export const modules: Record<string, Module> = {
  progress:{label:'Student progress & behaviour',singular:'Progress record',description:'Record academic progress, behaviour and next steps for assigned students.',roles:[...admins,'Teacher','Class Teacher'],fields:[f('title','Record title'),f('studentId','Student','student'),f('subject','Subject'),f('period','Review period'),f('academic','Academic progress','textarea'),f('behaviour','Behaviour & participation','textarea'),f('nextSteps','Next steps','textarea')]},
  studentAssessments:{label:'Student assessments',singular:'Student assessment',description:'Principal review of learning, attendance and behaviour.',roles:admins,fields:[f('title','Assessment title'),f('studentId','Student','student'),f('period','Review period'),f('score','Overall score (0–100)','number'),f('observations','Observations','textarea'),f('recommendations','Recommendations','textarea')]},
  employeeAssessments:{label:'Employee assessments',singular:'Employee assessment',description:'Review staff work, attendance and professional contribution.',roles:admins,fields:[f('title','Assessment title'),f('employeeId','Employee','employee'),f('period','Review period'),f('score','Overall score (0–100)','number'),f('observations','Work & attendance observations','textarea'),f('recommendations','Development recommendations','textarea')]},
  appraisals:{label:'Employee appraisals',singular:'Appraisal',description:'Prepare an appraisal and submit it for principal approval.',roles:[...admins,'HR Manager'],fields:[f('title','Appraisal title'),f('employeeId','Employee','employee'),f('period','Review period'),f('score','Overall score (0–100)','number'),f('strengths','Strengths','textarea'),f('development','Development plan','textarea')]},
  recruitment:{label:'Recruitment & onboarding',singular:'Candidate',description:'Track applications, interviews, offers and onboarding.',roles:[...admins,'HR Manager'],fields:[f('title','Candidate name'),f('email','Email','email'),f('phone','Phone'),f('position','Position'),f('department','Department'),f('stage','Stage','select',true,['Applied','Interview','Offer','Hired','Rejected']),f('interviewDate','Interview date','date',false),f('notes','Interview / onboarding notes','textarea',false)]},
  workReports:{label:'Work reports',singular:'Work report',description:'Share completed work, blockers and next steps with school leadership.',roles:roles.filter(r=>r!=='Student'),fields:[f('title','Report title'),f('period','Reporting period'),f('achievements','Completed work','textarea'),f('blockers','Blockers','textarea',false),f('nextSteps','Next steps','textarea')]},
  schoolReports:{label:'School reports',singular:'School report',description:'Prepare academic, department or operational reports for approval.',roles:admins,fields:[f('title','Report title'),f('period','Reporting period'),f('category','Category','select',true,['Academic','Department','Attendance','Staff','Financial','School-wide']),f('summary','Summary','textarea'),f('recommendations','Recommendations','textarea')]},

  accessRequests:{label:'Account access requests',singular:'Access request',description:'Help school members regain access to their accounts.',roles:admins,fields:[]},
  academics: {
    label: "Academic setup",
    singular: "Class",
    description: "Organise sessions, classes, sections and subjects.",
    roles: admins,
    fields: [
      f("title", "Class name"),
      f("session", "Academic session"),
      f("section", "Section"),
      f("subjects", "Subjects"),
      f("teacherId", "Class teacher", "employee"),
    ],
  },
  timetable: {
    label: "Timetable",
    singular: "Period",
    description: "A clear rhythm for every school day.",
    roles: [...admins, "Teacher", "Class Teacher"],
    fields: [
      f("title", "Subject"),
      f("className", "Class"),
      f("section", "Section"),
      f("day", "Day", "select", true, [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ]),
      f("start", "Starts at", "time"),
      f("end", "Ends at", "time"),
      f("teacherId", "Teacher", "employee"),
      f("room", "Classroom"),
    ],
  },
  homework: {
    label: "Homework",
    singular: "Assignment",
    description: "Keep learning going beyond the classroom.",
    roles: [...admins, "Teacher", "Class Teacher"],
    fields: [
      f("title", "Assignment title"),
      f("className", "Class"),
      f("section", "Section"),
      f("subject", "Subject"),
      f("dueDate", "Due date", "date"),
      f("instructions", "Instructions", "textarea"),
    ],
  },
  submissions: {
    label: "Submissions",
    singular: "Submission",
    description: "Submit work and follow teacher feedback.",
    roles: ["Student", ...admins, "Teacher", "Class Teacher"],
    fields: [
      f("title", "Assignment ID"),
      f("answer", "Your work", "textarea"),
      f("documentId", "Attached document ID", "text", false),
    ],
  },
  leave: {
    label: "Leave requests",
    singular: "Leave request",
    description: "Apply, review and track time away.",
    roles: roles,
    fields: [
      f("title", "Reason", "textarea"),
      f("type", "Leave type", "select", true, [
        "Sick",
        "Casual",
        "Earned",
        "Other",
      ]),
      f("start", "From", "date"),
      f("end", "Until", "date"),
    ],
  },
  library: {
    label: "Library",
    singular: "Book",
    description: "A little curiosity. A whole world of books.",
    roles: [...admins, "Librarian"],
    fields: [
      f("title", "Book title"),
      f("author", "Author"),
      f("isbn", "ISBN"),
      f("category", "Category"),
      f("quantity", "Copies", "number"),
      f("dailyFine", "Late fine per day (₹)", "number", false),
    ],
  },
  loans: {
    label: "Book circulation",
    singular: "Book issue",
    description: "Issue books, track due dates and record returns.",
    roles: [...admins, "Librarian"],
    fields: [
      f("title", "Book record ID"),
      f("studentId", "Student", "student"),
      f("dueDate", "Return by", "date"),
    ],
  },
  vehicles: {
    label: "Vehicles",
    singular: "Vehicle",
    description: "Manage the fleet and the people behind the wheel.",
    roles: [...admins, "Transport Manager"],
    fields: [
      f("title", "Registration number"),
      f("driver", "Driver name"),
      f("phone", "Driver contact", "tel"),
      f("capacity", "Seats", "number"),
      f("maintenanceDate", "Next maintenance", "date"),
    ],
  },
  routes: {
    label: "Transport routes",
    singular: "Route",
    description: "Connect students with a safe journey to school.",
    roles: [...admins, "Transport Manager"],
    fields: [
      f("title", "Route name"),
      f("vehicleId", "Vehicle record ID"),
      f("stops", "Stops", "textarea"),
      f("fee", "Monthly fee (₹)", "number"),
    ],
  },
  transport: {
    label: "Transport assignments",
    singular: "Assignment",
    description: "Assign a student to their route and stop.",
    roles: [...admins, "Transport Manager"],
    fields: [
      f("title", "Route record ID"),
      f("studentId", "Student", "student"),
      f("stop", "Pickup stop"),
    ],
  },
  inventory: {
    label: "Inventory",
    singular: "Asset",
    description: "Look after the resources that support learning.",
    roles: admins,
    fields: [
      f("title", "Item name"),
      f("category", "Category", "select", true, [
        "Computers",
        "Laboratory",
        "Furniture",
        "Sports",
        "Stationery",
        "Other",
      ]),
      f("quantity", "Quantity", "number"),
      f("minimum", "Low-stock threshold", "number"),
      f("location", "Location"),
      f("vendor", "Vendor", "text", false),
    ],
  },
  purchases: {
    label: "Purchase records",
    singular: "Purchase",
    description: "Keep a record of purchases and suppliers.",
    roles: [...admins, "Accountant"],
    fields: [
      f("title", "Purchase description"),
      f("vendor", "Vendor"),
      f("amount", "Amount (₹)", "number"),
      f("date", "Purchase date", "date"),
    ],
  },
  notices: {
    label: "Communication",
    singular: "Notice",
    description: "Keep your school community in the loop.",
    roles: [...admins, "Teacher", "Class Teacher"],
    fields: [
      f("title", "Title"),
      f("body", "Message", "textarea"),
      f("audience", "Audience", "select", true, [
        "Everyone",
        "Students",
        "Parents",
        "Employees",
        "Public",
      ]),
      f("publishDate", "Publish date", "date"),
    ],
  },
  events: {
    label: "School calendar",
    singular: "Event",
    description: "Make room for the moments that matter.",
    roles: admins,
    fields: [
      f("title", "Event name"),
      f("date", "Date", "date"),
      f("location", "Location"),
      f("description", "Details", "textarea"),
    ],
  },
  departments: {
    label: "Departments",
    singular: "Department",
    description: "Organise your school team.",
    roles: [...admins, "HR Manager"],
    fields: [
      f("title", "Department"),
      f("head", "Department head"),
      f("description", "Description", "textarea", false),
    ],
  },
  feeStructures: {
    label: "Fee structures",
    singular: "Fee structure",
    description: "Define fees for a class and academic session.",
    roles: [...admins, "Accountant"],
    fields: [
      f("title", "Fee name"),
      f("className", "Class"),
      f("session", "Session"),
      f("amount", "Amount (₹)", "number"),
      f("frequency", "Frequency", "select", true, [
        "Monthly",
        "Quarterly",
        "Annual",
        "One-time",
      ]),
    ],
  },
  admissions: {
    label: "Admissions",
    singular: "Application",
    description: "Welcome the next generation of curious minds.",
    roles: [...admins, "Receptionist"],
    fields: [],
  },
};
export const publicPages: Record<string, { title: string; body: string }> = {
  home: {
    title: "Small wonders.\nLimitless\npossibilities.",
    body: "A space to be curious. The confidence to be yourself. A community that helps every young mind find its own way.",
  },
  about: {
    title: "Open minds. Open futures.",
    body: "At Open Mind's Public School, our vision is simple: make room for curiosity, encourage thoughtful questions and nurture the confidence to keep learning. Our school brings academic learning and personal growth together.",
  },
  academics: {
    title: "Learning, beyond the textbook.",
    body: "Explore foundational learning, primary and secondary education. Our approach connects classroom concepts with reading, discussion, creative expression and practical exploration. Contact the school for the confirmed curriculum and class availability.",
  },
  admissions: {
    title: "Every great journey begins with a hello.",
    body: "Send an enquiry, connect with our admissions team, and find the right next step for your child. The school will confirm eligibility, documents, class availability and the applicable fee structure.",
  },
  facilities: {
    title: "Space to discover your spark.",
    body: "Explore learning spaces, reading, science, creativity and sport. Arrange a visit with the school to discover the facilities and programmes currently available.",
  },
  contact: {
    title: "Let’s start a conversation.",
    body: "Use our enquiry form to reach the admissions team. Verified address, phone number and visiting hours can be added by the school administrator.",
  },
  privacy: {
    title: "Privacy policy",
    body: "The school uses information submitted here to respond to enquiries and administer school services. Access to school records is restricted by role. Contact the school administrator for data access or correction requests. The school must review and complete this policy before public launch.",
  },
  terms: {
    title: "Terms of use",
    body: "Use your own account and keep credentials confidential. Submitted information must be accurate. Fees, admissions and academic decisions are subject to school confirmation. The school must review and complete these terms before public launch.",
  },
  careers: {
    title: "Help a young mind find its way.",
    body: "Interested in joining our school community? Contact the school through the enquiry form and mention your area of interest. Confirmed vacancies will be shared here by the administration.",
  },
  downloads: {
    title: "The information you need, in one place.",
    body: "Contact the school for the prospectus, confirmed academic calendar and admission documents.",
  },
};
