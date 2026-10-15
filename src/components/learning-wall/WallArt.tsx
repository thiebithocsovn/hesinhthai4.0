import React, { useId } from 'react';

// Flat, self-contained SVG illustrations for the Learning Wall dashboard.
// No external images: every drawing is vector, scales cleanly and works offline.

const INK = '#3a2a22';
const SKINS = ['#f6caa6', '#eab58d', '#f3d3b5', '#dca27a'];
const HAIRS = ['#4a2f22', '#2e1f18', '#6b3f26', '#3b2a20'];

type Point = { x: number; y: number; s?: number };

function Face({ smile = true }: { smile?: boolean }) {
  return <>
    <circle cx={-4} cy={1.5} r={1.4} fill={INK} />
    <circle cx={4} cy={1.5} r={1.4} fill={INK} />
    <circle cx={-6.8} cy={5} r={2} fill="#f2917f" opacity={0.45} />
    <circle cx={6.8} cy={5} r={2} fill="#f2917f" opacity={0.45} />
    {smile && <path d="M-3 5.5 Q0 8.5 3 5.5" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />}
  </>;
}

function Kid({ x, y, s = 1, skin = SKINS[0], hair = HAIRS[0], shirt = '#5aa9e6', girl = false }: Point & { skin?: string; hair?: string; shirt?: string; girl?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-13} y={12} width={26} height={26} rx={10} fill={shirt} />
    {girl && <path d="M-12.5 -2 Q-14.5 13 -10 17 L10 17 Q14.5 13 12.5 -2 Z" fill={hair} />}
    <rect x={-3} y={8} width={6} height={6} fill={skin} />
    <circle r={11} fill={skin} />
    <path d="M-11.6 0 Q-12.6 -13 0 -13 Q12.6 -13 11.6 0 Q9 -6.5 2 -6.8 Q-1 -3.5 -6 -5.2 Q-9 -4 -11.6 0 Z" fill={hair} />
    {girl && <path d="M7 -12 l5 -3 l0 6 Z M7 -12 l5 3" fill="#ef6f86" />}
    <Face />
  </g>;
}

function KidBack({ x, y, s = 1, skin = SKINS[0], hair = HAIRS[0], shirt = '#f08a5d', girl = false }: Point & { skin?: string; hair?: string; shirt?: string; girl?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-14} y={10} width={28} height={28} rx={11} fill={shirt} />
    <circle cx={-11} cy={1.5} r={3} fill={skin} />
    <circle cx={11} cy={1.5} r={3} fill={skin} />
    {girl && <path d="M-12 0 Q-13 14 -8 16 L8 16 Q13 14 12 0 Z" fill={hair} />}
    <circle r={11.5} fill={hair} />
    {girl && <circle cx={0} cy={-12} r={4.5} fill={hair} />}
  </g>;
}

function Teacher({ x, y, s = 1, skin = SKINS[1], hair = HAIRS[2], dress = '#e8607a' }: Point & { skin?: string; hair?: string; dress?: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cx={0} cy={-12} r={5} fill={hair} />
    <rect x={-8} y={50} width={5} height={13} fill={skin} />
    <rect x={3} y={50} width={5} height={13} fill={skin} />
    <rect x={-10} y={61} width={8} height={4} rx={2} fill={INK} />
    <rect x={2} y={61} width={8} height={4} rx={2} fill={INK} />
    <path d="M-12 13 Q-14 34 -17 52 L17 52 Q14 34 12 13 Q0 8 -12 13 Z" fill={dress} />
    <path d="M-10 17 L-30 5" stroke={dress} strokeWidth={6} strokeLinecap="round" />
    <circle cx={-31.5} cy={4} r={3.2} fill={skin} />
    <path d="M10 17 Q14 26 12 34" stroke={dress} strokeWidth={6} strokeLinecap="round" fill="none" />
    <circle cx={12} cy={35} r={3} fill={skin} />
    <path d="M-4 13 L0 19 L4 13" fill="#fff" />
    <rect x={-3} y={7} width={6} height={7} fill={skin} />
    <circle r={10.5} fill={skin} />
    <path d="M-11 1 Q-12 -12 0 -12 Q12 -12 11 1 Q8 -5 0 -5.5 Q-8 -5 -11 1 Z" fill={hair} />
    <Face />
  </g>;
}

function Chalkboard({ x, y, w, h, text = 'A B C' }: { x: number; y: number; w: number; h: number; text?: string }) {
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={3} fill="#a5683a" />
    <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={2} fill="#2f6a4f" />
    <text x={x + 12} y={y + h * 0.48} fontSize={h * 0.26} fontWeight={800} fontFamily="Nunito, 'Segoe UI', sans-serif" fill="#f5f2e6" opacity={0.9}>{text}</text>
    <path d={`M${x + 12} ${y + h * 0.7} q6 -5 12 0 t12 0 t12 0`} fill="none" stroke="#f5f2e6" strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
    <path d={`M${x + w - 26} ${y + h * 0.66} l8 -10 l8 10 z`} fill="none" stroke="#ffe08a" strokeWidth={1.6} strokeLinejoin="round" opacity={0.85} />
    <rect x={x + w * 0.2} y={y + h - 2} width={w * 0.6} height={4} rx={1} fill="#8b5530" />
    <rect x={x + w * 0.3} y={y + h - 4} width={7} height={2.5} rx={1} fill="#fff" />
  </g>;
}

function BookStack({ x, y, colors = ['#e85d5d', '#4f8fd6', '#f2b84b', '#5cb37a'], w = 48 }: { x: number; y: number; colors?: string[]; w?: number }) {
  return <g>{colors.map((color, index) => {
    const offset = index % 2 ? 3 : -2;
    const top = y - (index + 1) * 9;
    return <g key={color + index}>
      <rect x={x + offset} y={top} width={w} height={8.5} rx={1.6} fill={color} />
      <rect x={x + offset + w - 7} y={top + 1.5} width={5} height={5.5} rx={0.8} fill="#fff7e6" />
      <rect x={x + offset + 6} y={top + 3.2} width={14} height={2} rx={1} fill="#ffffff" opacity={0.55} />
    </g>;
  })}</g>;
}

function OpenBook({ x, y, s = 1, cover = '#d9534f' }: Point & { cover?: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 3 Q-21 -5 -43 1 L-43 27 Q-21 21 0 29 Q21 21 43 27 L43 1 Q21 -5 0 3 Z" fill={cover} />
    <path d="M0 0 Q-20 -8 -40 -2 L-40 23 Q-20 17 0 25 Z" fill="#fffaf0" />
    <path d="M0 0 Q20 -8 40 -2 L40 23 Q20 17 0 25 Z" fill="#fff4e0" />
    <path d="M-33 4 Q-20 0 -7 5 M-33 10 Q-20 6 -7 11 M-33 16 Q-20 12 -7 17 M7 5 Q20 0 33 4 M7 11 Q20 6 33 10" stroke="#c9b48f" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    <path d="M0 0 L0 25" stroke="#e2cfae" strokeWidth={1.2} />
  </g>;
}

function Globe({ x, y, r = 28 }: { x: number; y: number; r?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x={-r * 0.55} y={r + 13} width={r * 1.1} height={6} rx={3} fill="#8b5530" />
    <rect x={-3} y={r + 3} width={6} height={11} fill="#a5683a" />
    <path d={`M${-r - 6} ${r * 0.35} A ${r + 7} ${r + 7} 0 0 0 ${r * 0.55} ${-r - 2}`} fill="none" stroke="#c99a4a" strokeWidth={4} strokeLinecap="round" />
    <circle r={r} fill="#4fa3e0" />
    <path d={`M${-r * 0.7} ${-r * 0.35} q${r * 0.25} ${-r * 0.35} ${r * 0.55} ${-r * 0.2} q${r * 0.15} ${r * 0.3} ${-r * 0.05} ${r * 0.55} q${-r * 0.3} ${r * 0.15} ${-r * 0.5} ${-r * 0.35} Z`} fill="#6cc070" />
    <path d={`M${r * 0.1} ${-r * 0.1} q${r * 0.4} ${-r * 0.2} ${r * 0.6} ${r * 0.15} q${-r * 0.05} ${r * 0.45} ${-r * 0.35} ${r * 0.55} q${-r * 0.35} ${-r * 0.2} ${-r * 0.25} ${-r * 0.7} Z`} fill="#6cc070" />
    <path d={`M${-r * 0.55} ${r * 0.45} q${r * 0.2} ${-r * 0.1} ${r * 0.35} ${r * 0.1} q${-r * 0.1} ${r * 0.2} ${-r * 0.35} ${-r * 0.1} Z`} fill="#6cc070" />
    <circle cx={-r * 0.35} cy={-r * 0.45} r={r * 0.16} fill="#fff" opacity={0.35} />
  </g>;
}

function Planet({ x, y, r = 16, color = '#f29a4b', ring = '#ffd27a' }: { x: number; y: number; r?: number; color?: string; ring?: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d={`M${-r * 1.8} 0 A ${r * 1.8} ${r * 0.5} 0 0 1 ${r * 1.8} 0`} fill="none" stroke={ring} strokeWidth={3} transform="rotate(-15)" />
    <circle r={r} fill={color} />
    <path d={`M${-r * 0.7} ${-r * 0.35} q${r * 0.7} ${-r * 0.3} ${r * 1.4} 0`} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2.2} strokeLinecap="round" />
    <path d={`M${-r * 1.8} 0 A ${r * 1.8} ${r * 0.5} 0 0 0 ${r * 1.8} 0`} fill="none" stroke={ring} strokeWidth={3} transform="rotate(-15)" />
  </g>;
}

function Sparkle({ x, y, s = 1, color = '#fff6c8' }: Point & { color?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6 Z" fill={color} />;
}

function Stars({ seed, color = '#ffffff' }: { seed: number; color?: string }) {
  const points = Array.from({ length: 22 }, (_, index) => {
    const value = Math.sin(seed * 31 + index * 97.13) * 10000;
    const fraction = value - Math.floor(value);
    const value2 = Math.sin(seed * 17 + index * 41.7) * 10000;
    const fraction2 = value2 - Math.floor(value2);
    return { x: 6 + fraction * 308, y: 4 + fraction2 * 110, r: 0.6 + (index % 3) * 0.45 };
  });
  return <g fill={color}>{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.r} opacity={0.55 + (index % 4) * 0.1} />)}</g>;
}

function Apple({ x, y, s = 1 }: Point) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 -3 Q-9 -9 -11 1 Q-11 12 0 12 Q11 12 11 1 Q9 -9 0 -3 Z" fill="#e5484d" />
    <path d="M0 -3 Q1 -9 3 -11" stroke="#6b3f26" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    <path d="M2 -8 Q8 -12 10 -7 Q5 -4 2 -8 Z" fill="#5cb37a" />
    <circle cx={-5} cy={1} r={2.2} fill="#fff" opacity={0.35} />
  </g>;
}

function PencilCup({ x, y, s = 1 }: Point) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-3} y={-30} width={4} height={24} rx={1} fill="#f2b84b" transform="rotate(-10)" />
    <path d="M-3 -30 l2 -6 l2 6 z" fill="#f3d3b5" transform="rotate(-10)" />
    <rect x={2} y={-34} width={4} height={26} rx={1} fill="#4f8fd6" transform="rotate(8)" />
    <path d="M2 -34 l2 -6 l2 6 z" fill="#f3d3b5" transform="rotate(8)" />
    <rect x={-1} y={-27} width={4} height={20} rx={1} fill="#e85d5d" />
    <path d="M-12 -12 L12 -12 L10 10 L-10 10 Z" fill="#7cc7c2" />
    <rect x={-12} y={-14} width={24} height={4} rx={2} fill="#5fb3ad" />
  </g>;
}

function Plant({ x, y, s = 1 }: Point) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 -6 Q-14 -18 -10 -30 Q-2 -22 0 -6 Z" fill="#5cb37a" />
    <path d="M0 -6 Q12 -16 11 -30 Q2 -22 0 -6 Z" fill="#4aa266" />
    <path d="M0 -6 Q-2 -22 3 -36 Q6 -20 0 -6 Z" fill="#6cc27e" />
    <path d="M-9 -7 L9 -7 L7 10 L-7 10 Z" fill="#e0895a" />
  </g>;
}

function Block({ x, y, size = 22, color, letter }: { x: number; y: number; size?: number; color: string; letter: string }) {
  return <g>
    <rect x={x} y={y} width={size} height={size} rx={3} fill={color} />
    <rect x={x + 3} y={y + 3} width={size - 6} height={size - 6} rx={2} fill="#ffffff" opacity={0.28} />
    <text x={x + size / 2} y={y + size * 0.72} textAnchor="middle" fontSize={size * 0.62} fontWeight={900} fontFamily="Nunito, 'Segoe UI', sans-serif" fill="#ffffff">{letter}</text>
  </g>;
}

function Ruler({ x, y, s = 1 }: Point) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 L0 -46 L40 0 Z" fill="#f6c445" />
    <path d="M7 -7 L7 -25 L22 -7 Z" fill="#1f6474" />
    <path d="M3 -6 h4 M3 -14 h6 M3 -22 h4 M3 -30 h6 M3 -38 h4" stroke="#b4891f" strokeWidth={1.2} />
  </g>;
}

function Window({ x, y }: { x: number; y: number }) {
  return <g>
    <rect x={x} y={y} width={46} height={38} rx={3} fill="#ffffff" />
    <rect x={x + 3} y={y + 3} width={40} height={32} rx={2} fill="#dff3fb" />
    <circle cx={x + 32} cy={y + 13} r={5} fill="#ffd56b" />
    <path d={`M${x + 23} ${y + 3} V${y + 35} M${x + 3} ${y + 19} H${x + 43}`} stroke="#ffffff" strokeWidth={2.5} />
  </g>;
}

function Clock({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r={9} fill="#fff" stroke="#e0895a" strokeWidth={2.5} />
    <path d="M0 0 V-5 M0 0 L4 2" stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
  </g>;
}

type Scene = (seed: number) => React.ReactNode;

const scenes: { background: string; draw: Scene }[] = [
  { // Teacher at the chalkboard, pupils seen from behind.
    background: '#bfe2f1',
    draw: seed => <>
      <rect y={120} width={320} height={40} fill="#ecd2ad" />
      <rect y={117} width={320} height={4} fill="#d8b98f" />
      <Chalkboard x={64} y={22} w={122} h={64} />
      <Clock x={262} y={24} />
      <Teacher x={226} y={56} s={0.95} dress={seed % 2 ? '#e8607a' : '#5aa9e6'} />
      <Plant x={292} y={118} s={0.9} />
      <KidBack x={104} y={128} s={1.2} shirt="#f08a5d" hair={HAIRS[0]} />
      <KidBack x={178} y={131} s={1.2} shirt="#7bc47f" hair={HAIRS[1]} girl />
    </>,
  },
  { // Three smiling pupils at a long desk.
    background: '#f7c6a3',
    draw: () => <>
      <Chalkboard x={108} y={10} w={104} h={42} text="1+2=3" />
      <Kid x={98} y={80} s={1.05} shirt="#5aa9e6" skin={SKINS[0]} hair={HAIRS[0]} />
      <Kid x={160} y={78} s={1.05} shirt="#f2b84b" skin={SKINS[3]} hair={HAIRS[1]} girl />
      <Kid x={222} y={80} s={1.05} shirt="#7bc47f" skin={SKINS[2]} hair={HAIRS[2]} />
      <rect x={52} y={110} width={216} height={8} rx={3} fill="#c98a55" />
      <rect x={60} y={118} width={200} height={42} fill="#b4774a" />
      <rect x={84} y={103} width={22} height={7} rx={1.5} fill="#e85d5d" />
      <rect x={196} y={103} width={22} height={7} rx={1.5} fill="#4f8fd6" />
      <Apple x={262} y={100} s={0.75} />
    </>,
  },
  { // Books, chalkboard and an apple.
    background: '#f9d77f',
    draw: () => <>
      <rect y={122} width={320} height={38} fill="#e3a85b" />
      <Chalkboard x={118} y={14} w={108} h={56} />
      <BookStack x={46} y={122} />
      <OpenBook x={168} y={100} s={0.95} cover="#4f8fd6" />
      <Apple x={246} y={110} />
      <PencilCup x={276} y={112} s={0.9} />
    </>,
  },
  { // Open book with a pencil cup and plant.
    background: '#cfe8c7',
    draw: seed => <>
      <rect y={124} width={320} height={36} fill="#dcae74" />
      <Window x={42} y={18} />
      <OpenBook x={160} y={90} s={1.35} cover={seed % 2 ? '#e85d5d' : '#5aa9e6'} />
      <PencilCup x={246} y={112} />
      <Plant x={80} y={114} s={1.05} />
      <Sparkle x={214} y={40} s={1.2} color="#ffe27a" />
      <Sparkle x={112} y={46} s={0.8} color="#ffffff" />
    </>,
  },
  { // Globe and geometry on a teal background.
    background: '#1f6474',
    draw: seed => <>
      <Stars seed={seed} />
      <rect y={128} width={320} height={32} fill="#174c58" />
      <Ruler x={66} y={128} s={1.1} />
      <Globe x={162} y={70} r={30} />
      <BookStack x={214} y={128} colors={['#f2b84b', '#e85d5d', '#7cc7c2']} w={44} />
      <Sparkle x={252} y={34} s={1.2} color="#ffe27a" />
    </>,
  },
  { // Space: globe, planet and stars.
    background: '#262a66',
    draw: seed => <>
      <Stars seed={seed + 3} />
      <circle cx={74} cy={40} r={11} fill="#f4efe0" />
      <circle cx={70} cy={37} r={2.5} fill="#ddd5bf" />
      <circle cx={78} cy={44} r={1.8} fill="#ddd5bf" />
      <Planet x={252} y={42} r={15} />
      <Globe x={160} y={74} r={30} />
      <Sparkle x={112} y={84} s={1} color="#ffe27a" />
      <Sparkle x={214} y={96} s={0.8} color="#ffffff" />
    </>,
  },
  { // Letter blocks and toys in a night sky.
    background: '#1e2c55',
    draw: seed => <>
      <Stars seed={seed + 7} />
      <rect y={130} width={320} height={30} fill="#16213f" />
      <Planet x={82} y={42} r={14} color="#7cc7c2" ring="#f2b84b" />
      <Block x={122} y={108} color="#e85d5d" letter="A" />
      <Block x={146} y={108} color="#4f8fd6" letter="B" />
      <Block x={170} y={108} color="#5cb37a" letter="C" />
      <Block x={134} y={84} color="#f2b84b" letter="1" />
      <Block x={158} y={84} color="#a678de" letter="2" />
      <Block x={146} y={60} color="#f08a5d" letter="★" />
      <circle cx={232} cy={118} r={12} fill="#f2b84b" />
      <path d="M220 118 h24 M232 106 v24" stroke="#e85d5d" strokeWidth={3} />
      <Sparkle x={250} y={40} s={1.2} color="#ffe27a" />
    </>,
  },
  { // Two pupils reading together.
    background: '#bfe6f6',
    draw: () => <>
      <Window x={240} y={14} />
      <Kid x={124} y={72} s={1.15} shirt="#f2b84b" skin={SKINS[0]} hair={HAIRS[2]} girl />
      <Kid x={196} y={74} s={1.15} shirt="#5cb37a" skin={SKINS[1]} hair={HAIRS[1]} />
      <rect x={44} y={108} width={232} height={9} rx={3} fill="#e8b277" />
      <rect x={52} y={117} width={216} height={43} fill="#d29a5f" />
      <OpenBook x={160} y={96} s={0.85} cover="#e85d5d" />
      <Apple x={84} y={98} s={0.75} />
      <Sparkle x={60} y={34} s={1.1} color="#ffffff" />
    </>,
  },
  { // Computer room: block-based code on screen.
    background: '#d7e7fb',
    draw: () => <>
      <rect y={122} width={320} height={38} fill="#c99a6a" />
      <rect x={110} y={22} width={100} height={70} rx={7} fill="#2f3b52" />
      <rect x={116} y={28} width={88} height={54} rx={3} fill="#eef7ff" />
      <rect x={123} y={35} width={36} height={8} rx={2.5} fill="#f2b84b" />
      <rect x={130} y={46} width={46} height={8} rx={2.5} fill="#4f8fd6" />
      <rect x={130} y={57} width={30} height={8} rx={2.5} fill="#5cb37a" />
      <rect x={123} y={68} width={40} height={8} rx={2.5} fill="#e85d5d" />
      <Sparkle x={189} y={50} s={1.3} color="#a678de" />
      <rect x={152} y={92} width={16} height={13} fill="#2f3b52" />
      <rect x={134} y={103} width={52} height={6} rx={3} fill="#2f3b52" />
      <rect x={118} y={112} width={84} height={9} rx={2.5} fill="#ffffff" />
      <path d="M124 116.5 H196" stroke="#cdd8e6" strokeWidth={2} strokeDasharray="5 2" />
      <ellipse cx={218} cy={116} rx={6.5} ry={4.5} fill="#ffffff" />
      <Plant x={76} y={120} s={1.05} />
      <PencilCup x={256} y={112} s={0.9} />
      <Sparkle x={240} y={34} s={1} color="#ffffff" />
    </>,
  },
  { // Art corner: easel, painting and palette.
    background: '#fbe0e6',
    draw: () => <>
      <rect y={128} width={320} height={32} fill="#f3c2cc" />
      <path d="M148 40 L126 142 M172 40 L194 142 M160 40 L160 142" stroke="#a5683a" strokeWidth={4} strokeLinecap="round" />
      <rect x={116} y={20} width={88} height={66} rx={2.5} fill="#fffaf0" />
      <rect x={121} y={25} width={78} height={56} fill="#bfe2f1" />
      <circle cx={182} cy={39} r={7} fill="#ffd56b" />
      <path d="M121 81 L147 52 L164 71 L177 59 L199 81 Z" fill="#5cb37a" />
      <path d="M121 81 L136 66 L150 81 Z" fill="#4aa266" />
      <rect x={112} y={86} width={96} height={5} rx={1.5} fill="#8b5530" />
      <ellipse cx={242} cy={114} rx={27} ry={17} fill="#f3d3b5" />
      <circle cx={230} cy={107} r={4.2} fill="#e85d5d" />
      <circle cx={243} cy={103} r={4.2} fill="#4f8fd6" />
      <circle cx={256} cy={107} r={4.2} fill="#f2b84b" />
      <circle cx={258} cy={119} r={4.2} fill="#a678de" />
      <circle cx={232} cy={120} r={4.5} fill="#f3c2cc" />
      <PencilCup x={74} y={116} />
      <Sparkle x={68} y={40} s={1.1} color="#ffffff" />
    </>,
  },
  { // Science: flask, test tubes and an atom.
    background: '#d9f2e6',
    draw: () => <>
      <rect y={120} width={320} height={40} fill="#9fcdb7" />
      <path d="M118 72 L118 86 L102 116 Q100 120 104 120 L146 120 Q150 120 148 116 L132 86 L132 72 Z" fill="#ffffff" opacity={0.9} />
      <path d="M109 103 L141 103 L148 116 Q150 120 146 120 L104 120 Q100 120 102 116 Z" fill="#a678de" />
      <rect x={115} y={67} width={20} height={6} rx={2} fill="#7aa89a" />
      <circle cx={128} cy={58} r={3.5} fill="#ffffff" opacity={0.8} />
      <circle cx={120} cy={48} r={2.5} fill="#ffffff" opacity={0.7} />
      <circle cx={131} cy={40} r={2} fill="#ffffff" opacity={0.6} />
      {[['#e85d5d', 168], ['#f2b84b', 184], ['#4f8fd6', 200]].map(([color, x]) => <g key={x}>
        <rect x={Number(x)} y={74} width={10} height={44} rx={5} fill="#ffffff" opacity={0.9} />
        <rect x={Number(x)} y={98} width={10} height={20} rx={5} fill={String(color)} />
      </g>)}
      <rect x={160} y={94} width={58} height={6} rx={2} fill="#a5683a" />
      <rect x={162} y={112} width={54} height={6} rx={2} fill="#8b5530" />
      <g transform="translate(252 50)" fill="none" stroke="#2e8b85" strokeWidth={2.4}>
        <ellipse rx={22} ry={8} />
        <ellipse rx={22} ry={8} transform="rotate(60)" />
        <ellipse rx={22} ry={8} transform="rotate(-60)" />
      </g>
      <circle cx={252} cy={50} r={4.5} fill="#e85d5d" />
      <Sparkle x={70} y={46} s={1.1} color="#ffffff" />
    </>,
  },
  { // Music: xylophone and floating notes.
    background: '#ece3fb',
    draw: () => <>
      <rect y={126} width={320} height={34} fill="#d8c9f2" />
      <rect x={92} y={116} width={142} height={8} rx={3} fill="#8b5530" />
      {['#e85d5d', '#f08a5d', '#f2b84b', '#5cb37a', '#4f8fd6', '#a678de'].map((color, index) => {
        const height = 56 - index * 6;
        return <g key={color}>
          <rect x={98 + index * 22} y={116 - height} width={16} height={height} rx={3} fill={color} />
          <circle cx={106 + index * 22} cy={116 - height + 6} r={1.8} fill="#ffffff" opacity={0.8} />
        </g>;
      })}
      <path d="M216 96 L246 60 M226 104 L260 74" stroke="#a5683a" strokeWidth={3} strokeLinecap="round" />
      <circle cx={247} cy={58} r={5} fill="#e85d5d" />
      <circle cx={261} cy={72} r={5} fill="#4f8fd6" />
      {[[70, 50], [252, 30], [86, 84]].map(([x, y]) => <g key={`${x}-${y}`} fill="#5a3f8a">
        <ellipse cx={x} cy={y} rx={5.5} ry={4} transform={`rotate(-20 ${x} ${y})`} />
        <rect x={x + 3.6} y={y - 20} width={2.2} height={20} />
        <path d={`M${x + 5.8} ${y - 20} q8 4 7 12 q-2 -6 -7 -7 Z`} />
      </g>)}
      <Sparkle x={200} y={34} s={1} color="#ffffff" />
    </>,
  },
];

export const WALL_COVER_COUNT = scenes.length;

export function wallSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

// `variant` keeps covers distinct across a teacher's boards; `seed` keeps them stable.
export function WallCoverArt({ seed, variant }: { seed: string; variant?: number }) {
  const value = wallSeed(seed);
  const scene = scenes[(variant ?? value) % scenes.length];
  return <svg className="lw-cover-art" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width={320} height={160} fill={scene.background} />
    {scene.draw(value)}
  </svg>;
}

export function WallOwlMark() {
  return <svg className="lw-owl" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect x={6} y={40} width={36} height={6} rx={1.6} fill="#3f86c9" />
    <rect x={9} y={34.5} width={31} height={6} rx={1.6} fill="#e35d5b" />
    <rect x={8} y={29.5} width={30} height={5.5} rx={1.6} fill="#f2b84b" />
    <rect x={33} y={41.5} width={6} height={3} rx={0.6} fill="#fff7e6" />
    <path d="M14 9 L15.5 2.5 L20 8 Z M34 9 L32.5 2.5 L28 8 Z" fill="#2e8b85" />
    <ellipse cx={24} cy={18} rx={12} ry={12.5} fill="#2e8b85" />
    <ellipse cx={12.8} cy={20} rx={3} ry={6} fill="#23706b" />
    <ellipse cx={35.2} cy={20} rx={3} ry={6} fill="#23706b" />
    <ellipse cx={24} cy={23} rx={7} ry={6.5} fill="#f6e2bf" />
    <circle cx={19} cy={15} r={5} fill="#fff" />
    <circle cx={29} cy={15} r={5} fill="#fff" />
    <circle cx={19.6} cy={15.4} r={2.5} fill={INK} />
    <circle cx={28.4} cy={15.4} r={2.5} fill={INK} />
    <circle cx={20.4} cy={14.4} r={0.8} fill="#fff" />
    <circle cx={29.2} cy={14.4} r={0.8} fill="#fff" />
    <path d="M22.4 18.6 L25.6 18.6 L24 21.6 Z" fill="#f59a3b" />
    <path d="M19 29.5 v2 M21 29.5 v2 M27 29.5 v2 M29 29.5 v2" stroke="#f59a3b" strokeWidth={1.5} strokeLinecap="round" />
  </svg>;
}

function TeacherFigure({ viewBox, className }: { viewBox: string; className: string }) {
  const clip = useId().replace(/:/g, '');
  const skin = '#f6c8a5';
  const hair = '#6b3e26';
  return <svg className={className} viewBox={viewBox} aria-hidden="true" focusable="false">
    <defs><clipPath id={`lw-teacher-${clip}`}><circle cx={80} cy={84} r={72} /></clipPath></defs>
    <circle cx={80} cy={84} r={72} fill="#fbdcc8" />
    <g clipPath={`url(#lw-teacher-${clip})`}>
      <path d="M44 70 Q42 28 80 26 Q118 28 116 70 L119 112 Q100 122 80 118 Q60 122 41 112 Z" fill={hair} />
      <path d="M26 170 Q28 126 58 116 L80 124 L102 116 Q132 126 134 170 Z" fill="#f28c8c" />
      <path d="M66 117 L80 150 L94 117 Z" fill="#fff4ec" />
      <path d="M62 116 L80 131 L98 116 L91 112 L80 122 L69 112 Z" fill="#ffffff" />
      <rect x={72} y={98} width={16} height={20} rx={4} fill={skin} />
      <circle cx={55} cy={80} r={5} fill={skin} />
      <circle cx={105} cy={80} r={5} fill={skin} />
      <circle cx={55} cy={88} r={2} fill="#f2b84b" />
      <circle cx={105} cy={88} r={2} fill="#f2b84b" />
      <ellipse cx={80} cy={76} rx={25} ry={28} fill={skin} />
      <path d="M54 72 Q52 42 80 41 Q108 42 106 72 Q100 57 88 55 Q76 62 62 57 Q57 63 54 72 Z" fill={hair} />
      <path d="M64 71 Q69 68 74 71 M86 71 Q91 68 96 71" stroke={hair} strokeWidth={2} strokeLinecap="round" fill="none" />
      <ellipse cx={70} cy={79} rx={2.8} ry={3.4} fill={INK} />
      <ellipse cx={90} cy={79} rx={2.8} ry={3.4} fill={INK} />
      <circle cx={71} cy={78} r={0.9} fill="#fff" />
      <circle cx={91} cy={78} r={0.9} fill="#fff" />
      <circle cx={63} cy={89} r={5} fill="#f3998a" opacity={0.45} />
      <circle cx={97} cy={89} r={5} fill="#f3998a" opacity={0.45} />
      <path d="M72 91 Q80 99 88 91 Q80 95 72 91 Z" fill="#c4554f" stroke="#c4554f" strokeWidth={1.4} strokeLinejoin="round" />
    </g>
  </svg>;
}

export function WallTeacherArt() {
  return <TeacherFigure className="lw-teacher-art" viewBox="6 10 148 148" />;
}

export function WallTeacherAvatar() {
  return <TeacherFigure className="lw-teacher-avatar" viewBox="32 26 96 96" />;
}

export function WallHeadingArt() {
  return <svg className="lw-heading-art" viewBox="0 0 132 70" aria-hidden="true" focusable="false">
    <g transform="rotate(-7 34 38)">
      <path d="M14 58 L22 24 M54 58 L46 24 M34 64 L34 50" stroke="#a5683a" strokeWidth={3} strokeLinecap="round" />
      <rect x={6} y={14} width={56} height={38} rx={3} fill="#a5683a" />
      <rect x={10} y={18} width={48} height={30} rx={2} fill="#2f6a4f" />
      <path d="M16 28 q5 -4 10 0 t10 0 M16 37 h18 M40 37 l6 -7 l6 7" stroke="#f5f2e6" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.85} />
    </g>
    <g transform="rotate(9 98 34)">
      <rect x={78} y={8} width={38} height={50} rx={3} fill="#fffaf0" stroke="#e5d3b5" strokeWidth={1.5} />
      <path d="M84 22 h26 M84 30 h26 M84 38 h26 M84 46 h18" stroke="#9cc8e6" strokeWidth={1.4} />
      {[84, 92, 100, 108].map(x => <circle key={x} cx={x} cy={8} r={2.2} fill="none" stroke="#8a7a66" strokeWidth={1.4} />)}
    </g>
    <g transform="rotate(38 104 40)">
      <rect x={98} y={20} width={8} height={36} rx={1.5} fill="#f2b84b" />
      <rect x={98} y={20} width={8} height={5} fill="#e85d5d" />
      <path d="M98 56 L102 64 L106 56 Z" fill="#f3d3b5" />
      <path d="M101 61 L102 64 L103 61 Z" fill={INK} />
    </g>
    <Sparkle x={70} y={10} s={0.9} color="#f2b84b" />
    <Sparkle x={124} y={62} s={0.7} color="#f28c8c" />
  </svg>;
}
