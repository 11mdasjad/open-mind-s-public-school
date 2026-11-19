import {useEffect, useState, type ReactNode} from 'react';
import {ArrowLeft, Download, Pencil, Upload, UserRound} from 'lucide-react';
import {api, rupees, today} from './api';
import './student-profile.css';
import {FeeAssignmentForm} from './FeeSchedule';

type Row = Record<string, any>;
const dateLabel = (value: string) => value ? new Date(value.slice(0,10) + 'T12:00:00').toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}) : 'Not provided';
const monthLabel = (value: string) => new Date(value + '-01T12:00:00').toLocaleDateString('en-IN', {month:'long', year:'numeric'});
const netPaid = (invoice: Row) => invoice.payments.reduce((sum: number, payment: Row) => sum + payment.amount - (payment.refunds || []).reduce((n: number, refund: Row) => n + refund.amount, 0), 0);

export function StudentProfile({id, revision, onBack, onEdit, renderDetails, initialTab='Overview', feesOnly=false, academicSession=''}: {initialTab?: string; feesOnly?: boolean; academicSession?: string; id: string; revision: number; onBack: () => void; onEdit: (student: Row) => void; renderDetails: (student: Row) => ReactNode}) {
  const [data, setData] = useState<Row | null>(null), [tab, setTab] = useState(initialTab), [month, setMonth] = useState(today().slice(0,7));
  const [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [feeMonth,setFeeMonth]=useState(''),[feeYear,setFeeYear]=useState(today().slice(0,4)),[addingFee,setAddingFee]=useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Row | null>(null), [requestId, setRequestId] = useState('');
  useEffect(() => {
    let live = true; setLoading(true); setError('');
    api(`/students/${encodeURIComponent(id)}/profile?month=${month}`).then(result => {if(live) setData(result);}).catch(e => {if(live) setError(e.message);}).finally(() => {if(live) setLoading(false);});
    return () => {live = false;};
  }, [id, month, version, revision]);
  async function upload(file: File | undefined, kind: string) {
    if (!file) return;
    setError(''); setNotice('');
    if (file.size > 5 * 1024 * 1024) {setError('Choose a file up to 5 MB.'); return;}
    setBusy(true);
    try {const form = new FormData(); form.append('kind', kind); form.append('file', file); await api(`/students/${id}/profile/files`, 'POST', form); setNotice(`${kind} uploaded.`); setVersion(v=>v+1);}
    catch(e: any) {setError(e.message);} finally {setBusy(false);}
  }
  const fileUrl = (fileId: string) => `/api/students/${encodeURIComponent(id)}/profile/files/${encodeURIComponent(fileId)}`;
  if (!data) return <section className="student-profile-page"><button className="small-button" onClick={onBack}><ArrowLeft size={16}/> {feesOnly?'Back to fee register':'Back to students'}</button>{error ? <div role="alert">{error}<button className="small-button" onClick={()=>setVersion(v=>v+1)}>Retry</button></div> : <p role="status">Loading student profile…</p>}</section>;
  const {student, access, invoices, pending, documents, attendance} = data;
  const total = invoices.reduce((sum: number, invoice: Row) => sum + invoice.amount, 0), paid = invoices.reduce((sum: number, invoice: Row) => sum + netPaid(invoice), 0);
  const tabs = feesOnly ? ['Fees'] : ['Overview', 'Fees', 'Attendance', 'Documents'];
  const visibleInvoices=invoices.filter((invoice:Row)=>invoice.dueDate.startsWith(feeMonth));
  const daily = attendance.filter((row: Row) => row.period === 'Daily');
  const days = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
  const offset = (new Date(month + '-01T12:00:00').getDay() + 6) % 7;
  return <section className="student-profile-page" aria-label="Student profile">
    <button className="small-button" onClick={onBack}><ArrowLeft size={16}/> {feesOnly?'Back to fee register':'Back to students'}</button>
    <header className="sp-header">
      <div className="sp-photo-block">
        {data.photo ? <img className="sp-photo" src={fileUrl(data.photo.id)} alt={`${student.name}'s photo`}/> : <div className="sp-photo sp-photo-empty"><UserRound size={38}/><span>No photo</span></div>}
        {access.edit && !feesOnly && <label className="small-button sp-upload"><Upload size={14}/>{data.photo ? 'Change photo' : 'Add photo'}<input type="file" aria-label="Student photo" accept="image/png,image/jpeg" disabled={busy} onChange={e=>{void upload(e.target.files?.[0], 'Photo');e.target.value='';}}/></label>}
      </div>
      <div className="sp-identity"><span className="sp-eyebrow">{feesOnly?'STUDENT FEES':'STUDENT PROFILE'}</span><h2>{student.name || 'Name not provided'}</h2><p>{[student.className, student.section && `Section ${student.section}`, student.session].filter(Boolean).join(' · ')}</p><div className="sp-identifiers"><span>Admission: <strong>{student.admissionNo || 'Not assigned'}</strong></span><span>Roll: <strong>{student.details?.rollNumber || 'Not assigned'}</strong></span></div>{student.isDraft && <p className="sp-draft">Incomplete registration</p>}</div>
      {access.edit && !feesOnly && <button className="button light" onClick={()=>onEdit(student)}><Pencil size={15}/> Edit details</button>}
    </header>
    {notice && <p className="sp-notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error} <button className="small-button" onClick={()=>setVersion(v=>v+1)}>Retry loading</button></p>}
    <div className="sp-tabs" role="tablist" aria-label="Student profile sections">{tabs.map((name, index)=><button key={name} id={`sp-tab-${name}`} role="tab" aria-selected={tab===name} aria-controls={`sp-panel-${name}`} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next]);document.getElementById(`sp-tab-${tabs[next]}`)?.focus();}}}>{name}</button>)}</div>
    <div role="tabpanel" id={`sp-panel-${tab}`} aria-labelledby={`sp-tab-${tab}`} className="sp-panel" aria-busy={loading}>
      {tab==='Overview' && renderDetails(student)}
      {tab==='Fees' && (!access.fees ? <p>Fee records are not available for your role.</p> : <>
        <div className="sp-section-title"><div><h3>Monthly fees</h3><p>Invoices are listed by due month. Pending means a partial payment or a collection awaiting verification.</p></div><div className="sp-legend"><span className="sp-badge paid">Paid</span><span className="sp-badge unpaid">Unpaid</span><span className="sp-badge pending">Pending</span></div></div>
        <div className="sp-totals"><div><span>Total fees (all months)</span><strong>{rupees(total)}</strong></div><div><span>Verified payments, less refunds</span><strong>{rupees(paid)}</strong></div><div><span>Balance</span><strong>{rupees(total-paid)}</strong></div></div>
        {!feeMonth && <><label className="sp-month fee-year">Year<input aria-label="Fee year" type="number" min="2000" max="2100" value={feeYear} onChange={e=>setFeeYear(e.target.value)}/></label>{/^\d{4}$/.test(feeYear)&&Number(feeYear)>=2000&&Number(feeYear)<=2100&&<div className="fee-months">{Array.from({length:12},(_,index)=>{const value=`${feeYear}-${String(index+1).padStart(2,'0')}`,bills=invoices.filter((invoice:Row)=>invoice.dueDate.startsWith(value)),amount=bills.reduce((sum:number,row:Row)=>sum+row.amount,0),paid=bills.reduce((sum:number,row:Row)=>sum+netPaid(row),0),awaiting=pending.some((row:Row)=>bills.some((bill:Row)=>bill.id===row.data.invoiceId)),status=!bills.length?'Not assigned':paid>=amount?'Paid':paid>0||awaiting?'Pending':'Unpaid';return <button key={value} aria-label={`Fees for ${monthLabel(value)}: ${status}`} onClick={()=>{setFeeMonth(value);setAddingFee(false);setPaymentInvoice(null);}}><strong>{monthLabel(value)}</strong><span className={`sp-badge ${status.toLowerCase()}`}>{status}</span><small>{bills.length?`Balance ${rupees(amount-paid)}`:'Set up monthly fee'}</small></button>;})}</div>}<p className="sp-footnote">Choose a month to see its fees, payments and receipts. A month without an invoice is not an unpaid fee.</p></>}
        {feeMonth && <div className="sp-section-title"><button className="small-button" disabled={busy} onClick={()=>{setFeeMonth('');setAddingFee(false);setPaymentInvoice(null);}}>All months</button><h3>{student.name} · {monthLabel(feeMonth)}</h3>{access.payments&&<button className="small-button" disabled={busy} onClick={()=>setAddingFee(v=>!v)}>Assign fee</button>}</div>}
        {feeMonth && !visibleInvoices.length ? <p className="sp-empty">No fee assigned for {monthLabel(feeMonth)}. Set the fee amount before recording payment.</p> : feeMonth && <div className="sp-table-scroll"><table><caption className="sr-only">Student monthly fee status</caption><thead><tr>{['Month / invoice','Due date','Fee','Paid','Balance','Status','Payments / receipts'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{visibleInvoices.map((invoice: Row)=>{
          const collected=netPaid(invoice), balance=invoice.amount-collected, requests=pending.filter((row: Row)=>row.data.invoiceId===invoice.id);
          const status=balance<=0?'Paid':collected>0||requests.length?'Pending':'Unpaid';
          return <tr key={invoice.id}><td><strong>{monthLabel(invoice.dueDate.slice(0,7))}</strong><small>{invoice.title} · {invoice.number}</small></td><td>{dateLabel(invoice.dueDate)}</td><td>{rupees(invoice.amount)}</td><td>{rupees(collected)}</td><td>{rupees(balance)}</td><td><span className={`sp-badge ${status.toLowerCase()}`}>{status}</span>{requests.length>0&&<small>{requests.some((row: Row)=>row.status==="Draft") ? "Collection saved; not submitted" : "Awaiting verification"}</small>}</td><td><div className="sp-payment-actions">{balance>0 && access.payments && !requests.length && <button className="small-button" disabled={busy||loading} onClick={()=>{setPaymentInvoice({...invoice,balance});setRequestId('');setError('');}}>Add payment</button>}{requests.filter((row: Row)=>row.canSubmit).map((row: Row)=><button key={row.id} className="small-button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api("/workflow/submit","POST",{type:"paymentVerifications",entityId:row.id});setNotice("Payment submitted for verification.");setVersion(v=>v+1);}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Submit for verification</button>)}{invoice.payments.map((payment: Row)=><a key={payment.id} className="small-button" href={`/api/reports/receipt/${payment.id}`}><Download size={14}/>{payment.receipt}</a>)}</div></td></tr>;
        })}</tbody></table></div>}
        {feeMonth && addingFee && <FeeAssignmentForm key={`${id}-${feeMonth}`} student={student} month={feeMonth} academicSession={academicSession} busy={busy} onBusy={setBusy} onError={setError} onSaved={()=>{setAddingFee(false);setNotice('Fee assigned. You can now add a payment.');setVersion(v=>v+1);}}/>}
        {paymentInvoice && <form className="sp-payment-form" onSubmit={async event=>{
          event.preventDefault();setBusy(true);setError('');const values=Object.fromEntries(new FormData(event.currentTarget));
          try {let collectionId=requestId;if(!collectionId){const request=await api(`/fees/${paymentInvoice.id}/payment-requests`,'POST',{...values,amount:Number(values.amount)});collectionId=request.id;setRequestId(collectionId);}await api('/workflow/submit','POST',{type:'paymentVerifications',entityId:collectionId});setPaymentInvoice(null);setRequestId('');setNotice('Payment submitted for verification. The receipt will be available once approved.');setVersion(v=>v+1);}
          catch(e:any){setError(e.message);}finally{setBusy(false);}
        }}><h3>Add payment · {paymentInvoice.title}</h3><p>Balance: {rupees(paymentInvoice.balance)}. A second authorized staff member verifies the collection before a receipt is issued.</p><div className="sp-form-fields"><label>Amount received (₹)<input name="amount" type="number" min="0.01" max={paymentInvoice.balance/100} step="0.01" defaultValue={paymentInvoice.balance/100} required disabled={busy||!!requestId}/></label><label>Payment method<select name="method" disabled={busy||!!requestId}><option>Cash</option><option>UPI</option><option>Bank transfer</option><option>Cheque</option></select></label><label>Transaction reference<input name="reference" maxLength={100} disabled={busy||!!requestId} placeholder="Required for non-cash payments"/></label></div><div className="sp-payment-actions"><button className="button dark" disabled={busy}>{busy?'Saving…':requestId?'Retry submission':'Submit payment'}</button><button type="button" className="button light" disabled={busy} onClick={()=>{setPaymentInvoice(null);setVersion(v=>v+1);}}>Close</button></div></form>}
      </>)}
      {tab==='Attendance' && (!access.attendance ? <p>Attendance is not available for your role.</p> : <>
        <div className="sp-section-title"><div><h3>Attendance</h3><p>Daily marks for {monthLabel(month)}. Unmarked dates are not counted as absences.</p></div><label className="sp-month">Month<input type="month" aria-label="Attendance month" value={month} onChange={e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))setMonth(e.target.value);}}/></label></div>
        {loading || data.month !== month ? <p role="status">{loading ? "Loading attendance…" : "Attendance could not be loaded for this month. Please retry."}</p> : <><div className="sp-attendance-summary">{['Present','Absent','Late','Half Day','Leave'].map(status=><div key={status}><strong>{daily.filter((row: Row)=>row.status===status).length}</strong><span>{status}</span></div>)}</div><div className="sp-legend"><span className="sp-badge paid">P · Present</span><span className="sp-badge unpaid">A · Absent</span><span>L · Late</span><span>H · Half day</span><span>LV · Leave</span><span>— · Unmarked</span></div>
        <div className="sp-calendar" aria-label={`Attendance calendar for ${monthLabel(month)}`}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><div className="sp-weekday" key={day}>{day}</div>)}{Array.from({length:offset},(_,i)=><div key={`blank-${i}`} aria-hidden="true"/>)}{Array.from({length:days},(_,i)=>{
          const day=`${month}-${String(i+1).padStart(2,'0')}`, record=daily.find((row: Row)=>row.date===day);
          const status=record?.status || (day>today()?'Upcoming':'Unmarked'), mark=({Present:'P',Absent:'A',Late:'L','Half Day':'H',Leave:'LV'} as Row)[status] || '—';
          return <div key={day} className={`sp-calendar-day ${status==='Present'?'present':status==='Absent'?'absent':''}`} aria-label={`${dateLabel(day)}: ${status}`}><span>{i+1}</span><strong>{mark}</strong><small>{status}</small></div>;
        })}</div>{attendance.some((row: Row)=>row.period!=="Daily") && <details className="sp-period-records"><summary>Subject / period marks</summary><ul>{attendance.filter((row: Row)=>row.period!=="Daily").map((row: Row)=><li key={row.id}>{dateLabel(row.date)} · {row.period}: <strong>{row.status}</strong></li>)}</ul></details>}<p className="sp-footnote">Summary counts daily records only. Subject or period marks are listed separately.</p></>}
      </>)}
      {tab==='Documents' && (!access.documents ? <p>Documents are not available for your role.</p> : <><div className="sp-section-title"><div><h3>Student documents</h3><p>PDF, PNG or JPEG. Up to 5 MB per file.</p></div>{access.edit && access.uploadDocuments && <label className="small-button sp-upload"><Upload size={15}/>Upload document<input aria-label="Upload student document" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e=>{void upload(e.target.files?.[0],'Document');e.target.value='';}}/></label>}</div>{documents.length ? <ul className="sp-documents">{documents.map((file:Row)=><li key={file.id}><div><strong>{file.name}</strong><small>{Math.max(1,Math.round(file.size/1024))} KB · {dateLabel(file.createdAt)}</small></div><a className="small-button" href={fileUrl(file.id)}><Download size={15}/>Download</a></li>)}</ul> : <p className="sp-empty">No documents uploaded for this student.</p>}</>)}
    </div>
  </section>;
}
