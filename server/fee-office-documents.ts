import {feeHeadBalances,schoolDate} from '../shared/fee-finance.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { balance, paid, day, effectiveDue, adjustedInstallments, invoiceStatus, profileId, sum, reject } from './fee-office-core.js';
const cash=(v:number)=>`INR ${(v/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const plain=(v:any)=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replaceAll('₹','INR ').replaceAll('·',' / ');
function start(res:any,school:any,title:string,compact=false){
 const doc=new PDFDocument({size:compact?[420,900]:'A4',margin:compact?28:42,bufferPages:true});res.type('pdf').set('Content-Disposition',`inline; filename="${title.toLowerCase().replaceAll(' ','-')}.pdf"`);doc.pipe(res);const whitePage=()=>{doc.save().rect(0,0,doc.page.width,doc.page.height).fill('#ffffff').restore();};whitePage();doc.on('pageAdded',whitePage);
 const width=doc.page.width,margin=doc.page.margins.left,right=width-margin;
 doc.rect(0,0,width,104).fill('#132343');doc.rect(0,104,width,4).fill('#c7a45b');
 const logo=path.resolve('public/images/school-logo.jpeg');if(existsSync(logo))doc.image(logo,margin,24,{fit:[48,48]});
 doc.fillColor('white').font('Helvetica-Bold').fontSize(compact?14:18).text(plain(school.name),margin+60,26,{width:width-margin*2-60});doc.font('Helvetica').fontSize(8).text(plain([school.address,school.phone,school.email].filter(Boolean).join(' | ')),margin+60,60,{width:width-margin*2-60,height:35});
 doc.y=127;doc.x=margin;doc.fillColor('#132343').font('Helvetica-Bold').fontSize(19).text(title);doc.moveDown(.7);
 const room=(height=45)=>{if(doc.y+height>doc.page.height-doc.page.margins.bottom-25){doc.addPage();doc.fillColor('#132343').font('Helvetica-Bold').fontSize(11).text(`${plain(school.name)} / ${title}`);doc.moveDown();}};
 const line=(label:string,value:any)=>{const text=`${label}: ${plain(value)}`;doc.font('Helvetica').fontSize(9);const h=doc.heightOfString(text,{width:right-margin});room(h+6);doc.fillColor('#37445d').text(text,margin,doc.y,{width:right-margin});doc.moveDown(.4);};
 const section=(title:string)=>{room(50);doc.moveDown(.7);doc.fillColor('#132343').font('Helvetica-Bold').fontSize(11).text(title,margin);doc.moveDown(.5);};
 const row=(label:string,value:any,bold=false)=>{doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(9);const w=right-margin,lh=doc.heightOfString(plain(label),{width:w*.68}),rh=doc.heightOfString(plain(value),{width:w*.28}),h=Math.max(lh,rh)+10;room(h);const y=doc.y;doc.fillColor(bold?'#132343':'#39465b').text(plain(label),margin+6,y+4,{width:w*.68});doc.text(plain(value),margin+w*.72,y+4,{width:w*.28-6,align:'right'});doc.moveTo(margin,y+h).lineTo(right,y+h).strokeColor('#e1e6ee').stroke();doc.y=y+h+3;doc.x=margin;};
 const finish=()=>{const range=doc.bufferedPageRange();for(let n=range.start;n<range.start+range.count;n++){doc.switchToPage(n);doc.font('Helvetica').fontSize(7).fillColor('#667084').text(`School financial record | Page ${n+1} of ${range.count}`,margin,doc.page.height-25,{lineBreak:false});}doc.end();};return {doc,line,section,row,room,finish};
}
export function feeDocument(res:any,kind:string,data:any,school:any,compact=false){
 const p=start(res,school,kind==='receipt'?'Payment Receipt':kind==='invoice'?'Fee Invoice':kind==='notice'?'Fee Due Notice':'Student Fee Statement',compact),{line,section,row}=p;
 const student=kind==='receipt'?data.details.student:data.snapshot||data.student;
 line('Student',student.name);line('Admission / Class / Section',[student.admissionNo||'Pending',student.className,student.section||'-'].join(' / '));line('Guardian',student.parentName||'-');line('Academic session',data.session);
 if(kind==='invoice'){
  line('Invoice',data.number);line('Billing month',data.billingPeriod||data.dueDate.slice(0,7));line('Invoice date',schoolDate(data.createdAt));line('Due date',data.dueDate);line('Status',invoiceStatus(data));section('Fee details');
  (Array.isArray(data.items)?data.items:[{description:data.title,amount:data.originalAmount??data.amount}]).forEach((r:any,n:number)=>row(`${n+1}. ${r.description}`,cash(r.amount)));
  data.adjustments.forEach((a:any)=>row(`${a.kind}: ${a.reason}`,cash(a.amount)));
  row('Net fee demand',cash(data.amount),true);row('Amount paid',cash(paid(data)));row('Outstanding balance',cash(balance(data)),true);
  if(data.installments.length){section('Installment schedule');let remaining=paid(data);for(const r of adjustedInstallments(data)){const settled=Math.min(remaining,r.amount);remaining-=settled;row(`${r.number}. Due ${r.dueDate}`,`${cash(r.amount)} / Due ${cash(r.amount-settled)}`);}}
 }else if(kind==='receipt'){
  line('Receipt number',data.receipt);line('Receipt date',schoolDate(data.verifiedAt||data.createdAt));line('Payment method',data.method);line('Transaction reference',data.reference||'Cash collection');line('Collected by',data.details.collectorName||data.actorId);if(data.details.chequeNumber)line('Cheque',`${data.details.chequeNumber} / ${data.details.bank} / ${data.details.chequeDate}`);
  section('Fee details at collection');for(const invoice of data.details.invoiceSummary||[]){for(const item of invoice.items||[])row(`${invoice.number} / ${item.description}`,cash(item.amount));}row('Current fee',cash(sum(data.details.invoiceSummary||[],'originalAmount')));row('Discount',cash(sum(data.details.invoiceSummary||[],'discount')));row('Late fee',cash(sum(data.details.invoiceSummary||[],'lateFee')));section('Payment allocation at collection');(data.details.allocations||[]).filter((a:any)=>a.amount>0).forEach((a:any,n:number)=>row(`${n+1}. ${a.number}`,cash(a.amount)));
  row('Previous outstanding (selected invoices)',cash(data.details.previousOutstanding||0));row('Amount received',cash(data.amount),true);row('Allocated at collection',cash(sum(data.details.allocations||[],'amount')));row('Remaining balance at collection',cash(Math.max(0,(data.details.previousOutstanding||0)-sum(data.details.allocations||[],'amount'))));row('Advance at collection',cash(data.details.advance||0),true);
  section('School acknowledgement');line('Verification',data.details.verifierName||data.details.collectorName||'Verified by school accounts');line('Note','This receipt confirms one verified payment. Reprinting does not record another payment.');p.room(75);p.doc.moveDown(2);row('Authorized signature','School stamp area');p.doc.moveDown();line('Thank you','Thank you for supporting your child’s education.');
 }else{
  section(kind==='notice'?'Outstanding invoices':'Student ledger');
  if(kind==='notice'){for(const i of data.invoices.filter((i:any)=>balance(i)>0&&i.issueStatus!=='Draft'))row(`${i.number} / Due ${i.dueDate}`,cash(balance(i)));row('Total outstanding',cash(data.outstanding),true);line('Please contact','School accounts for payment or reconciliation.');}
  else {row('Opening balance',cash(data.opening));for(const e of data.entries)row(`${schoolDate(e.date)} / ${e.type}\n${e.reference}\n${e.description}`,`${e.debit?'+':'-'}${cash(e.debit||e.credit)}\nBalance ${cash(e.balance)}`);row('Closing balance',cash(data.closing),true);row('Outstanding invoices',cash(data.outstanding));row('Unallocated advance',cash(data.advance));}
 }
 p.finish();
}
export function filteredFinance(data:any,q:any){
 let students=data.students.filter((s:any)=>(!q.className||s.className===q.className)&&(!q.section||s.section===q.section)&&(!q.studentId||s.id===q.studentId));const ids=new Set(students.map((s:any)=>s.id));
 let invoices=data.invoices.filter((i:any)=>ids.has(profileId(i))&&i.issueStatus!=='Draft'&&(!q.route||(i.snapshot as any)?.route===q.route||feeHeadBalances(i).some((r:any)=>r.route===q.route))&&(!q.month||(i.billingPeriod||i.dueDate.slice(0,7))===q.month)&&(!q.status||i.status===q.status));
 const payments=invoices.flatMap((i:any)=>i.payments.map((p:any)=>({...p,invoice:i,student:data.students.find((s:any)=>s.id===profileId(i))}))).filter((p:any)=>(!q.from||schoolDate(p.createdAt)>=q.from)&&(!q.to||schoolDate(p.createdAt)<=q.to));
 return {students,invoices,payments};
}
export function reportRows(name:string,data:any,q:any){
 const {students,invoices,payments}=filteredFinance(data,q),cashNumber=(v:number)=>v/100,totals=(rows:any[])=>({Demand:cashNumber(sum(rows,'amount')),Collected:cashNumber(rows.reduce((n,i)=>n+paid(i),0)),Outstanding:cashNumber(rows.reduce((n,i)=>n+balance(i),0))});
 const person=(id:string)=>data.students.find((s:any)=>s.id===id)||{};
 const receipts=[...data.collections.filter((c:any)=>c.status==='Verified'&&students.some((s:any)=>s.id===profileId(c))&&(!q.from||schoolDate(c.verifiedAt||c.createdAt)>=q.from)&&(!q.to||schoolDate(c.verifiedAt||c.createdAt)<=q.to)).map((c:any)=>({Date:schoolDate(c.verifiedAt||c.createdAt),Receipt:c.receipt,Student:person(profileId(c)).name,Class:person(profileId(c)).className,Method:c.method,Amount:cashNumber(q.month||q.status||q.route?c.allocations.filter((a:any)=>invoices.some((i:any)=>i.id===a.invoiceId)).reduce((n:number,a:any)=>n+a.amount-sum(a.refunds||[],'amount'),0):c.amount-c.allocations.reduce((n:number,a:any)=>n+sum(a.refunds||[],'amount'),0)),Collector:data.actors.find((a:any)=>a.id===c.actorId)?.name||c.actorId})),...payments.filter((p:any)=>!p.collectionId).map((p:any)=>({Date:schoolDate(p.createdAt),Receipt:p.receipt,Student:p.student?.name,Class:p.student?.className,Method:p.method,Amount:cashNumber(p.amount-sum(p.refunds,'amount')),Collector:data.actors.find((a:any)=>a.id===p.recordedBy)?.name||p.recordedBy}))].filter(r=>r.Amount>0);

 if(name==='daily'||name==='payments')return receipts;
 if(name==='student')return students.map((s:any)=>({Name:s.name,Admission:s.admissionNo,Class:s.className,Section:s.section,...totals(invoices.filter((i:any)=>profileId(i)===s.id)),Discount:cashNumber(invoices.filter((i:any)=>profileId(i)===s.id).flatMap((i:any)=>i.adjustments).filter((a:any)=>a.kind==='Discount').reduce((n:number,a:any)=>n-a.amount,0))}));
 if(name==='class')return [...new Set(students.map((s:any)=>s.className))].map(c=>({Class:c,Students:students.filter((s:any)=>s.className===c).length,...totals(invoices.filter((i:any)=>person(profileId(i)).className===c))}));
 if(name==='monthly')return [...new Set(invoices.map((i:any)=>i.billingPeriod||i.dueDate.slice(0,7)))].sort().map(m=>{const rows=invoices.filter((i:any)=>(i.billingPeriod||i.dueDate.slice(0,7))===m),t=totals(rows);return {Month:m,...t,Discount:cashNumber(rows.flatMap((i:any)=>i.adjustments).filter((a:any)=>a.kind==='Discount').reduce((n:number,a:any)=>n-a.amount,0)),'Collection %':t.Demand?Math.round(t.Collected/t.Demand*10000)/100:0};});
 if(name==='mode')return [...new Set(receipts.map(r=>r.Method))].map(m=>({Method:m,Amount:receipts.filter(r=>r.Method===m).reduce((n,r)=>n+Math.round(r.Amount*100),0)/100}));
 if(name==='discount')return invoices.flatMap((i:any)=>i.adjustments.filter((a:any)=>['Discount','Late fee waiver'].includes(a.kind)).map((a:any)=>({Student:person(profileId(i)).name,Invoice:i.number,Type:a.kind,Amount:cashNumber(-a.amount),Reason:a.reason,Approver:data.actors.find((r:any)=>r.id===a.actorId)?.name||a.actorId,Date:schoolDate(a.createdAt)})));
 if(name==='defaulter')return invoices.filter((i:any)=>balance(i)>0).map((i:any)=>{const days=Math.max(0,Math.floor((Date.parse(day())-Date.parse(effectiveDue(i)))/86400000));return {Student:person(profileId(i)).name,Guardian:person(profileId(i)).parentName,Class:person(profileId(i)).className,Section:person(profileId(i)).section,Invoice:i.number,DueDate:effectiveDue(i),Outstanding:cashNumber(balance(i)),OverdueDays:days,Bucket:days>60?'More than 60 days':days>30?'31–60 days':days>7?'8–30 days':days?'1–7 days':Date.parse(effectiveDue(i))-Date.parse(day())<=3*86400000?'Due soon':'Not due'};});
 if(name==='transport'){
  const routes=new Map<string,any>();for(const i of invoices){for(const item of feeHeadBalances(i).filter((r:any)=>r.category==='Transport Fee')){const r=routes.get(item.route)||{Route:item.route,students:new Set(),Demand:0,Collected:0,Outstanding:0};r.students.add(profileId(i));r.Demand+=item.demand;r.Collected+=item.collected;r.Outstanding+=item.outstanding;routes.set(item.route,r);}}
  return [...routes.values()].map(r=>({Route:r.Route,Students:r.students.size,Demand:cashNumber(r.Demand),Collected:cashNumber(r.Collected),Outstanding:cashNumber(r.Outstanding)}));
 }
 reject(404,'Unknown financial report.');
}
export async function exportFeeReport(res:any,name:string,format:string,data:any,q:any){
 const rows=reportRows(name,data,q);if(format==='json')return res.json({rows});const columns=Object.keys(rows[0]||{Result:''});
 if(format==='csv'){const safe=(v:any)=>{let value=String(v??'');if(/^[=+@\-\t\r]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};res.type('text/csv').set('Content-Disposition',`attachment; filename="fees-${name}.csv"`).send('\uFEFF'+[columns.map(safe).join(','),...rows.map((r:any)=>columns.map(c=>safe((r as any)[c])).join(','))].join('\r\n'));return;}
 if(format==='xlsx'){const book=new ExcelJS.Workbook();book.creator=data.school.name;const sheet=book.addWorksheet('Fee report');sheet.columns=columns.map(key=>({header:key,key,width:22}));for(const row of rows)sheet.addRow(row);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF132343'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:1,column:columns.length}};sheet.eachRow((row,n)=>{if(n>1)row.eachCell(cell=>{if(typeof cell.value==='number')cell.numFmt='#,##0.00';});});res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition',`attachment; filename="fees-${name}.xlsx"`);await book.xlsx.write(res);res.end();return;}
 if(format==='pdf'){const p=start(res,data.school,`${name[0].toUpperCase()+name.slice(1)} Fee Report`);p.line('Academic session',data.session);p.line('Generated',day());for(const r of rows){p.section(String(Object.values(r)[0]||'Record'));for(const c of columns.slice(1))p.line(c,(r as any)[c]);}if(!rows.length)p.line('Result','No records match these filters.');p.finish();return;}
 reject(400,'Choose CSV, Excel or PDF.');
}
