import React from 'react';
import type { LibraryArtKey } from './libraryCatalog';

// Flat vector illustrations for the interactive library cards (viewBox 150×120).
const INK = '#2b2440';
const SKIN = '#f6c8a5';

function Shadow({ x = 75, y = 114, w = 46 }: { x?: number; y?: number; w?: number }) {
  return <ellipse cx={x} cy={y} rx={w} ry={5} fill="#000" opacity={0.08} />;
}

function Sparkle({ x, y, s = 1, color = '#fff' }: { x: number; y: number; s?: number; color?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6 Z" fill={color} />;
}

function Hand({ x, y, s = 1, rotate = 0, skin = SKIN }: { x: number; y: number; s?: number; rotate?: number; skin?: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`}>
    <rect x={-1} y={-26} width={6} height={22} rx={3} fill={skin} />
    <rect x={6} y={-30} width={6} height={26} rx={3} fill={skin} />
    <rect x={13} y={-28} width={6} height={24} rx={3} fill={skin} />
    <rect x={20} y={-23} width={5.5} height={19} rx={2.75} fill={skin} />
    <rect x={-1} y={-10} width={26.5} height={24} rx={10} fill={skin} />
    <rect x={-10} y={-6} width={6} height={17} rx={3} fill={skin} transform="rotate(-35 -7 2)" />
    <path d="M4 -1 v6 M10 -2 v6 M16 -1 v6" stroke="#e3a982" strokeWidth={1.2} strokeLinecap="round" />
    <rect x={-3} y={12} width={30} height={10} rx={4} fill="#5a7bd8" />
  </g>;
}

function wedge(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
}

const arts: Record<LibraryArtKey, () => React.ReactNode> = {
  gesture: () => <>
    <Shadow />
    <g transform="rotate(-6 76 60)">
      <rect x={44} y={6} width={62} height={104} rx={11} fill="#2c3554" />
      <rect x={48} y={14} width={54} height={88} rx={6} fill="#eef3ff" />
      <rect x={68} y={9} width={14} height={2.5} rx={1.2} fill="#55608a" />
      <path d="M53 102 Q53 76 75 74 Q97 76 97 102 Z" fill="#5aa9e6" />
      <path d="M68 75 L75 84 L82 75 Z" fill="#fff" />
      <rect x={71} y={63} width={8} height={12} fill={SKIN} />
      <ellipse cx={75} cy={54} rx={13} ry={14} fill={SKIN} />
      <path d="M61 54 Q60 36 75 36 Q90 36 89 54 Q86 44 76 43 Q68 47 61 54 Z" fill="#4a2f22" />
      <path d="M61 52 Q58 66 63 74 L66 60 Z M89 52 Q92 66 87 74 L84 60 Z" fill="#4a2f22" />
      <circle cx={70} cy={56} r={1.6} fill={INK} /><circle cx={80} cy={56} r={1.6} fill={INK} />
      <path d="M71 61 Q75 64.5 79 61" stroke={INK} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <rect x={88} y={20} width={10} height={7} rx={2} fill="#7b5ce6" />
      <path d="M98 22 l4 -2 v7 l-4 -2 Z" fill="#7b5ce6" />
    </g>
    <Hand x={112} y={78} s={1.05} rotate={12} />
    <Sparkle x={128} y={28} s={1.1} color="#ffcf4d" />
    <Sparkle x={30} y={40} s={0.8} color="#7b5ce6" />
  </>,
  wheel: () => {
    const colors = ['#ff5d5d', '#ff9f43', '#ffd166', '#5cd18b', '#38bdf8', '#6c7cff', '#b46cff', '#ff6fb1'];
    return <>
      <Shadow />
      <path d="M62 112 L75 70 L88 112 Z" fill="#7a4a2a" />
      <circle cx={75} cy={58} r={46} fill="#fff" />
      {colors.map((color, index) => <path key={color} d={wedge(75, 58, 42, (index * Math.PI) / 4 - Math.PI / 2, ((index + 1) * Math.PI) / 4 - Math.PI / 2)} fill={color} />)}
      {colors.map((_, index) => { const a = (index * Math.PI) / 4 - Math.PI / 2; return <circle key={index} cx={75 + 45 * Math.cos(a)} cy={58 + 45 * Math.sin(a)} r={2.2} fill="#ffe08a" />; })}
      <circle cx={75} cy={58} r={9} fill="#fff" />
      <circle cx={75} cy={58} r={4.5} fill="#ff9f43" />
      <path d="M75 4 L68 -6 L82 -6 Z" fill="#e5484d" transform="translate(0 10)" />
      <Sparkle x={130} y={22} s={1.2} color="#fff" />
      <Sparkle x={20} y={92} s={0.9} color="#fff" />
    </>;
  },
  cards: () => <>
    <Shadow w={40} />
    <g transform="rotate(-18 60 70)">
      <rect x={38} y={24} width={44} height={64} rx={6} fill="#ffcf4d" />
      <rect x={42} y={28} width={36} height={56} rx={4} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="4 3" />
    </g>
    <g transform="rotate(14 92 70)">
      <rect x={72} y={22} width={44} height={64} rx={6} fill="#fff" />
      <path d="M94 42 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 Z" fill="#ff5d8a" />
      <text x={78} y={36} fontSize={10} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#ff5d8a">A</text>
    </g>
    <g>
      <rect x={52} y={18} width={46} height={68} rx={6} fill="#fff" />
      <rect x={56} y={22} width={38} height={60} rx={4} fill="#ffe7ef" />
      <text x={75} y={62} textAnchor="middle" fontSize={30} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#7b5ce6">?</text>
    </g>
    <Sparkle x={126} y={20} s={1.3} color="#ffcf4d" />
    <Sparkle x={24} y={30} s={0.9} color="#fff" />
    <Sparkle x={130} y={92} s={0.8} color="#fff" />
  </>,
  plicker: () => <>
    <Shadow />
    <g transform="rotate(8 80 60)">
      <rect x={52} y={8} width={56} height={100} rx={10} fill="#22304d" />
      <rect x={56} y={16} width={48} height={84} rx={5} fill="#fff" />
      <rect x={62} y={30} width={36} height={36} rx={3} fill="#fff" stroke="#22304d" strokeWidth={1.5} />
      {[[64, 32], [86, 32], [64, 54]].map(([x, y]) => <g key={`${x}${y}`}><rect x={x} y={y} width={10} height={10} fill="#22304d" /><rect x={x + 2.5} y={y + 2.5} width={5} height={5} fill="#fff" /><rect x={x + 3.8} y={y + 3.8} width={2.4} height={2.4} fill="#22304d" /></g>)}
      {[[78, 34], [80, 40], [76, 46], [84, 50], [88, 56], [80, 58], [92, 46], [86, 60], [76, 62]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={3.5} height={3.5} fill="#22304d" />)}
      <rect x={58} y={48} width={44} height={2.5} rx={1} fill="#22c55e" opacity={0.85} />
      <rect x={64} y={74} width={32} height={7} rx={3.5} fill="#22c55e" />
      <rect x={68} y={86} width={24} height={4} rx={2} fill="#cbd5e1" />
    </g>
    <Hand x={104} y={92} s={0.95} rotate={-20} />
    <Sparkle x={28} y={30} s={1} color="#fff" />
  </>,
  wall: () => <>
    <Shadow />
    <rect x={18} y={14} width={114} height={86} rx={6} fill="#b97a45" />
    <rect x={24} y={20} width={102} height={74} rx={3} fill="#e7b57b" />
    {[[30, 26, '#ffd166', -4], [58, 24, '#7dd3fc', 3], [86, 27, '#f9a8d4', -2], [32, 58, '#86efac', 4], [60, 56, '#fdba74', -3], [92, 60, '#c4b5fd', 2]].map(([x, y, color, r]) => <g key={`${x}-${y}`} transform={`rotate(${r} ${Number(x) + 12} ${Number(y) + 12})`}>
      <rect x={Number(x)} y={Number(y)} width={24} height={24} rx={2} fill={String(color)} />
      <path d={`M${Number(x) + 4} ${Number(y) + 10} h14 M${Number(x) + 4} ${Number(y) + 15} h10`} stroke="#00000030" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={Number(x) + 12} cy={Number(y) + 2.5} r={2.4} fill="#e5484d" />
    </g>)}
    <path d="M75 100 L65 114 M75 100 L85 114" stroke="#7a4a2a" strokeWidth={4} strokeLinecap="round" />
    <Sparkle x={136} y={14} s={1.1} color="#fff" />
  </>,
  'head-shake': () => <>
    <Shadow />
    <path d="M28 60 l12 -9 v18 Z M122 60 l-12 -9 v18 Z" fill="#ff7a59" />
    <path d="M40 60 h8 M102 60 h8" stroke="#ff7a59" strokeWidth={5} strokeLinecap="round" />
    <path d="M50 112 Q50 88 75 86 Q100 88 100 112 Z" fill="#5cb37a" />
    <rect x={70} y={76} width={10} height={12} fill={SKIN} />
    <circle cx={75} cy={58} r={24} fill={SKIN} />
    <path d="M51 56 Q50 32 75 32 Q100 32 99 56 Q94 42 80 41 Q70 47 58 45 Q53 49 51 56 Z" fill="#3b2a20" />
    <circle cx={66} cy={60} r={2.6} fill={INK} /><circle cx={84} cy={60} r={2.6} fill={INK} />
    <circle cx={60} cy={67} r={3.5} fill="#f2917f" opacity={0.5} /><circle cx={90} cy={67} r={3.5} fill="#f2917f" opacity={0.5} />
    <path d="M68 69 Q75 75 82 69" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
    <rect x={98} y={10} width={30} height={20} rx={5} fill="#2c3554" />
    <circle cx={113} cy={20} r={6} fill="#7dd3fc" /><circle cx={113} cy={20} r={2.6} fill="#2c3554" />
    <circle cx={123} cy={14} r={1.6} fill="#ff5d5d" />
    <Sparkle x={30} y={22} s={1} color="#fff" />
  </>,
  robot: () => <>
    <Shadow />
    <rect x={46} y={82} width={58} height={28} rx={12} fill="#e8eefb" />
    <circle cx={75} cy={96} r={6} fill="#7dd3fc" />
    <rect x={30} y={86} width={16} height={8} rx={4} fill="#c9d6f0" transform="rotate(-25 38 90)" />
    <rect x={104} y={86} width={16} height={8} rx={4} fill="#c9d6f0" transform="rotate(25 112 90)" />
    <rect x={40} y={34} width={70} height={52} rx={18} fill="#ffffff" />
    <rect x={48} y={44} width={54} height={30} rx={13} fill="#22304d" />
    <ellipse cx={64} cy={59} rx={6} ry={7} fill="#5eead4" />
    <ellipse cx={86} cy={59} rx={6} ry={7} fill="#5eead4" />
    <path d="M69 68 Q75 72 81 68" stroke="#5eead4" strokeWidth={2} fill="none" strokeLinecap="round" />
    <rect x={34} y={52} width={7} height={16} rx={3.5} fill="#c9d6f0" />
    <rect x={109} y={52} width={7} height={16} rx={3.5} fill="#c9d6f0" />
    <path d="M46 26 L75 14 L104 26 L75 38 Z" fill="#22304d" />
    <rect x={64} y={28} width={22} height={8} fill="#22304d" />
    <path d="M100 27 v14" stroke="#ffcf4d" strokeWidth={2} />
    <circle cx={100} cy={43} r={3} fill="#ffcf4d" />
    <Sparkle x={124} y={22} s={1.2} color="#ffcf4d" />
    <Sparkle x={24} y={40} s={0.9} color="#fff" />
  </>,
  kpi: () => <>
    <Shadow w={47} />
    <g transform="rotate(-4 70 59)">
      <rect x={34} y={9} width={81} height={100} rx={10} fill="#fefeff" stroke="#a6b8f8" strokeWidth={2}/>
      <rect x={53} y={4} width={43} height={14} rx={6} fill="#6479db"/>
      <text x={74} y={36} fontSize={13} fontWeight={900} textAnchor="middle" fontFamily="Nunito, sans-serif" fill="#4f46e5">KPI</text>
      <rect x={45} y={47} width={11} height={47} rx={3} fill="#9aa5fa"/>
      <rect x={61} y={63} width={11} height={31} rx={3} fill="#79d2c6"/>
      <rect x={77} y={41} width={11} height={53} rx={3} fill="#6f72e8"/>
      <rect x={93} y={57} width={11} height={37} rx={3} fill="#eea5c9"/>
    </g>
    <circle cx={113} cy={92} r={20} fill="#2fc39e" stroke="white" strokeWidth={4}/>
    <path d="M102 91 L110 99 L124 85" stroke="white" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Sparkle x={28} y={25} s={1.1} color="#fff"/>
  </>,
  exam: () => <>
    <Shadow />
    <g transform="rotate(-5 70 60)">
      <rect x={34} y={10} width={66} height={92} rx={5} fill="#fff" />
      <text x={67} y={30} textAnchor="middle" fontSize={15} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#e5484d">THI</text>
      {[42, 56, 70, 84].map(y => <g key={y}>
        <rect x={42} y={y - 5} width={8} height={8} rx={2} fill="none" stroke="#94a3b8" strokeWidth={1.4} />
        <path d={`M43.5 ${y - 1} l2.4 2.6 l4 -5`} stroke="#22c55e" strokeWidth={2} fill="none" strokeLinecap="round" />
        <rect x={55} y={y - 3} width={34} height={3.5} rx={1.7} fill="#cbd5e1" />
      </g>)}
    </g>
    <circle cx={112} cy={74} r={20} fill="#fff" stroke="#ff7a59" strokeWidth={5} />
    <rect x={108} y={48} width={8} height={6} rx={2} fill="#ff7a59" />
    <path d="M112 74 V62 M112 74 L121 79" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
    <g transform="rotate(35 40 90)">
      <rect x={36} y={66} width={8} height={36} rx={1.5} fill="#ffcf4d" />
      <rect x={36} y={66} width={8} height={5} fill="#ff6fb1" />
      <path d="M36 102 L40 110 L44 102 Z" fill="#f3d3b5" />
    </g>
    <Sparkle x={128} y={24} s={1.1} color="#fff" />
  </>,
  chest: () => <>
    <Shadow w={50} />
    <circle cx={75} cy={46} r={30} fill="#fff6c8" opacity={0.75} />
    <circle cx={60} cy={44} r={7} fill="#ffcf4d" stroke="#e8a72a" strokeWidth={2} />
    <circle cx={88} cy={38} r={6} fill="#ffcf4d" stroke="#e8a72a" strokeWidth={2} />
    <path d="M75 18 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 Z" fill="#ffcf4d" />
    <path d="M30 60 Q32 34 75 32 Q118 34 120 60 Z" fill="#b5652f" transform="rotate(-12 30 60)" />
    <rect x={30} y={60} width={90} height={48} rx={6} fill="#c8763a" />
    <rect x={30} y={60} width={90} height={9} fill="#9a5426" />
    <rect x={44} y={60} width={8} height={48} fill="#ffcf4d" />
    <rect x={98} y={60} width={8} height={48} fill="#ffcf4d" />
    <rect x={66} y={70} width={18} height={20} rx={4} fill="#ffcf4d" />
    <circle cx={75} cy={79} r={3} fill="#9a5426" />
    <text x={120} y={36} fontSize={22} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#ff6fb1">?</text>
    <Sparkle x={22} y={30} s={1.1} color="#fff" />
  </>,
  'drag-drop': () => <>
    <Shadow />
    <rect x={24} y={22} width={40} height={30} rx={6} fill="#38bdf8" />
    <rect x={24} y={60} width={40} height={30} rx={6} fill="#5cd18b" />
    <rect x={84} y={60} width={44} height={34} rx={7} fill="none" stroke="#2c3554" strokeWidth={2.4} strokeDasharray="6 4" opacity={0.55} />
    <g transform="rotate(-8 104 40)">
      <rect x={84} y={18} width={44} height={32} rx={7} fill="#ff9f43" />
      <path d="M96 34 h20" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
    </g>
    <path d="M70 37 Q84 30 86 50" stroke="#2c3554" strokeWidth={2} fill="none" strokeDasharray="3 3" />
    <path d="M110 44 L110 66 L115 61 L119 70 L123 68 L119 59 L126 59 Z" fill="#fff" stroke="#2c3554" strokeWidth={2} strokeLinejoin="round" />
    <path d="M34 37 h20 M34 75 h20" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
    <Sparkle x={136} y={18} s={1} color="#fff" />
  </>,
  excel: () => <>
    <Shadow />
    <g transform="rotate(-6 70 60)">
      <rect x={40} y={14} width={64} height={84} rx={6} fill="#fff" />
      {[0, 1, 2, 3, 4].map(row => <path key={row} d={`M46 ${32 + row * 13} H98`} stroke="#d1e7d6" strokeWidth={1.4} />)}
      <path d="M64 24 V94 M82 24 V94" stroke="#d1e7d6" strokeWidth={1.4} />
      <rect x={46} y={22} width={52} height={8} rx={2} fill="#bfe6c8" />
    </g>
    <rect x={24} y={40} width={50} height={50} rx={9} fill="#1d7a43" />
    <path d="M38 54 L60 76 M60 54 L38 76" stroke="#fff" strokeWidth={7} strokeLinecap="round" />
    <path d="M112 50 Q132 60 112 74" stroke="#ff7a59" strokeWidth={5} fill="none" strokeLinecap="round" />
    <path d="M104 72 L114 76 L110 66 Z" fill="#ff7a59" />
    <Sparkle x={128} y={24} s={1.1} color="#fff" />
  </>,
  pdf: () => <>
    <Shadow />
    <g transform="rotate(-8 60 60)">
      <path d="M30 14 H70 L84 28 V100 H30 Z" fill="#fff" />
      <path d="M70 14 V28 H84 Z" fill="#ffd0d6" />
      <rect x={30} y={60} width={46} height={18} rx={3} fill="#e5484d" />
      <text x={53} y={73.5} textAnchor="middle" fontSize={12} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#fff">PDF</text>
      <path d="M38 36 h34 M38 44 h28 M38 52 h32 M38 86 h30" stroke="#e5e7eb" strokeWidth={3} strokeLinecap="round" />
    </g>
    <g transform="rotate(18 112 68)">
      <circle cx={102} cy={88} r={8} fill="none" stroke="#6c7cff" strokeWidth={4} />
      <circle cx={122} cy={88} r={8} fill="none" stroke="#6c7cff" strokeWidth={4} />
      <path d="M106 81 L120 44 M118 81 L104 44" stroke="#94a3b8" strokeWidth={4} strokeLinecap="round" />
      <circle cx={112} cy={66} r={2.2} fill="#475569" />
    </g>
    <Sparkle x={130} y={22} s={1} color="#fff" />
  </>,
  quiz: () => <>
    <Shadow />
    <rect x={30} y={12} width={78} height={92} rx={9} fill="#fff" />
    {['A', 'B', 'C', 'D'].map((letter, index) => <g key={letter}>
      <circle cx={46} cy={32 + index * 19} r={7} fill={index === 2 ? '#7b5ce6' : '#ede9fe'} />
      <text x={46} y={35.5 + index * 19} textAnchor="middle" fontSize={9} fontWeight={900} fontFamily="Nunito, sans-serif" fill={index === 2 ? '#fff' : '#7b5ce6'}>{letter}</text>
      <rect x={58} y={29 + index * 19} width={index === 2 ? 38 : 30} height={6} rx={3} fill={index === 2 ? '#c4b5fd' : '#e5e7eb'} />
    </g>)}
    <circle cx={114} cy={28} r={16} fill="#ffcf4d" />
    <text x={114} y={34} textAnchor="middle" fontSize={16} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#7a4a00">10</text>
    <path d="M100 82 l7 8 l16 -18" stroke="#22c55e" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Sparkle x={22} y={24} s={1} color="#fff" />
  </>,
  timetable: () => <>
    <Shadow />
    <rect x={26} y={20} width={84} height={84} rx={9} fill="#fff" />
    <rect x={26} y={20} width={84} height={20} rx={9} fill="#6c7cff" />
    <rect x={26} y={32} width={84} height={8} fill="#6c7cff" />
    <rect x={42} y={13} width={5} height={14} rx={2.5} fill="#2c3554" /><rect x={89} y={13} width={5} height={14} rx={2.5} fill="#2c3554" />
    {[0, 1, 2, 3].map(row => [0, 1, 2, 3].map(column => {
      const colors = ['#ffd166', '#5cd18b', '#ff9f43', '#38bdf8', '#f9a8d4', '#c4b5fd'];
      const filled = (row * 3 + column * 5) % 4 !== 0;
      return <rect key={`${row}-${column}`} x={33 + column * 19} y={46 + row * 14} width={15} height={10} rx={2.5} fill={filled ? colors[(row + column * 2) % colors.length] : '#eef2ff'} />;
    }))}
    <circle cx={116} cy={86} r={18} fill="#fff" stroke="#2c3554" strokeWidth={4} />
    <path d="M116 86 V75 M116 86 L124 90" stroke="#ff5d5d" strokeWidth={2.6} strokeLinecap="round" />
    <Sparkle x={130} y={30} s={1.1} color="#ffcf4d" />
  </>,
};

export function LibraryArt({ art }: { art: LibraryArtKey }) {
  return <svg className="lib-card-art-svg" viewBox="0 0 150 120" aria-hidden="true" focusable="false">{arts[art]()}</svg>;
}

export function EcosystemLogo({ size = 40 }: { size?: number }) {
  const nodes = [0, 1, 2, 3, 4, 5].map(index => {
    const angle = (index * Math.PI) / 3 - Math.PI / 2;
    return { x: 24 + 17 * Math.cos(angle), y: 24 + 17 * Math.sin(angle) };
  });
  const colors = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {nodes.map((node, index) => <line key={`l${index}`} x1={24} y1={24} x2={node.x} y2={node.y} stroke="#8fa3ff" strokeWidth={1.6} opacity={0.7} />)}
    {nodes.map((node, index) => { const next = nodes[(index + 1) % nodes.length]; return <line key={`r${index}`} x1={node.x} y1={node.y} x2={next.x} y2={next.y} stroke="#8fa3ff" strokeWidth={1.2} opacity={0.45} />; })}
    {nodes.map((node, index) => <circle key={`n${index}`} cx={node.x} cy={node.y} r={4} fill={colors[index]} />)}
    <circle cx={24} cy={24} r={11} fill="#5b4ce0" stroke="#fff" strokeWidth={1.6} />
    <text x={24} y={27.5} textAnchor="middle" fontSize={9.5} fontWeight={900} fontFamily="Nunito, sans-serif" fill="#fff">4.0</text>
  </svg>;
}
