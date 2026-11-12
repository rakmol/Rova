type Model={status:string;pricing:{state:string;currency:string;periodDays:number;plans:{id:string;name:string;amount:number}[];terms:string};targeting:string;consent:string;ranking:string;driving:string;analytics:string;launchGates:string[]};
export function SponsorshipPlan({model}:{model:Model}){return <section aria-label="Sponsorship model">
 <h2>Keep navigation and safety free</h2><p className="notice">{model.status}. Reviews prepare drafts only; there is no way to publish an ad.</p>
 <h3>Proposed pricing — not available for purchase</h3><p>{model.pricing.state}. Per business location, per {model.pricing.periodDays} days.</p>
 <div className="tablewrap"><table><thead><tr><th>Proposed plan</th><th>Proposed price</th></tr></thead><tbody>{model.pricing.plans.map(plan=><tr key={plan.id}><td>{plan.name}</td><td>{model.pricing.currency} {plan.amount}</td></tr>)}</tbody></table></div><p>{model.pricing.terms}</p>
 <h3>Choice and targeting</h3><p>{model.targeting}</p><p>{model.consent}</p>
 <h3>Driver safety and ranking</h3><p>{model.driving}</p><p>{model.ranking}</p>
 <h3>Before launch</h3><ul>{model.launchGates.map(gate=><li key={gate}>{gate}</li>)}</ul>
 <h3>Aggregate advertiser reporting</h3><p>{model.analytics}</p><p>Collection is disabled. Empty reports represent no collected data, not measured zero performance. There is no advertiser portal yet.</p>
 </section>;}
