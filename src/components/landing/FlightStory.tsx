import { useEffect, useRef, useState } from 'react';
import { DEMO_LEGS, DEMO_POINTS, DEMO_TOTALS, degrees, minutes, project } from './demo-flight';

export function FlightStory() {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce), (max-height: 600px)');
    const updateMotion = () => setReduced(media.matches); updateMotion();
    media.addEventListener('change', updateMotion);
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setProgress(Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - window.innerHeight))));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule); update();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); media.removeEventListener('change', updateMotion); };
  }, []);
  const traced = reduced ? 1 : Math.min(1, .035 + progress * 1.06);
  const lengths = DEMO_POINTS.slice(1).map((p, i) => Math.hypot(p[0] - DEMO_POINTS[i][0], p[1] - DEMO_POINTS[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const distance = traced * total;
  const index = distance <= lengths[0] ? 0 : 1;
  const fraction = Math.min(1, (distance - (index ? lengths[0] : 0)) / lengths[index]);
  const from = DEMO_POINTS[index], to = DEMO_POINTS[index + 1];
  const plane = [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
  const leg = DEMO_LEGS[index];
  const magneticTrack = (leg.trueTrack - leg.magneticVariation + 360) % 360;
  const path = DEMO_POINTS.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const coast = [[39.9,-9.03],[39.65,-9.09],[39.48,-9.26],[39.36,-9.41],[39.1,-9.42],[38.8,-9.49],[38.7,-9.43],[38.7,-9.15],[38.76,-9.1],[38.85,-8.94],[38.68,-9.03],[38.55,-9.2],[38.43,-9.2],[38.42,-8.98],[38.2,-8.9],[38,-8.9]].map(([lat,lon]) => project(lat,lon));
  const coastPath = coast.map((p,i) => `${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
  return <section ref={ref} className={`wl-story ${reduced ? 'wl-story-reduced' : ''}`} id="flight-story" aria-label="An example flight plan, revealed as you scroll">
    <div className="wl-story-sticky">
      <div className="wl-story-top"><span className="wl-example"><i /> Illustrative flight · Portugal</span></div>
      <h2 className="wl-story-title">A route becomes a flight plan.</h2>
      <div className="wl-story-layout">
        <div className="wl-chart">
          <div className="wl-chart-top"><span>LPCS <b>→</b> LPSO <b>→</b> LPEV</span><small>C172 / 3,500 FT</small></div>
          <svg className="wl-route-chart" viewBox="0 0 700 520" role="img" aria-label="Schematic route from Cascais via Ponte de Sor to Évora, with an aircraft tracing the route">
            <defs><pattern id="wl-grid" width="70" height="65" patternUnits="userSpaceOnUse"><path d="M70 0H0V65" fill="none" stroke="#90acb5" strokeOpacity=".09" /></pattern><radialGradient id="wl-map-glow"><stop stopColor="#16333b" /><stop offset="1" stopColor="#0b1a23" /></radialGradient></defs>
            <rect width="700" height="520" fill="url(#wl-map-glow)" /><rect width="700" height="520" fill="url(#wl-grid)" />
            <path d={`${coastPath} L700,540 L700,-20 L${coast[0][0]},${coast[0][1]}Z`} fill="#36514e" fillOpacity=".16" />
            <path d={coastPath} fill="none" stroke="#638d88" strokeOpacity=".6" strokeWidth="1.3" />
            {[0,1,2,3].map(i => <path key={i} d={`M${280+i*38},-20 C${180+i*55},110 ${410+i*18},230 ${345+i*44},320 S${570+i*22},470 ${440+i*45},560`} fill="none" stroke="#90ad8d" strokeOpacity=".07" />)}
            <text x="65" y="243" className="wl-ocean" transform="rotate(-90 65 243)">ATLANTIC OCEAN</text>
            <text x="385" y="77" className="wl-country">P O R T U G A L</text>
            <g transform="translate(643 70)" className="wl-north"><path d="M0 24V-17 M-5 -9L0 -19L5 -9" /><text x="0" y="-29" textAnchor="middle">N</text></g>
            <path d={path} fill="none" stroke="#75d6d2" strokeOpacity=".22" strokeWidth="1.5" strokeDasharray="5 7" />
            <path data-testid="traced-route" d={path} fill="none" stroke="#8ee9e0" strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset={1-traced} />
            {DEMO_POINTS.map(([x,y], i) => <g key={i} transform={`translate(${x} ${y})`}><circle r="14" fill="#10262d" stroke="#8ee9e0" strokeOpacity=".22" /><circle r="4" fill="#c3f6e9" /><text x={i === 1 ? 19 : -20} y={i === 1 ? -13 : 32} className="wl-airport-code">{['LPCS','LPSO','LPEV'][i]}</text><text x={i === 1 ? 19 : -20} y={i === 1 ? 5 : 50} className="wl-airport-name">{['Cascais','Ponte de Sor','Évora'][i]}</text></g>)}
            <g className="wl-wind-vector" transform="translate(110 98)"><path d="M0 0H70 M61 -6L70 0L61 6" /><path d="M-8 12H42" opacity=".35" /><text x="0" y="-15">WIND 270°T / 15 KT</text></g>
            <g transform={`translate(${plane[0]} ${plane[1]})`}>
              <><path d="M0 0V-85" stroke="#f8fafc" strokeDasharray="4 4" opacity=".4" transform={`rotate(${leg.trueTrack})`} /><path d="M0 0V-72" stroke="#8ee9e0" strokeWidth="1.5" opacity=".8" transform={`rotate(${leg.trueHeading})`} /></>
              <circle r="21" fill="#9cf3e3" opacity=".07" />
              <path d="M0 -17 L3 -5 L15 3 L15 6 L3 2 L2 11 L6 14 L6 16 L0 14 L-6 16 L-6 14 L-2 11 L-3 2 L-15 6 L-15 3 L-3 -5 Z" fill="#e3fff5" transform={`rotate(${leg.trueHeading})`} />
            </g>
            <text x="25" y="496" className="wl-chart-scale">SCHEMATIC / NOT FOR NAVIGATION</text><path d="M552 489H642 M552 485V493 M642 485V493" stroke="#6e8892" /><text x="596" y="479" textAnchor="middle" className="wl-chart-scale">~20 NM</text>
          </svg>
          <div className="wl-chart-bottom"><span><i /> {traced >= 1 ? 'Route complete' : 'Tracing the flight'} </span><span>{Math.round(traced * DEMO_TOTALS.distance)} / {Math.round(DEMO_TOTALS.distance)} NM</span></div>
        </div>
        <aside className="wl-flight-copy">
          <div className="wl-story-description"><p>Gustlog is your VFR planning workspace. Build a route, understand the wind, and bring your headings, times, and fuel into one readable navigation log.</p><p>Follow a short flight across Portugal to see it come together.</p></div>
          <div className="wl-leg-label"><span>ACTIVE LEG</span><b>{leg.from.identifier} → {leg.to.identifier}</b></div>
          <dl className="wl-metrics">
            <div><dt>Magnetic track</dt><dd>{degrees(magneticTrack)}<small>M</small></dd></div>
            <div><dt>Magnetic heading</dt><dd>{degrees(leg.magneticHeading)}<small>M</small></dd></div>
            <div><dt>Wind correction</dt><dd>{`${leg.windCorrectionAngle > 0 ? '+' : ''}${leg.windCorrectionAngle.toFixed(1)}°`}</dd></div>
            <div><dt>Mag. variation</dt><dd>{`${Math.abs(leg.magneticVariation).toFixed(1)}°`}<small>{leg.magneticVariation < 0 ? 'W' : 'E'}</small></dd></div>
            <div><dt>Leg distance</dt><dd>{leg.distance.toFixed(1)}<small>NM</small></dd></div>
            <div><dt>Groundspeed</dt><dd>{Math.round(leg.groundSpeed)}<small>KT</small></dd></div>
          </dl>
          <div className="wl-leg-result"><span>LEG TIME <b>{minutes(leg.ete)}</b></span><span>LEG FUEL <b>{`${leg.fuelBurn.toFixed(1)} US gal`}</b></span></div>
          <p className="wl-demo-note">Example wind, not a live forecast. 105 KT TAS · 8.5 US gal/h. Calculated by Gustlog.</p>
        </aside>
      </div>
      <div className="wl-story-progress" role="progressbar" aria-label="Flight animation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(traced*100)}><span style={{ width: `${traced*100}%` }} /></div><p className="wl-story-scroll">{reduced ? 'Scroll to continue ↓' : traced >= 1 ? 'Flight complete · Keep scrolling to explore ↓' : 'Scroll to fly the route · Keep scrolling to continue ↓'}</p>
    </div>
  </section>;
}
