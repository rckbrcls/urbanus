type PipeStroke = {
  d: string;
  width: number;
};

const pipeStrokes: PipeStroke[] = [
  {
    d: "M-140 520 H240 Q340 520 340 620 V900",
    width: 88,
  },
  {
    d: "M1035 -120 V270 Q1035 350 955 350 H760",
    width: 84,
  },
  {
    d: "M1280 620 H935 Q835 620 835 520 V400",
    width: 78,
  },
  {
    d: "M0 170 H390 Q480 170 480 260",
    width: 72,
  },
  {
    d: "M980 -90 V70",
    width: 52,
  },
  {
    d: "M-60 720 Q40 730 115 785",
    width: 58,
  },
  {
    d: "M1240 210 H1110",
    width: 52,
  },
  {
    d: "M1040 900 V760 Q1040 700 1110 700 H1260",
    width: 58,
  },
  {
    d: "M430 850 H650",
    width: 46,
  },
  {
    d: "M1030 270 H1160",
    width: 40,
  },
];

export function SewerPipeBackground() {
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden="true"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className="stroke-[#f1f1f1] transition-colors duration-300 dark:stroke-[#242424]">
          {pipeStrokes.map((pipe) => (
            <path key={`${pipe.d}-body`} d={pipe.d} strokeWidth={pipe.width + 8} />
          ))}
        </g>

        <g className="stroke-[#e8e8e8] transition-colors duration-300 dark:stroke-[#0c0c0c]">
          {pipeStrokes.map((pipe) => (
            <path key={`${pipe.d}-core`} d={pipe.d} strokeWidth={pipe.width} />
          ))}
        </g>
      </g>
    </svg>
  );
}
