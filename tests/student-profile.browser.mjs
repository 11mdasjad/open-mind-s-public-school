import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

// UI fixture tests never read or write the school database.
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
mkdirSync('test-results', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1050}, reducedMotion: 'reduce'});
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const student = {id:'profile-1',name:'Aisha Sharma',admissionNo:'OM-2026-123',className:'Class 7',section:'A',session:'2026–2027',dob:'2014-07-14',gender:'Female',email:'aisha@example.test',parentName:'Ravi Sharma',parentEmail:'parent@example.test',phone:'9999999999',address:'School Road',details:{rollNumber:'42',fatherName:'Ravi Sharma',motherName:'Meera Sharma',admissionDate:'2026-04-01'}};
  const drafts = [{id:'draft-1',data:{name:'Incomplete Student',className:'Nursery',details:{rollNumber:'17'}}}];
  const invoices = [
    {id:'paid',title:'September tuition',number:'INV-1',amount:100000,dueDate:'2026-09-10',payments:[{id:'receipt-1',receipt:'RCPT-1',amount:100000,refunds:[]}]},
    {id:'unpaid',title:'October tuition',number:'INV-2',amount:100000,dueDate:'2026-10-10',payments:[]},
    {id:'partial',title:'November tuition',number:'INV-3',amount:100000,dueDate:'2026-11-10',payments:[{id:'receipt-2',receipt:'RCPT-2',amount:25000,refunds:[]}]},
  ];
  const pending = [], documents = [];
  let photo = null, paymentRequests = 0, submissions = 0;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    let data = [];
    if (p === '/api/auth/me') data = {user:{id:'admin',name:'Preview Admin',role:'Super Admin'}};
    else if (p === '/api/setup') data = {required:false};
    else if (p === '/api/public') data = {pages:{},settings:{}};
    else if (p === '/api/students') data = [student];
    else if (p === '/api/student-drafts') data = drafts;
    else if (p === '/api/school-settings' || p === '/api/integrations') data = {};
    else if (p.includes('notifications')) data = {rows:[],recent:[],unread:0,total:0};
    else if (p.endsWith('/profile')) {
      const month = url.searchParams.get('month'), draft = p.includes('draft-1');
      data = {student:draft?{...drafts[0].data,id:'draft-1',isDraft:true}:student,month,access:{fees:true,attendance:true,documents:true,uploadDocuments:true,edit:true,payments:true},invoices:draft?[]:invoices,pending,documents,photo,
        attendance:month==='2026-11'?[{id:'a1',date:'2026-11-02',period:'Daily',status:'Present'},{id:'a2',date:'2026-11-03',period:'Daily',status:'Absent'},{id:'a3',date:'2026-11-03',period:'Math',status:'Present'}]:[]};
    } else if (p === '/api/fees/unpaid/payment-requests') {
      const body=route.request().postDataJSON(); assert.equal(body.amount,1000);assert.equal(body.method,'Cash');
      paymentRequests++;data={id:'request-1'};
    } else if (p === '/api/workflow/submit') {
      assert.equal(route.request().postDataJSON().entityId,'request-1');
      submissions++;
      if (submissions === 1) return route.fulfill({status:503,json:{error:'Temporary verification service failure'}});
      pending.push({id:'request-1',status:'Pending',data:{invoiceId:'unpaid',amount:100000}});data={id:'approval-1'};
    } else if (p.endsWith('/profile/files') && route.request().method()==='POST') {
      const body=route.request().postDataBuffer().toString();
      if(body.includes('Photo')) photo={id:'photo-1'};
      else documents.push({id:'doc-1',name:'certificate.pdf',size:1024,createdAt:'2026-11-13'});
      data={id:body.includes('Photo')?'photo-1':'doc-1'};
    } else if (p.endsWith('/photo-1')) return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
    return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:5173/#/admin/students');
  const search=page.getByRole('textbox',{name:'Search records'});
  for(const query of ['Aisha','42','OM-2026-123']) {
    await search.fill(query);await expect(page.locator('.data-panel tbody tr')).toHaveCount(1);
  }
  await page.getByRole('button',{name:'Open student OM-2026-123',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Aisha Sharma',exact:true})).toBeVisible();
  await expect(page.getByText('Meera Sharma',{exact:true})).toBeVisible();
  await page.getByLabel('Student photo',{exact:true}).setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('img',{name:"Aisha Sharma's photo"})).toBeVisible();
  await page.screenshot({path:'test-results/student-profile-overview.png',fullPage:true});
  await page.getByRole('tab',{name:'Fees',exact:true}).click();
  await page.getByRole('button',{name:'Fees for September 2026: Paid',exact:true}).click();
  await expect(page.locator('tr').filter({hasText:'INV-1'}).locator('.sp-badge')).toHaveText('Paid');
  await expect(page.getByRole('link',{name:'RCPT-1',exact:true})).toHaveAttribute('href','/api/reports/receipt/receipt-1');
  await page.getByRole('button',{name:'All months',exact:true}).click();
  await expect(page.getByRole('button',{name:'Fees for November 2026: Pending',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fees for October 2026: Unpaid',exact:true}).click();
  await page.locator('tr').filter({hasText:'INV-2'}).getByRole('button',{name:'Add payment'}).click();
  await page.getByRole('button',{name:'Submit payment',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Temporary verification service failure');
  await page.getByRole('button',{name:'Retry submission',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Payment submitted for verification');
  await expect(page.locator('tr').filter({hasText:'INV-2'}).locator('.sp-badge')).toHaveText('Pending');
  assert.equal(paymentRequests,1);
  await page.screenshot({path:'test-results/student-profile-fees.png',fullPage:true});
  await page.getByRole('tab',{name:'Attendance',exact:true}).click();
  await page.getByRole('textbox',{name:'Attendance month'}).count();
  await page.getByLabel('Attendance month').fill('2026-11');
  await expect(page.locator('.sp-calendar-day.present')).toHaveCount(1);
  await expect(page.locator('.sp-calendar-day.absent')).toHaveCount(1);
  await expect(page.locator('.sp-attendance-summary>div').filter({hasText:'Present'}).locator('strong')).toHaveText('1');
  await page.getByLabel('Attendance month').fill('2026-02');
  await expect(page.locator('.sp-calendar-day')).toHaveCount(28);
  await expect(page.locator('.sp-calendar-day.absent')).toHaveCount(0);
  await page.getByLabel('Attendance month').fill('2026-11');
  await expect(page.locator('.sp-calendar-day')).toHaveCount(30);
  await page.screenshot({path:'test-results/student-profile-attendance.png',fullPage:true});
  await page.getByRole('tab',{name:'Documents',exact:true}).click();
  await page.getByLabel('Upload student document').setInputFiles({name:'certificate.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTest')});
  await expect(page.getByText('certificate.pdf',{exact:true})).toBeVisible();
  await expect(page.locator('.sp-documents a')).toHaveAttribute('href','/api/students/profile-1/profile/files/doc-1');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('tab',{name:'Attendance',exact:true}).click();
  await expect(page.locator('.sp-calendar-day')).toHaveCount(30);
  await page.locator('.sp-calendar').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/student-profile-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Back to students',exact:true}).click();
  await search.fill('Incomplete Student');
  await page.getByRole('button',{name:'Open profile for Incomplete Student'}).click();
  await page.getByRole('tab',{name:'Fees',exact:true}).click();
  await expect(page.locator('.fee-months button')).toHaveCount(12);
  assert.deepEqual(errors,[]);
  console.log('Student profile browser checks passed: search, ID navigation, photos, fee statuses, payment submission, receipt links, attendance months, document upload, draft profiles and mobile layout.');
} finally { await browser.close(); }
