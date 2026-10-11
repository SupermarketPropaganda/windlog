import { CloudSky } from './CloudSky';
import { FlightStory } from './FlightStory';
import { DEMO_LEGS, DEMO_TOTALS, degrees, minutes } from './demo-flight';
import './landing.css';

interface Props {
  signedIn: boolean;
  pilotName?: string;
  onSignIn: () => void;
  onRegister: () => void;
  onEnter: () => void;
  onAccount: () => void;
  onSignOut: () => void;
}
function Arrow({ down = false }: { down?: boolean }) { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={down ? { transform: 'rotate(90deg)' } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>; }
function PlaneMark() { return <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 19 12 29 19 29 22 19 18 18 26 22 29 16 28 10 29 14 26 13 18 3 22 3 19 13 12Z" fill="currentColor" /></svg>; }

export function LandingExperience({ signedIn, pilotName, onSignIn, onRegister, onEnter, onAccount, onSignOut }: Props) {
  const start = signedIn ? onEnter : onRegister;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <main className="wl-page">
    <section className="wl-hero" aria-labelledby="wl-title">
      <CloudSky />
      <header className="wl-nav">
        <a className="wl-brand" href="#landing" aria-label="Windlog home"><PlaneMark /><span>Windlog.</span></a>
        <div className="wl-nav-actions">{signedIn ? <><button onClick={onAccount} className="wl-text-button">Pilot account</button><button onClick={onSignOut} className="wl-text-button">Sign out</button></> : <><button onClick={onSignIn} className="wl-text-button">Sign in</button><button onClick={onRegister} className="wl-nav-register">Register <Arrow /></button></>}</div>
      </header>
      <div className="wl-hero-content">
        <h1 id="wl-title">Windlog<span>.</span></h1>
        <p className="wl-hero-heading">a clearer way to plan your flight</p>
        <div className="wl-hero-actions"><button className="wl-button wl-button-dark" onClick={start}>{signedIn ? 'Enter your cockpit' : 'Plan your first flight'}<Arrow /></button><button className="wl-explore" onClick={() => scrollTo('flight-story')}>See how it works <Arrow down /></button></div>
        {signedIn && <p className="wl-welcome">Welcome back, {pilotName || 'pilot'}.</p>}
      </div>
      <div className="wl-hero-foot"><button className="wl-scroll-cue" onClick={() => scrollTo('flight-story')}>SCROLL TO EXPLORE <Arrow down /></button></div>
    </section>
    <FlightStory />
    <section className="wl-log-section" aria-labelledby="wl-log-title">
      <div className="wl-section-heading"><div><h2 id="wl-log-title">Ready for your flight bag.</h2></div><p>The same route. A clear navigation log.<br />Built from the calculations you just followed.</p></div>
      <div className="wl-log-paper"><div className="wl-log-paper-header"><span><PlaneMark /> WINDLOG / NAVIGATION LOG</span><span>LPCS — LPSO — LPEV</span></div><div className="wl-table-scroll" tabIndex={0} role="region" aria-label="Example navigation log, scroll horizontally for all columns"><table><thead><tr><th>LEG</th><th>MAG. TRACK</th><th>MAG. HDG</th><th>DISTANCE</th><th>GS</th><th>TIME</th><th>FUEL</th></tr></thead><tbody>{DEMO_LEGS.map(leg => <tr key={leg.id}><th>{leg.from.identifier}<span> → </span>{leg.to.identifier}</th><td>{degrees(leg.trueTrack-leg.magneticVariation)}</td><td className="wl-heading-cell">{degrees(leg.magneticHeading)}</td><td>{leg.distance.toFixed(1)} <small>NM</small></td><td>{Math.round(leg.groundSpeed)} <small>KT</small></td><td>{minutes(leg.ete)}</td><td>{leg.fuelBurn.toFixed(1)} <small>gal</small></td></tr>)}</tbody></table></div><div className="wl-log-totals"><span>CRUISE TOTALS</span><b>{DEMO_TOTALS.distance.toFixed(1)} <small>NM</small></b><b>{minutes(DEMO_TOTALS.seconds)}</b><b>{DEMO_TOTALS.fuel.toFixed(1)} <small>US gal</small></b></div></div>
      <p className="wl-log-note">Illustrative cruise calculation. Taxi, climb, descent, alternate fuel, and reserves are excluded from this example.</p>
    </section>
    <section className="wl-tools" id="cockpit-tools" aria-labelledby="wl-tools-title"><div className="wl-section-heading"><div><h2 id="wl-tools-title">A little more prepared.<br />At every stage.</h2></div><p>Your route is only the beginning.<br />Keep the rest of your pre-flight planning close.</p></div>
      <div className="wl-tool-grid">
        <article><div className="wl-tool-art"><svg viewBox="0 0 320 170" aria-hidden="true"><path d="M45 20V138H285" stroke="#a6b8b6" fill="none" /><path d="M86 126 65 83 115 29 250 29 276 126Z" fill="#d8e9e3" stroke="#467c70" strokeWidth="1.5" /><path d="M170 104 188 65" stroke="#467c70" strokeDasharray="4 4" /><circle cx="188" cy="65" r="5" fill="#164b3f" /><circle cx="170" cy="104" r="4" fill="#fafbf8" stroke="#467c70" /><text x="199" y="68" fill="#164b3f" fontSize="10">TAKEOFF CG</text><text x="253" y="157" fill="#79908a" fontSize="9">ARM →</text></svg></div><h3>Find your balance.</h3><p>Bring people, baggage, and fuel together. See how your loading sits inside the aircraft’s centre-of-gravity envelope.</p></article>
        <article><div className="wl-tool-art"><svg viewBox="0 0 320 170" aria-hidden="true"><circle cx="160" cy="82" r="60" stroke="#b5c5c0" fill="none" /><circle cx="160" cy="82" r="45" stroke="#d7dfd8" fill="none" strokeDasharray="2 6" /><path d="M149 30H171V135H149Z" fill="#25443f" transform="rotate(30 160 82)" /><path d="M160 35V130" stroke="#eff6ec" strokeDasharray="9 7" transform="rotate(30 160 82)" /><path d="M42 79H116 M105 72L116 79L105 86" stroke="#2e8a7e" fill="none" strokeWidth="2" /><text x="38" y="60" fill="#2e8a7e" fontSize="10">WIND</text><text x="157" y="13" fill="#79908a" fontSize="10">N</text></svg></div><h3>Know your crosswind.</h3><p>Break the wind into headwind and crosswind components. Compare reciprocal runways before you line up.</p></article>
        <article><div className="wl-tool-art"><svg viewBox="0 0 320 170" aria-hidden="true"><g transform="translate(89 8) rotate(5 74 78)"><rect width="148" height="150" rx="2" fill="#fff" stroke="#a9b7ac" /><path d="M14 25H134 M14 45H134 M14 65H134 M14 85H134 M14 105H134 M14 125H134 M64 25V125 M104 25V125" stroke="#d0dad1" /><text x="14" y="17" fill="#264239" fontSize="8">WINDLOG / FLIGHT LOG</text><path d="M19 54H48 M73 54H93 M112 54H128 M19 74H48 M73 74H93 M112 74H128" stroke="#47766b" /><path d="m113 134 5 5 11-12" fill="none" stroke="#47766b" strokeWidth="2" /></g></svg></div><h3>From screen to kneeboard.</h3><p>Save your routes, share a flight plan, and print your navigation log in an A4 kneeboard format.</p></article>
      </div>
    </section>
    <section className="wl-final"><h2>Your next route<br />starts here<span>.</span></h2><button className="wl-button wl-button-light" onClick={start}>{signedIn ? 'Enter your cockpit' : 'Create your pilot account'}<Arrow /></button></section>
    <footer className="wl-footer"><span className="wl-footer-brand">Windlog.</span><span>VFR PLANNING / A CLEARER PICTURE</span><p>A planning aid. Always verify against official flight information.</p></footer>
  </main>;
}
