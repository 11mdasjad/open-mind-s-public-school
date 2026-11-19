import { Bus, GraduationCap, Info } from 'lucide-react';
import { suppliedTransport, suppliedTuition } from '../shared/fee-schedule';
import './fee-structure-overview.css';

const money = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
// Keep the primary classes together when they share the same monthly rate.
const primary = suppliedTuition.filter(rate => rate.className.startsWith('Class '));
const tuition = [
  ...suppliedTuition.filter(rate => !rate.className.startsWith('Class ')),
  ...(primary.length === 8 && primary.every(rate => rate.amount === primary[0].amount)
    ? [{ className: 'Class 1 to 8', amount: primary[0].amount }]
    : primary),
];
const range = (amounts: number[]) => `${money(Math.min(...amounts))} – ${money(Math.max(...amounts))}`;

export function FeeStructureOverview() {
  return (
    <section className="fee-overview" aria-labelledby="fee-overview-title">
      <header className="fee-overview-heading">
        <div>
          <span className="fee-overview-eyebrow">OPEN MIND’S PUBLIC SCHOOL</span>
          <h2 id="fee-overview-title">Monthly fee structure</h2>
          <p>Tuition by class. Transport by route. All amounts are per month.</p>
        </div>
        <span className="fee-overview-badge">Monthly fees · INR</span>
      </header>

      <div className="fee-overview-grid">
        <article className="fee-overview-card" aria-labelledby="tuition-fee-title">
          <header><span className="fee-overview-icon"><GraduationCap size={24} aria-hidden="true" /></span><div><h3 id="tuition-fee-title">Tuition fee</h3><p>Monthly · per student</p></div></header>
          <table aria-labelledby="tuition-fee-title">
            <thead><tr><th scope="col">Class</th><th scope="col">Monthly fee</th></tr></thead>
            <tbody>{tuition.map(rate => <tr key={rate.className}><th scope="row">{rate.className}</th><td><strong>{money(rate.amount)}</strong></td></tr>)}</tbody>
          </table>
          <div className="fee-overview-range"><span>Tuition fee range</span><strong>{range(suppliedTuition.map(rate => rate.amount))}<small> / month</small></strong></div>
        </article>

        <article className="fee-overview-card fee-overview-transport" aria-labelledby="transport-fee-title">
          <header><span className="fee-overview-icon"><Bus size={24} aria-hidden="true" /></span><div><h3 id="transport-fee-title">Transport fee</h3><p>Monthly · route wise</p></div></header>
          <table aria-labelledby="transport-fee-title">
            <thead><tr><th scope="col">S. No.</th><th scope="col">Transport route</th><th scope="col">Monthly fee</th></tr></thead>
            <tbody>{suppliedTransport.map((rate, index) => <tr key={rate.route}><td className="fee-overview-number">{index + 1}</td><th scope="row">{rate.route}</th><td><strong>{money(rate.amount)}</strong></td></tr>)}</tbody>
          </table>
          <div className="fee-overview-range"><span>Transport fee range</span><strong>{range(suppliedTransport.map(rate => rate.amount))}<small> / month</small></strong></div>
        </article>
      </div>

      <aside className="fee-overview-note" aria-label="Monthly fee calculation">
        <Info size={22} aria-hidden="true" />
        <div><strong>Total monthly fee = Tuition fee + Applicable transport fee</strong><p>All fees are on a monthly basis. Add the transport fee for the student’s route to their class tuition fee.</p></div>
      </aside>
    </section>
  );
}
