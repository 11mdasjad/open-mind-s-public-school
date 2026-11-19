// Invoice adjustments are spread across original fee heads in integer paise.
// Verified payments settle those heads in their recorded invoice order.
export function feeHeadBalances(invoice:any){
 const paid=invoice.paid??invoice.payments.reduce((n:number,p:any)=>n+p.amount-(p.refunds||[]).reduce((s:number,r:any)=>s+r.amount,0),0);
 const items=Array.isArray(invoice.items)&&invoice.items.length?invoice.items:[{description:invoice.title,amount:invoice.originalAmount??invoice.amount,category:invoice.title.toLowerCase().startsWith('transport')?'Transport Fee':'Tuition Fee',route:invoice.snapshot?.route||invoice.title.split('·')[1]?.trim()||''}];
 const base=items.reduce((n:number,r:any)=>n+r.amount,0);let remaining=invoice.amount,settled=paid;
 return items.map((r:any,n:number)=>{const demand=n===items.length-1?remaining:base?Number(BigInt(invoice.amount)*BigInt(r.amount)/BigInt(base)):0;remaining-=demand;const collected=Math.min(settled,demand);settled-=collected;return {...r,demand,collected,outstanding:demand-collected};});
}
// Financial reporting follows the school's calendar, including payments near midnight.
export function schoolDate(value: string | Date = new Date()) {
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
 return new Date(value).toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});
}
