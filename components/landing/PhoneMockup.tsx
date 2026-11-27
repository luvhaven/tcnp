/**
 * The app, shown on a phone. Drawn in code rather than from a screenshot so
 * it stays sharp at any size and never shows a real officer's name or place.
 */
export function PhoneMockup({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      {/* Glow behind the device */}
      <div className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(242,101,34,0.45),transparent)] blur-2xl" />
      <div className="landing-float relative mx-auto w-[270px] rounded-[2.6rem] border border-white/15 bg-[#0b0f17] p-2.5 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,255,255,0.06)] sm:w-[300px]">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-[#0d1320]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-semibold text-white/80">
            <span>9:41</span>
            <span className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />LIVE</span>
          </div>

          {/* App header */}
          <div className="flex items-center justify-between px-4 pb-3 pt-2">
            <div>
              <p className="text-[13px] font-bold text-white">Live Tracking</p>
              <p className="text-[10px] text-white/50">3 journeys · 12 officers</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[9px] font-semibold text-emerald-300">Sharing on</span>
          </div>

          {/* Map */}
          <svg viewBox="0 0 280 300" className="block w-full" role="presentation">
            <defs>
              <linearGradient id="lp-route" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#f26522" />
                <stop offset="1" stopColor="#ffb347" />
              </linearGradient>
              <radialGradient id="lp-glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#f26522" stopOpacity="0.5" />
                <stop offset="1" stopColor="#f26522" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="280" height="300" fill="#0f1726" />
            {/* City blocks */}
            <g fill="#141e31">
              <rect x="-10" y="18" width="92" height="64" rx="6" /><rect x="96" y="-6" width="74" height="70" rx="6" />
              <rect x="184" y="14" width="110" height="58" rx="6" /><rect x="-12" y="98" width="70" height="86" rx="6" />
              <rect x="74" y="82" width="98" height="54" rx="6" /><rect x="186" y="88" width="104" height="92" rx="6" />
              <rect x="72" y="152" width="100" height="80" rx="6" /><rect x="-10" y="200" width="68" height="110" rx="6" />
              <rect x="186" y="196" width="104" height="110" rx="6" /><rect x="72" y="248" width="100" height="60" rx="6" />
            </g>
            {/* Water */}
            <path d="M-10 262 C 60 236, 120 290, 190 256 S 290 240, 300 250 L300 310 L-10 310 Z" fill="#0b2231" opacity="0.9" />
            {/* Route */}
            <path id="lp-path" d="M28 268 C 60 210, 64 190, 66 142 S 120 76, 178 78 S 236 52, 252 30" fill="none" stroke="#f26522" strokeOpacity="0.18" strokeWidth="9" strokeLinecap="round" />
            <path d="M28 268 C 60 210, 64 190, 66 142 S 120 76, 178 78 S 236 52, 252 30" fill="none" stroke="url(#lp-route)" strokeWidth="3.2" strokeLinecap="round" className="landing-route" />
            {/* Destination */}
            <circle cx="252" cy="30" r="16" fill="url(#lp-glow)" />
            <circle cx="252" cy="30" r="5" fill="#ffb347" stroke="#0f1726" strokeWidth="2" />
            {/* Other officers */}
            {[[112, 118, '#2dd4bf'], [214, 132, '#60a5fa'], [46, 96, '#2dd4bf'], [150, 206, '#a78bfa']].map(([cx, cy, colour]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r="6" fill={colour as string} opacity="0.35" className="landing-ping" />
                <circle cx={cx} cy={cy} r="4.5" fill={colour as string} stroke="#0f1726" strokeWidth="2" />
              </g>
            ))}
            {/* The convoy, moving along the route */}
            <g className="landing-travel" style={{ offsetPath: "path('M28 268 C 60 210, 64 190, 66 142 S 120 76, 178 78 S 236 52, 252 30')", offsetRotate: '0deg' }}>
              <circle r="15" fill="url(#lp-glow)" />
              <circle r="7" fill="#f26522" stroke="#fff" strokeWidth="2.5" />
            </g>
          </svg>

          {/* Journey card */}
          <div className="relative -mt-10 px-3 pb-4">
            <div className="rounded-2xl border border-white/10 bg-[#111a2b]/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f26522] text-[10px] font-bold text-white">T1</span>
                  <div>
                    <p className="text-[11px] font-semibold text-white">Tango 1 · En route</p>
                    <p className="text-[9px] text-white/50">Eagle Square → Theatre</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#ffb347]">8 min</span>
              </div>
              <div className="mt-2.5 flex gap-1">
                {['First Course', 'Chapman', 'Dessert'].map((sign, index) => (
                  <span key={sign} className={`flex-1 rounded-full px-1 py-1 text-center text-[8px] font-semibold ${index === 0 ? 'bg-[#f26522] text-white' : 'bg-white/[0.08] text-white/45'}`}>{sign}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
