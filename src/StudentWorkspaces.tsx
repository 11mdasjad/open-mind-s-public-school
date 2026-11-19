import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {ArrowLeft, ArrowRight, Check, CalendarDays} from 'lucide-react';
import {api, today} from './api';
import {schoolClasses, classKey, classLabel} from '../shared/student-register';
import {canManageModule} from '../shared/portals';
import './student-workspaces.css';
import {SchoolFeeSchedule} from './FeeSchedule';
type Row=Record<string,any>;
const statuses=['Present','Absent','Late','Half Day','Leave'];
const dayLabel=(day:string)=>new Date(`${day}T12:00:00`).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
function useRoster(revision:number){
  const [roster,setRoster]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let live=true;setLoading(true);api('/students/register').then(rows=>{if(live){setRoster(rows);setError('');}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[revision]);
  return {roster,error,loading};
}
export function ClassCards({roster,onSelect,purpose}:{roster:Row[];onSelect:(name:string)=>void;purpose:string}){
  const groups=useMemo(()=>[...new Set([...schoolClasses,...roster.map(s=>classLabel(s.className||'Unassigned'))])].map(name=>({name,count:roster.filter(s=>classKey(s.className)===classKey(name)).length})),[roster]);
  return <div className="student-class-grid">{groups.map(group=><button key={group.name} className="student-class-card" onClick={()=>onSelect(group.name)} aria-label={`${group.name} ${purpose}, ${group.count} students`}><CalendarDays size={23}/><strong>{group.name}</strong><span>{group.count} students</span><ArrowRight size={17}/></button>)}</div>;
}
export function AttendanceWorkspace({user,staffAttendance}:{user:Row;staffAttendance:ReactNode}){
  const [revision,setRevision]=useState(0),{roster,error:rosterError,loading:rosterLoading}=useRoster(revision);
  const [selected,setSelected]=useState(''),[day,setDay]=useState(today()),[section,setSection]=useState(''),[search,setSearch]=useState(''),[staff,setStaff]=useState(false);
  const [records,setRecords]=useState<Row[]>([]),[edits,setEdits]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[saveError,setSaveError]=useState('');
  const month=day.slice(0,7), manage=canManageModule(user.role,'attendance',user.permissions)&&['Super Admin','School Admin','Principal','Vice Principal','Teacher','Class Teacher','HR Manager'].includes(user.role);
  useEffect(()=>{
    if(!selected)return;let live=true;setLoading(true);setRecords([]);setError('');
    api('/attendance/register?'+new URLSearchParams({className:selected,month})).then(result=>{if(live)setRecords(result.records);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
  },[selected,month,revision]);
  const classRoster=useMemo(()=>roster.filter(s=>classKey(s.className)===classKey(selected)).sort((a,b)=>String(a.details?.rollNumber||'').localeCompare(String(b.details?.rollNumber||''),undefined,{numeric:true})||a.name.localeCompare(b.name)),[roster,selected]);
  const people=useMemo(()=>classRoster.filter(s=>(!section||s.section===section)&&[s.name,s.admissionNo,s.details?.rollNumber].some(value=>String(value||'').toLowerCase().includes(search.toLowerCase()))),[classRoster,section,search]);
  const dayRecords=useMemo(()=>new Map(records.filter(r=>r.date===day).map(r=>[r.personKey,r])),[records,day]);
  const summary=useMemo(()=>{
    const counts:Record<string,number>={'Total students':classRoster.length,'Present':0,'Absent':0,'Leave':0,'Not marked':0,'Late':0,'Half Day':0};
    for(const student of classRoster)counts[edits[student.id]||dayRecords.get(student.id)?.status||'Not marked']++;
    return counts;
  },[classRoster,dayRecords,edits]);
  const savedCount=classRoster.filter(student=>dayRecords.has(student.id)).length;
  const dirty=Object.keys(edits).length>0;
  useEffect(()=>{if(dirty)setMessage('');},[dirty]);
  const changeView=(change:()=>void)=>{if(busy)return;if(dirty&&!window.confirm('Discard unsaved attendance changes?'))return;setEdits({});setMessage('');setSaveError('');change();};
  const monthDays=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  const offset=(new Date(`${month}-01T12:00:00`).getDay()+6)%7;
  const byDate=useMemo(()=>{const map=new Map<string,Row[]>();for(const row of records)map.set(row.date,[...(map.get(row.date)||[]),row]);return map;},[records]);
  if(staff)return <><button className="small-button" onClick={()=>setStaff(false)}><ArrowLeft size={15}/> Student attendance</button>{staffAttendance}</>;
  return <section className="data-panel register-workspace">
    <div className="rw-heading"><div><h2>{selected?`${selected} attendance`:'Class attendance'}</h2><p>Choose a class and date. Tap P (present), A (absent) or Leave, then save attendance.</p></div>{!['Student','Parent'].includes(user.role)&&<button className="small-button" onClick={()=>changeView(()=>setStaff(true))}>Staff / my attendance</button>}</div>
    {(rosterError||error)&&<p role="alert" className="error rw-pad">{rosterError||error} <button className="small-button" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}
    {rosterLoading?<p className="rw-pad" role="status">Loading class register…</p>:!selected?<ClassCards roster={roster} onSelect={name=>{setSelected(name);setSection('');setSearch('');}} purpose="attendance"/>:<>
      <div className="rw-controls"><button className="small-button" disabled={busy} onClick={()=>changeView(()=>setSelected(''))}><ArrowLeft size={14}/>All classes</button><label>Date<input type="date" aria-label="Class attendance date" max={today()} value={day} disabled={busy} onChange={e=>{const value=e.target.value;if(value&&value<=today())changeView(()=>setDay(value));}}/></label><button className="small-button" disabled={busy} onClick={()=>changeView(()=>setDay(today()))}>Today</button><label>Section<select aria-label="Attendance section" value={section} onChange={e=>setSection(e.target.value)}><option value="">All sections</option>{[...new Set(classRoster.map(s=>s.section).filter(Boolean))].map(name=><option key={name}>{name}</option>)}</select></label><label>Find student<input aria-label="Find attendance student" placeholder="Name, roll or admission no." value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="rw-day-heading"><h3>{dayLabel(day)}</h3><span>{classRoster.length} students · {dayRecords.size} saved {dirty&&`· ${Object.keys(edits).length} unsaved changes`}</span></div>
      {message&&<p className="sp-notice rw-pad" role="status">{message}</p>}
      {loading?<p className="rw-pad" role="status">Loading attendance…</p>:!error&&<>
      <div className="rw-counts">{[...statuses,'Not marked'].map(status=><div key={status}><strong>{summary[status]}</strong><span>{status}</span></div>)}</div>
      <div className="table-scroll"><table><thead><tr><th>Roll / admission</th><th>Student</th><th>Section</th><th>Attendance</th><th>Saved</th></tr></thead><tbody>{people.map(student=>{
        const saved=dayRecords.get(student.id), value=edits[student.id]||saved?.status||'';
        return <tr key={student.id}><td>{student.details?.rollNumber||'—'}<small className="subtext">{student.admissionNo||'Admission pending'}</small></td><td><strong>{student.name}</strong></td><td>{student.section||'—'}</td><td>{manage?<fieldset className="rw-mark-options" disabled={busy}>
          <legend className="rw-visually-hidden">Attendance for {student.name}</legend>
          {[{value:'Present',short:'P',caption:'Present',tone:'present'},{value:'Absent',short:'A',caption:'Absent',tone:'absent'},{value:'Leave',short:'Leave',caption:'On leave',tone:'leave'}].map(option=><label key={option.value} className={`rw-mark-choice ${option.tone}`}>
            <input type="radio" name={`attendance-${student.id}`} aria-label={option.value} value={option.value} checked={value===option.value} onChange={()=>setEdits(previous=>{const next={...previous};if(option.value===saved?.status)delete next[student.id];else next[student.id]=option.value;return next;})}/>
            <span className="rw-mark-box"><Check size={13} className="rw-mark-check" aria-hidden="true"/><strong>{option.short}</strong><small>{option.caption}</small></span>
          </label>)}
          {value&&!['Present','Absent','Leave'].includes(value)&&<span className="rw-previous-mark">Recorded: {value}</span>}
        </fieldset>:<span className={`sp-badge ${value==='Present'?'paid':value==='Absent'?'unpaid':''}`}>{value||'Not marked'}</span>}</td><td><span className={`rw-save-state ${edits[student.id]?'is-unsaved':''}`}>{edits[student.id]?'Unsaved':saved?'Saved':'Not marked'}</span>{edits[student.id]&&<button className="rw-undo-mark" aria-label={`Undo attendance change for ${student.name}`} disabled={busy} onClick={()=>setEdits(previous=>{const next={...previous};delete next[student.id];return next;})}>Undo</button>}</td></tr>;
      })}</tbody></table></div>{!people.length&&<p className="rw-pad">No students match this class or search.</p>}
      {manage&&<section className="rw-save rw-save-review" aria-label="Attendance summary">
        <div className="rw-review-heading"><div><h3>{dirty?'Review & save attendance':savedCount?'Saved attendance':'Attendance summary'}</h3><p>{selected} · {dayLabel(day)} · Whole class</p></div><span className={`rw-review-state ${dirty?'is-pending':'is-saved'}`}>{dirty?`${Object.keys(edits).length} unsaved changes`:`${savedCount} / ${classRoster.length} saved`}</span></div>
        <dl className="rw-review-totals" aria-live="polite" aria-atomic="true">{['Total students','Present','Absent','Leave','Not marked',...(['Late','Half Day'].filter(status=>summary[status]>0))].map(status=><div key={status} className={`rw-total-${status.toLowerCase().replaceAll(' ','-')}`}><dt>{status}</dt><dd>{summary[status]}</dd></div>)}</dl>
        {summary['Not marked']>0&&<p className="rw-incomplete">{summary['Not marked']} student{summary['Not marked']===1?' is':'s are'} still not marked. You can save your progress; unmarked students will stay unmarked.</p>}
        {(search||section)&&<p className="rw-filter-note">Showing {people.length} of {classRoster.length} students. Totals above include the whole class.</p>}
        {saveError&&<p className="rw-save-error" role="alert">{saveError} Your selections are still here. Please try saving again.</p>}
        {message&&<p className="rw-save-confirmation" role="status"><Check size={16}/>{message}</p>}
        <div className="rw-review-actions"><span>{dirty?'Check the totals above, then save to the school register.':savedCount?'Saved records are available when you reopen this date.':'Select attendance for students to begin.'}</span><button className="button light" disabled={busy||!people.some(s=>!dayRecords.has(s.id)&&!edits[s.id])} onClick={()=>setEdits(previous=>({...previous,...Object.fromEntries(people.filter(s=>!dayRecords.has(s.id)&&!previous[s.id]).map(s=>[s.id,'Present']))}))}>Mark unmarked present</button><button className="button dark" disabled={busy||!dirty} onClick={async()=>{
        setBusy(true);setSaveError('');setMessage('');try{await api('/attendance','POST',{date:day,period:'Daily',records:Object.entries(edits).map(([studentId,status])=>({studentId,status}))});setRecords(previous=>[...previous.filter(row=>row.date!==day||!edits[row.personKey]),...Object.entries(edits).map(([personKey,status])=>({id:`${personKey}-${day}`,personKey,date:day,period:'Daily',status}))]);setEdits({});setMessage(`Attendance saved for ${selected} · ${dayLabel(day)}. ${classRoster.length-summary['Not marked']} of ${classRoster.length} students recorded.`);}catch(e:any){setSaveError(e.message);}finally{setBusy(false);}
      }}>{busy?'Saving…':'Save attendance'}<Check size={15}/></button></div></section>}
      <div className="rw-history"><div className="rw-heading"><div><h3>Daily attendance history</h3><p>Click a day to view or correct its register. P = present, A = absent. Unmarked is not absent.</p></div><label>Month<input type="month" aria-label="Class attendance month" max={today().slice(0,7)} value={month} disabled={busy} onChange={e=>{const value=e.target.value;if(value&&value<=today().slice(0,7))changeView(()=>setDay(value===today().slice(0,7)?today():`${value}-01`));}}/></label></div><div className="rw-calendar">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}{Array.from({length:offset},(_,i)=><span key={`empty${i}`}/>)}{Array.from({length:monthDays},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`, marks=byDate.get(date)||[];return <button key={date} aria-label={`Attendance on ${date}`} aria-pressed={day===date} disabled={date>today()||busy} onClick={()=>changeView(()=>setDay(date))}><strong>{i+1}</strong><span>{marks.length?`${marks.filter(r=>r.status==='Present').length} P · ${marks.filter(r=>r.status==='Absent').length} A`:'—'}</span><small>{marks.length?`${marks.length}/${classRoster.length} saved`:'Unmarked'}</small></button>;})}</div></div>
      </>}
    </>}
  </section>;
}
export function FeeWorkspace({onOpen,initialClass=''}:{onOpen:(student:Row)=>void;initialClass?:string}){
  const [revision,setRevision]=useState(0),{roster,error,loading}=useRoster(revision),[selected,setSelected]=useState(initialClass),[query,setQuery]=useState('');
  const people=useMemo(()=>roster.filter(s=>(!selected||classKey(s.className)===classKey(selected))&&[s.name,s.admissionNo,s.details?.rollNumber].some(value=>String(value||'').toLowerCase().includes(query.toLowerCase()))),[roster,selected,query]);
  return <section className="data-panel register-workspace"><div className="rw-heading"><div><h2>{selected?`${selected} fees`:'Student fees'}</h2><p>Class → student → month → fee details and payment.</p></div><label>Find student<input aria-label="Find fee student" placeholder="Name, roll or admission no." value={query} onChange={e=>setQuery(e.target.value)}/></label></div>{!selected&&!query&&<details className="fs-details"><summary>View monthly fee structure &amp; calculate total</summary><SchoolFeeSchedule/></details>}{error?<p className="error rw-pad">{error}<button onClick={()=>setRevision(v=>v+1)}>Retry</button></p>:loading?<p className="rw-pad" role="status">Loading students…</p>:!selected&&!query?<ClassCards roster={roster} onSelect={setSelected} purpose="fees"/>:<><div className="rw-controls"><button className="small-button" onClick={()=>{setSelected('');setQuery('');}}><ArrowLeft size={14}/>All classes</button><span>{people.length} students</span></div><div className="rw-student-list">{people.map(student=><button className="rw-student-card" key={student.id} onClick={()=>onOpen(student)}><span><strong>{student.name}</strong><small>{classLabel(student.className)} {student.section||''} · Roll {student.details?.rollNumber||'—'} · {student.admissionNo||'Admission pending'}</small></span><span>Monthly fees <ArrowRight size={16}/></span></button>)}</div>{!people.length&&<p className="rw-pad">No students match this search.</p>}</>}</section>;
}
