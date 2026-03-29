export function SewerPipeBackground() {
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full pointer-events-none text-muted-foreground"
      aria-hidden="true"
    >
      {/* Secondary pipes — thin, faint background layer */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.04}
      >
        {/* Horizontal secondary branches */}
        <path d="M0 180 Q150 170 300 185 T600 175 T900 190 T1200 180" strokeWidth={3} />
        <path d="M0 620 Q200 630 400 615 T800 625 T1200 620" strokeWidth={2.5} />
        <path d="M0 420 Q100 415 250 425 T500 410 T750 430 T1000 415 T1200 420" strokeWidth={2} />

        {/* Vertical secondary branches */}
        <path d="M180 0 Q175 150 185 300 T175 500 T185 700 T180 800" strokeWidth={2.5} />
        <path d="M520 0 Q525 200 515 400 T525 600 T520 800" strokeWidth={2} />
        <path d="M1020 0 Q1015 100 1025 250 T1015 450 T1025 650 T1020 800" strokeWidth={2.5} />

        {/* Diagonal secondary */}
        <path d="M0 50 Q200 200 350 350 T550 500" strokeWidth={2} />
        <path d="M900 0 Q850 150 800 300 T750 500" strokeWidth={2} />
        <path d="M1200 300 Q1050 400 950 550 T800 750" strokeWidth={2} />
      </g>

      {/* Main collector pipes — thicker, more visible */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.08}
      >
        {/* Primary horizontal collectors */}
        <path
          d="M-50 320 Q100 310 250 325 T500 315 T750 330 T1000 320 T1250 325"
          strokeWidth={6}
        />
        <path
          d="M-50 520 Q150 530 350 515 T650 525 T900 510 T1250 520"
          strokeWidth={5}
        />

        {/* Primary vertical collectors */}
        <path
          d="M380 -50 Q375 100 385 250 T375 400 T385 550 T380 700 T375 850"
          strokeWidth={5.5}
        />
        <path
          d="M780 -50 Q785 150 775 300 T785 450 T775 600 T785 850"
          strokeWidth={5}
        />

        {/* Diagonal collector (trunk line) */}
        <path
          d="M50 -50 Q200 100 350 250 T550 450 T700 600 T900 850"
          strokeWidth={4.5}
        />
      </g>

      {/* Manholes (PVs) at intersections */}
      <g opacity={0.1}>
        {/* PVs on main intersections */}
        <circle cx={380} cy={320} r={10} fill="none" stroke="currentColor" strokeWidth={2.5} />
        <circle cx={380} cy={320} r={4} fill="currentColor" opacity={0.4} />

        <circle cx={780} cy={320} r={10} fill="none" stroke="currentColor" strokeWidth={2.5} />
        <circle cx={780} cy={320} r={4} fill="currentColor" opacity={0.4} />

        <circle cx={380} cy={520} r={10} fill="none" stroke="currentColor" strokeWidth={2.5} />
        <circle cx={380} cy={520} r={4} fill="currentColor" opacity={0.4} />

        <circle cx={780} cy={520} r={10} fill="none" stroke="currentColor" strokeWidth={2.5} />
        <circle cx={780} cy={520} r={4} fill="currentColor" opacity={0.4} />

        {/* PVs on secondary intersections */}
        <circle cx={180} cy={320} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
        <circle cx={180} cy={320} r={3} fill="currentColor" opacity={0.3} />

        <circle cx={520} cy={420} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
        <circle cx={520} cy={420} r={3} fill="currentColor" opacity={0.3} />

        <circle cx={1020} cy={520} r={7} fill="none" stroke="currentColor" strokeWidth={2} />
        <circle cx={1020} cy={520} r={3} fill="currentColor" opacity={0.3} />

        <circle cx={250} cy={185} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />
        <circle cx={780} cy={180} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />
        <circle cx={520} cy={620} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </g>

      {/* Flow direction arrows */}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.06}
      >
        {/* Arrows along horizontal collector */}
        <path d="M150 315 l12 5 -12 5" strokeWidth={2} />
        <path d="M600 310 l12 5 -12 5" strokeWidth={2} />
        <path d="M950 318 l12 5 -12 5" strokeWidth={2} />

        {/* Arrows along vertical collector */}
        <path d="M375 150 l5 12 5 -12" strokeWidth={2} />
        <path d="M385 650 l5 12 5 -12" strokeWidth={2} />
        <path d="M780 200 l5 12 5 -12" strokeWidth={2} />
        <path d="M775 700 l5 12 5 -12" strokeWidth={2} />

        {/* Arrows along diagonal */}
        <path d="M280 180 l10 8 -4 -12" strokeWidth={1.8} />
        <path d="M620 520 l10 8 -4 -12" strokeWidth={1.8} />

        {/* T-junction details */}
        <path d="M375 320 h-20 M385 320 h20" strokeWidth={2.5} opacity={0.5} />
        <path d="M780 515 v-20 M780 525 v20" strokeWidth={2.5} opacity={0.5} />
      </g>
    </svg>
  );
}
