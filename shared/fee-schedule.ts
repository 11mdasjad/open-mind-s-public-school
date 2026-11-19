export type TuitionRate={id:string;className:string;amount:number};
export type TransportRate={route:string;amount:number};
export type FeeSchedule={session:string;tuition:TuitionRate[];transport:TransportRate[];canEditTransport?:boolean};
// Transcribed from the fee structure supplied by the school. Amounts are rupees/month.
export const suppliedTuition=[{className:'Nursery',amount:350},{className:'LKG',amount:350},{className:'UKG',amount:350},...Array.from({length:8},(_,i)=>({className:`Class ${i+1}`,amount:400}))];
export const suppliedTransport:TransportRate[]=[{route:'Jalalpur',amount:300},{route:'Dumra',amount:400},{route:'Lakri',amount:800},{route:'Bala',amount:400},{route:'Ajbinagar',amount:400},{route:'Parauli',amount:800}];
