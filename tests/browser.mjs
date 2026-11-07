import "dotenv/config";
import pg from "pg";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
const file = path.resolve(`data/test-browser-${process.pid}.db`);
writeFileSync(file, "");
mkdirSync("test-results", { recursive: true });
const postgres = process.env.DATABASE_URL?.startsWith("postgresql:");
const schema = `test_browser_${process.pid}`;
const url = postgres ? new URL(process.env.DATABASE_URL) : null;
if (url) url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url?.toString() || `file:${file}`,
  NODE_ENV: "test",
  PORT: "3101",
  APP_ORIGIN: "http://127.0.0.1:3101",
};
execFileSync(
  "npx",
  [
    "prisma",
    "db",
    "push",
    "--schema",
    postgres ? "prisma/schema.prisma" : "prisma/local.prisma",
    "--skip-generate",
  ],
  { env, stdio: "inherit" },
);
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env,
  stdio: "pipe",
});
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3101/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3101/");
  await page.getByRole("heading", { name: /A brighter future/ }).waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(async()=>{const images=Array.from(document.images);images.forEach(img=>img.loading="eager");await Promise.all(images.map(img=>img.decode()));});
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole('button',{name:/Ages 6–10.*Free activity/}).first().click();
  await page.getByRole('dialog').waitFor();
  const activityDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download activity',exact:true}).click();
  assert.ok((await activityDownload).suggestedFilename().endsWith('.txt'));
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Next resources',exact:true}).click();
  await page.getByText('Little acts of kindness',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Previous resources',exact:true}).click();
  await page.getByRole('button',{name:'Try the mini quiz',exact:true}).click();
  for(const answer of ['Roots','10','Loud'])await page.getByRole('button',{name:answer,exact:true}).click();
  await page.getByRole('heading',{name:'3 of 3 correct',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole("button", { name: "Admissions", exact: true }).click();
  await page.getByLabel("Child’s name").fill("Browser Applicant");
  await page.getByLabel("Parent / guardian name").fill("Browser Parent");
  await page.getByLabel("Email address").fill("browser-parent@test.example");
  await page.getByLabel("Phone number").fill("9999999999");
  await page.getByLabel("Class of interest").selectOption("Class 5");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send admission enquiry" }).click();
  await page.getByText("A new beginning. We’re glad you’re here.").waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "School portal", exact: true })
    .click();
  await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  await page.screenshot({path:'test-results/login-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/login-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1050});
  // The story text's transparent padding must never intercept the home link.
  for (const viewport of [{width:1440,height:1050},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for (const role of ['admin','principal','teacher','hr','accounts','student','employee']) {
      await page.goto('http://127.0.0.1:3101/#/login/'+role);
      await page.getByRole('link',{name:'Back to school website',exact:true}).click();
      await page.waitForURL('**/#/');
      await page.getByRole('heading',{name:/A brighter future/}).waitFor();
    }
  }
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('http://127.0.0.1:3101/#/login/admin');
  const homeLink=page.getByRole('link',{name:'Back to school website',exact:true});
  await homeLink.focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:/A brighter future/}).waitFor();
  await page.goto('http://127.0.0.1:3101/#/login/admin');
  await page.getByRole('link',{name:'Create administrator account'}).click();
  await page.getByLabel("Your name").fill("School Administrator");
  await page.getByLabel("Email address").fill("browser-admin@test.example");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-password-12345");
  await page.getByLabel('Confirm password',{exact:true}).fill('browser-password-12345');
  await page.getByRole("button", { name: "Create administrator account" }).click();
  await page.getByRole("heading", { name: "Hello, School." }).waitFor();
  await page.locator('.admin-dashboard-v2').waitFor();
  for (const name of ['Vehicles','Routes','Transport','Inventory','Purchases','Delivery log']) {
    assert.equal(await page.getByRole('navigation',{name:'Portal navigation'}).getByRole('button',{name,exact:true}).count(),0, name+' removed from navigation');
    await page.getByLabel('Find a workspace module').fill(name);
    assert.equal(await page.locator('.ad-module-grid > button').count(),0,name+' removed from dashboard');
  }
  await page.getByLabel('Find a workspace module').fill('attendance');
  assert.ok(await page.locator('.ad-module-grid > button').count()>0,'Module search finds attendance');
  await page.getByLabel('Find a workspace module').fill('');
  await page.getByRole('button',{name:'Next school calendar week'}).click();
  await page.getByRole('button',{name:'Back to today',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back to today',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Back to today',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/admin-redesign-mobile.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Admin redesign mobile overflow');
  await page.setViewportSize({width:1440,height:1050});
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Browser Student");
  await page.getByLabel("Student email").fill("browser-student@test.example");
  await page.getByLabel("Date of birth").fill("2015-03-01");
  await page.getByLabel("Gender", { exact: true }).selectOption("Female");
  await page.getByLabel("Class", { exact: true }).fill("5");
  await page.getByLabel("Parent / guardian name").fill("Browser Parent");
  await page.getByLabel("Parent email").fill("browser-parent@test.example");
  await page.getByLabel("Parent phone").fill("9999999999");
  await page.getByLabel("Address", { exact: true }).fill("Test address");
  const createdPromise=page.waitForResponse(r=>r.url().endsWith('/api/students')&&r.request().method()==='POST');
  await page.getByRole("button", { name: "Save record" }).click();
  const createdStudent=await (await createdPromise).json();
  await page
    .getByRole("heading", { name: "Accounts are ready to activate." })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByText("Browser Student", { exact: true }).waitFor();
  await page.screenshot({
    path: "test-results/students-desktop.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/students-export.xlsx");
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.readFile("test-results/students-export.xlsx");
  assert.equal(exported.worksheets[0].rowCount, 2);
  const importBook = new ExcelJS.Workbook();
  const importSheet = importBook.addWorksheet("Students");
  const importRow = {
    name: "Imported Student",
    email: "imported@test.example",
    dob: "2014-03-01",
    gender: "Male",
    className: "6",
    section: "B",
    session: "2026–2027",
    parentName: "Imported Parent",
    parentEmail: "imported-parent@test.example",
    phone: "9999999999",
    address: "Import test address",
  };
  importSheet.addRow(Object.keys(importRow));
  importSheet.addRow(Object.values(importRow));
  await importBook.xlsx.writeFile("test-results/import-students.xlsx");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles("test-results/import-students.xlsx");
  await page.getByText("1 rows ready to validate and import.").waitFor();
  await page
    .getByRole("button", { name: "Import 1 records", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish & view activation links" })
    .click();
  await page
    .getByRole("heading", { name: "Accounts are ready to activate." })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByText("Imported Student", { exact: true }).waitFor();

  for (const name of [
    "Admissions",
    "Academic setup",
    "Timetable",
    "Attendance",
    "Examinations",
    "Homework",
    "Leave requests",
    "Fees & payments",
    "HR & payroll",
    "Library",
    "Communication",
    "Website CMS",
    "Users & access",
    "Documents",
    "Activity log",
    "Student progress", "Student assessments", "Employee assessments", "Employee appraisals", "Recruitment & onboarding", "Work reports", "School reports", "Approval workflow", "Notifications", "Roles & permissions", "Central reports & analytics", "Payment verification",
  ]) {
    await page
      .getByRole("navigation", { name: "Portal navigation" })
      .getByRole("button", { name, exact: true })
      .click();
    await page.locator('.skeleton').first().waitFor({state:'hidden'});
    assert.equal(errors.length,0,errors.join('\n'));
    assert.equal(
      await page.locator(".error-state").count(),
      0,
      `${name} should load`,
    );
  }
  await page.getByRole('navigation',{name:'Portal navigation'}).getByRole('button',{name:'Attendance',exact:true}).click();
  await page.getByRole('button',{name:'My attendance',exact:true}).click();
  await page.getByRole('columnheader',{name:'Hours',exact:true}).waitFor();
  await page.getByRole("button", { name: "Super Admin dashboard", exact: true }).click();
  async function adminApi(path,body){return page.evaluate(async({path,body})=>{const me=await (await fetch('/api/auth/me')).json();const r=await fetch('/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-school-request':'1','x-csrf-token':me.csrf},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.json()},{path,body});}
  for(const token of createdStudent.activationTokens){const r=await fetch('http://127.0.0.1:3101/api/auth/reset',{method:'POST',headers:{'content-type':'application/json','x-school-request':'1'},body:JSON.stringify({token:token.token,password:'member-password-12345'})});assert.equal(r.status,200);}
  await adminApi('/records/homework',{title:'Explore your neighbourhood',className:'5',section:'A',subject:'Science',dueDate:'2099-12-31',instructions:'Write about three plants you found near your home.'});
  await page.getByRole('button',{name:'Add employee',exact:true}).click();
  const employeeForm=page.getByRole('dialog');
  await employeeForm.getByLabel('Full name',{exact:true}).fill('Browser Employee');
  await employeeForm.getByLabel('Email',{exact:true}).fill('browser-employee@test.example');
  await employeeForm.getByLabel('Phone',{exact:true}).fill('9999999999');
  await employeeForm.getByLabel('Department',{exact:true}).fill('Operations');
  await employeeForm.getByLabel('Designation',{exact:true}).selectOption('Employee');
  await employeeForm.getByLabel('Joining date',{exact:true}).fill('2026-04-01');
  await employeeForm.getByLabel('Qualification',{exact:true}).fill('Graduate');
  await employeeForm.getByLabel('Monthly basic salary (₹)',{exact:true}).fill('20000');
  const employeeCreated=page.waitForResponse(r=>r.url().endsWith('/api/employees')&&r.request().method()==='POST');
  await employeeForm.getByRole('button',{name:'Create employee & login',exact:true}).click();
  const employeeResponse=await employeeCreated;assert.equal(employeeResponse.status(),201);const staff=await employeeResponse.json();
  await page.getByRole('heading',{name:'Employee login is ready',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Generated password',{exact:true}).inputValue(),staff.credentials.password);
  assert.equal(await page.getByLabel('Generated password',{exact:true}).getAttribute('type'),'password');
  const credentialsDownload=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Download',exact:true}).click();assert.match((await credentialsDownload).suggestedFilename(),/EMP-.*-login.txt/);
  await page.screenshot({path:'test-results/employee-generated-login.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/employee-generated-login-mobile.png',fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1050});
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Portal navigation'});
  await nav.getByRole('button',{name:'Roles & permissions',exact:true}).click();
  await page.getByLabel('Role name',{exact:true}).fill('Library and stock assistant');
  await page.getByLabel('Inventory permission',{exact:true}).selectOption('manage');
  await page.getByRole('button',{name:'Save role profile',exact:true}).click();
  await page.getByText('Role profile saved.',{exact:true}).waitFor();
  await page.screenshot({path:'test-results/role-profile-saved.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  await page.getByLabel('School member',{exact:true}).selectOption(staff.record.userId);
  await page.getByLabel('Assigned role',{exact:true}).selectOption({label:'Library and stock assistant · Employee'});
  await page.getByRole('button',{name:'Assign access',exact:true}).click();
  await page.getByText('Access assigned. The member must sign in again.',{exact:true}).waitFor();
  await page.screenshot({path:'test-results/role-permissions.png',fullPage:true});
  await page.goto('http://127.0.0.1:3101/#/admin/settings');
  await page.getByLabel('Default academic session',{exact:true}).fill('2027–2028');
  await page.getByRole('button',{name:'Save school settings',exact:true}).click();
  await page.getByText('School settings saved.',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:3101/#/admin/academics');await page.getByRole('button',{name:'Add class',exact:true}).click();
  assert.equal(await page.getByLabel('Academic session',{exact:true}).inputValue(),'2027–2028');
  await page.getByRole('button',{name:'Close dialog'}).click();
  const report=await adminApi('/records/schoolReports',{title:'Browser school review',period:'Term 1',category:'School-wide',summary:'Attendance reviewed',recommendations:'Continue class reviews'});
  await adminApi('/workflow/submit',{type:'schoolReports',entityId:report.id});
  await adminApi('/records/recruitment',{title:'Browser Candidate',email:'browser-candidate@test.example',phone:'9999999999',position:'Teacher',department:'Science',stage:'Offer'});
  const roleLogins=[];
  for(const [kind,role] of [['principal','Principal'],['teacher','Teacher'],['hr','HR Manager'],['accounts','Accountant']]){
    const email='browser-'+kind+'@test.example';await adminApi('/users',{name:'Browser '+role,email,password:'member-password-12345',role});roleLogins.push([kind,email]);
  }
  for(const [kind,identifier] of [['student',createdStudent.record.admissionNo],['employee',staff.record.employeeNo],...roleLogins]){
    const context=await browser.newContext({viewport:{width:1440,height:1050}});const member=await context.newPage();member.setDefaultTimeout(15000);member.on('pageerror',e=>{errors.push(e.message);console.error(kind,e.message)});
    await member.goto('http://127.0.0.1:3101/#/login/'+kind);
    await member.locator('input[name="identifier"]').fill(identifier);await member.getByLabel('Password',{exact:true}).fill(kind==='employee'?staff.credentials.password:'member-password-12345');
    await member.getByRole('button',{name:'Sign in as '+(kind==='accounts'?'fees & accounts':kind),exact:true}).click();
    await member.waitForURL('**/#/'+kind+'/overview');await member.locator('.member-welcome').waitFor();
    await member.screenshot({path:'test-results/'+kind+'-dashboard.png',fullPage:true});
    const navigation=member.getByRole('navigation',{name:'Portal navigation'});
    assert.equal(await navigation.getByRole('button',{name:'Users & access',exact:true}).count(),0);
    await member.goto('http://127.0.0.1:3101/#/admin/users');await member.waitForURL('**/#/'+kind+'/overview');
    if(['teacher','hr','principal'].includes(kind)){
      await navigation.getByRole('button',{name:'Students',exact:true}).click();
      await member.getByRole('button',{name:'Add student',exact:true}).click();
      const form=member.getByRole('dialog');const name='Student added by '+kind;
      await form.getByLabel('Full name',{exact:true}).fill(name);await form.getByLabel('Student email',{exact:true}).fill(kind+'-added@student.test');await form.getByLabel('Date of birth',{exact:true}).fill('2015-03-01');await form.getByLabel('Gender',{exact:true}).selectOption('Female');await form.getByLabel('Class',{exact:true}).fill('New-'+kind);await form.getByLabel('Parent / guardian name',{exact:true}).fill('Test Guardian');await form.getByLabel('Parent email',{exact:true}).fill(kind+'-guardian@student.test');await form.getByLabel('Parent phone',{exact:true}).fill('9999999999');await form.getByLabel('Address',{exact:true}).fill('Test address');
      const response=member.waitForResponse(r=>r.url().endsWith('/api/students')&&r.request().method()==='POST');await form.getByRole('button',{name:'Save record',exact:true}).click();assert.equal((await response).status(),201);
      await member.getByRole('heading',{name:'Accounts are ready to activate.',exact:true}).waitFor();await member.getByRole('button',{name:'Close dialog',exact:true}).click();
      const row=member.getByRole('row').filter({hasText:name});await row.waitFor();await member.screenshot({path:'test-results/'+kind+'-student-access.png',fullPage:true});
      if(kind==='teacher'){
      const n=await adminApi('/records/notices',{title:'Teacher notification connection',body:'Your linked school notice is ready.',audience:'Employees',publishDate:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})});
      await member.locator('.notification-bell').click();
      await member.locator('.notification-preview').waitFor();await member.locator('.notification-preview').getByText('Teacher notification connection',{exact:true}).waitFor();
      await member.getByRole('button',{name:'View all notifications',exact:true}).click();await member.getByRole('heading',{name:'Your notification inbox',exact:true}).waitFor();
      await member.getByLabel('Search notifications',{exact:true}).fill('Teacher notification connection');await member.locator('.notification-item').filter({hasText:'Teacher notification connection'}).waitFor();
      await member.screenshot({path:'test-results/notifications-desktop.png',fullPage:true});
      const item=member.locator('.notification-item').filter({hasText:'Teacher notification connection'});
      await item.getByRole('button',{name:'Mark read',exact:true}).click();await item.getByRole('button',{name:'Mark unread',exact:true}).waitFor();await item.getByRole('button',{name:'Mark unread',exact:true}).click();await item.getByRole('button',{name:'Mark read',exact:true}).waitFor();
      await member.setViewportSize({width:390,height:844});await member.screenshot({path:'test-results/notifications-mobile.png',fullPage:true,animations:'disabled'});assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await item.getByRole('button',{name:'Open Teacher notification connection',exact:true}).click();await member.waitForURL('**/#/teacher/notices?record='+n.id);await member.getByRole('cell',{name:'Teacher notification connection',exact:true}).waitFor();
      await member.getByRole('button',{name:'Show all records',exact:true}).click();await member.waitForURL('**/#/teacher/notices');
      await member.locator('.notification-bell').click();await member.getByRole('button',{name:'View all notifications',exact:true}).click();
      await member.getByRole('button',{name:'Mark all as read',exact:true}).click();await member.getByRole('tab',{name:'Unread',exact:true}).click();await member.getByRole('heading',{name:'You’re all caught up.',exact:true}).waitFor();
      await member.setViewportSize({width:1440,height:1050});
    }
    if(kind==='principal'){await row.getByRole('button',{name:'Archive record',exact:true}).click();await member.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await member.getByRole('dialog').waitFor({state:'hidden'});await row.waitFor({state:'hidden'});}
      else{assert.equal(await member.getByRole('button',{name:'Archive record',exact:true}).count(),0,kind+' cannot archive students');assert.equal(await member.getByRole('button',{name:'Edit record',exact:true}).count(),0);}
    }
    if(kind==='principal'){
      await navigation.getByRole('button',{name:'Approval workflow',exact:true}).click();
      await member.getByRole('button',{name:'View & review',exact:true}).click();
      await member.getByLabel('Review comment',{exact:true}).fill('School records checked in browser review.');
      await member.getByRole('button',{name:'Confirm decision',exact:true}).click();
      await member.getByRole('dialog').waitFor({state:'hidden'});await member.locator('.flow-request-list .badge').getByText('Approved',{exact:true}).waitFor();
      await member.screenshot({path:'test-results/principal-approval.png',fullPage:true});
    }
    if(kind==='hr'){
      await navigation.getByRole('button',{name:'Recruitment & onboarding',exact:true}).click();
      await member.getByRole('button',{name:'Onboard employee',exact:true}).click();
      await member.getByLabel('Joining date',{exact:true}).fill('2026-11-06');await member.getByLabel('Qualification',{exact:true}).fill('B.Ed');await member.getByLabel('Monthly salary (₹)',{exact:true}).fill('25000');
      await member.getByRole('dialog').getByRole('button',{name:'Save record',exact:true}).click();
      await member.getByRole('heading',{name:'Accounts are ready to activate.',exact:true}).waitFor();
      await member.getByRole('button',{name:'Close dialog'}).click();
      assert.equal(await member.getByRole('button',{name:'Onboard employee',exact:true}).count(),0);
    }
    if(kind==='student'){
      await navigation.getByRole('button',{name:'Homework',exact:true}).click();await member.getByRole('button',{name:'View details',exact:true}).click();
      await member.getByText('Write about three plants you found near your home.',{exact:true}).waitFor();await member.getByRole('button',{name:'Submit your work',exact:true}).click();
      await member.getByLabel('Your work',{exact:true}).fill('I observed a neem tree, basil and a rose plant.');await member.getByRole('button',{name:'Submit assignment',exact:true}).click();await member.waitForURL('**/#/student/submissions');await member.getByRole('dialog').waitFor({state:'hidden'});await member.getByText('I observed a neem tree, basil and a rose plant.',{exact:true}).waitFor();
    }
    if(kind==='employee'){
      assert.equal(await navigation.getByRole('button',{name:'Inventory',exact:true}).count(),0);
      await member.getByRole('button',{name:'Check in',exact:true}).click();await member.getByText('You’re checked in.',{exact:true}).waitFor();
      await member.getByRole('button',{name:'Check out',exact:true}).click();await member.getByText('Your day is recorded.',{exact:true}).waitFor();
      await navigation.getByRole('button',{name:'My profile',exact:true}).click();await member.getByRole('heading',{name:'Browser Employee',exact:true}).waitFor();
    }
    await member.goto('http://127.0.0.1:3101/#/'+kind+'/overview');await member.locator('.member-welcome').waitFor().catch(async e=>{await member.screenshot({path:'test-results/role-failure.png',fullPage:true});console.error(member.url(),await member.locator('body').innerText());throw e});await member.setViewportSize({width:390,height:844});await member.waitForTimeout(450);
    await member.screenshot({path:'test-results/'+kind+'-mobile.png',fullPage:true});assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,kind+' mobile overflow');
    await context.close();
  }
  const adminLinked=await adminApi('/employees',{name:'Browser Admin Teacher',email:'browser-admin@test.example',phone:'9999999999',department:'Science',designation:'Teacher',joiningDate:'2026-04-01',qualification:'B.Ed',salary:20000});
  await page.goto('http://127.0.0.1:3101/#/admin/employees');
  await page.getByRole('button',{name:'View Browser Admin Teacher profile and activity',exact:true}).click();
  await page.getByRole('button',{name:'Create separate employee login',exact:true}).click();
  await page.getByLabel('Separate employee email',{exact:true}).fill('separate-admin-teacher@test.example');
  const splitResponse=page.waitForResponse(r=>r.url().endsWith(`/api/employees/${adminLinked.record.id}/login`));
  await page.getByRole('button',{name:'Generate employee ID & password',exact:true}).click();
  const splitData=await (await splitResponse).json();assert.equal(splitData.credentials.employeeNo,adminLinked.record.employeeNo);assert.equal(splitData.credentials.portal,'teacher');
  await page.getByRole('heading',{name:'Employee login is ready',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Generated password',{exact:true}).inputValue(),splitData.credentials.password);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'View Browser Admin Teacher profile and activity',exact:true}).waitFor();
  await page.goto('http://127.0.0.1:3101/#/admin/employees');
  await page.getByRole('heading',{name:'Your team, a little closer.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add employee',exact:true}).waitFor();
  await page.getByLabel('Search employees',{exact:true}).fill('Browser Employee');
  assert.equal(await page.locator('.employee-card').count(),1);
  await page.getByLabel('Search employees',{exact:true}).fill('');
  await page.screenshot({path:'test-results/employee-directory.png',fullPage:true});
  const scopedResponse=page.waitForResponse(r=>r.url().includes('/api/activity?')&&new URL(r.url()).searchParams.get('actor')===staff.record.userId);
  await page.getByRole('button',{name:'View Browser Employee profile and activity',exact:true}).click();
  const scopedData=await (await scopedResponse).json();
  assert.ok(scopedData.rows.length>0,'Employee has recorded portal activity');
  assert.ok(scopedData.rows.every(r=>r.data.actorId===staff.record.userId),'Employee activity is scoped to their own account');
  await page.getByRole('heading',{name:'Browser Employee’s activity log',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Activity person',{exact:true}).count(),0,'Employee filter cannot switch to another person');
  assert.equal(await page.getByRole('tab',{name:'Staff overview',exact:true}).count(),0);
  await page.locator('.employee-activity .activity-table tbody tr').first().waitFor();
  await page.screenshot({path:'test-results/employee-activity-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Generate login credentials',exact:true}).click();
  const regenerated=page.waitForResponse(r=>r.url().endsWith(`/api/employees/${staff.record.id}/credentials`));
  await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
  const regeneratedData=await (await regenerated).json();assert.notEqual(regeneratedData.credentials.password,staff.credentials.password);
  await page.getByRole('heading',{name:'Employee login is ready',exact:true}).waitFor();
  const freshLogin=await fetch('http://127.0.0.1:3101/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-school-request':'1'},body:JSON.stringify({identifier:staff.record.employeeNo,password:regeneratedData.credentials.password,portal:'employee'})});assert.equal(freshLogin.status,200);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();

  const changeResponse=page.waitForResponse(r=>r.url().includes('/api/activity?')&&new URL(r.url()).searchParams.get('category')==='Changes');
  await page.getByLabel('Activity type',{exact:true}).selectOption('Changes');
  const changeData=await (await changeResponse).json();assert.ok(changeData.rows.every(r=>r.data.actorId===staff.record.userId&&r.data.category==='Changes'));
  await page.locator('.employee-activity .activity-table').getByRole('button',{name:'Details',exact:true}).first().click();
  await page.getByRole('heading',{name:'Activity details',exact:true}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  await page.screenshot({path:'test-results/employee-activity-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Employee activity mobile overflow');
  await page.getByRole('button',{name:'Back to employees',exact:true}).click();
  await page.screenshot({path:'test-results/employee-directory-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Employee directory mobile overflow');
  await page.getByRole('button',{name:'View Browser Candidate profile and activity',exact:true}).click();
  await page.getByRole('heading',{name:'Browser Candidate’s activity log',exact:true}).waitFor();
  await page.getByRole('heading',{name:'No activity matches these filters.',exact:true}).waitFor();
  assert.equal(await page.locator('.employee-activity .activity-table tbody tr').count(),0,'Another employee does not inherit previous activity');
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('http://127.0.0.1:3101/#/admin/audit');
  await page.getByRole('heading',{name:'A clear view of every school day.',exact:true}).waitFor();
  await page.locator('.activity-table tbody tr').first().waitFor();
  await page.getByLabel('Auto-refresh',{exact:true}).uncheck();
  await page.getByLabel('Activity person',{exact:true}).selectOption(staff.record.userId);
  await page.waitForTimeout(500);
  await page.getByRole('button',{name:'Refresh activity',exact:true}).click();
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/activity-desktop.png',fullPage:true});
  assert.ok(await page.locator('.activity-table tbody').innerText().then(t=>t.includes('Browser Employee')));
  await page.locator('.activity-table').getByRole('button',{name:'Details',exact:true}).first().click();
  await page.getByRole('heading',{name:'Activity details',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  const activityLogDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export visible rows',exact:true}).click();assert.match((await activityLogDownload).suggestedFilename(),/school-activity-page-/);
  await page.getByRole('tab',{name:'Staff overview',exact:true}).click();
  await page.locator('.activity-staff-note').waitFor();await page.screenshot({path:'test-results/activity-staff.png',fullPage:true});
  await page.getByRole('tab',{name:'Record audit',exact:true}).click();await page.waitForTimeout(500);assert.equal(await page.locator('.activity-main .form-error').count(),0);
  await page.getByRole('tab',{name:'Activity stream',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'test-results/activity-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Activity dashboard mobile overflow');
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('http://127.0.0.1:3101/#/admin/users');
  const teacherRow=page.getByRole('row').filter({hasText:'browser-teacher@test.example'});
  // The users table is paginated; search narrows the intended account first.
  await page.getByRole('textbox',{name:'Search records',exact:true}).fill('browser-teacher@test.example');
  await teacherRow.getByRole('button',{name:'Set password',exact:true}).click();
  await page.getByLabel('New password (8+ characters)',{exact:true}).fill('teacher-qa-123');
  await page.getByRole('dialog').getByRole('button',{name:'Save record',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const credentialCheck=await fetch('http://127.0.0.1:3101/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-school-request':'1'},body:JSON.stringify({email:'browser-teacher@test.example',password:'teacher-qa-123',portal:'teacher'})});assert.equal(credentialCheck.status,200);
  await page.goto('http://127.0.0.1:3101/#/admin/overview');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.goto("http://127.0.0.1:3101/");
  await page.getByRole("heading", { name: /A brighter future/ }).waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(async()=>{const images=Array.from(document.images);images.forEach(img=>img.loading="eager");await Promise.all(images.map(img=>img.decode()));});
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Learning", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Learning, beyond the textbook." })
    .waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser QA passed: linked notification bell/inbox, read/unread sync, notice deep links and mobile notifications; activity filters/details/export/staff/mobile, admin teacher password reset, all role back links on desktop/mobile and keyboard, activity download, resource carousel, mini quiz, public enquiry, admin setup, student creation, admin sections, Excel import/export, seven role logins, role-profile assignment, principal review, HR onboarding, school settings, protected redirects, homework submission, staff check-in/out, mobile navigation, no horizontal overflow or runtime errors.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  try {
    unlinkSync(file);
  } catch {}
  if (postgres) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}
