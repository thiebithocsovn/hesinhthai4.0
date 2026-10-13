/** Decorative, code-native artwork for the student entrance. */
export function StudentExamPortalBackdrop() {
  return (
    <svg className="sep-backdrop" viewBox="0 0 1600 950" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="sep-hexagons" width="88" height="76" patternUnits="userSpaceOnUse">
          <path d="M22 2 44 15V41L22 54 0 41V15ZM66 40 88 53V79L66 92 44 79V53Z" fill="none" stroke="white" strokeWidth="1.6" />
        </pattern>
      </defs>
      <g fill="none" stroke="white" strokeWidth="2" opacity=".57">
        <circle cx="102" cy="80" r="66" />
        <path d="M56 50Q78 41 100 50V108Q78 99 56 108ZM108 50Q130 41 152 50V108Q130 99 108 108ZM67 61Q79 57 90 61M67 72Q79 68 90 72M67 83Q79 79 90 83M119 61Q131 57 141 61M119 72Q131 68 141 72M119 83Q131 79 141 83M20 197 71 117" />
        <circle cx="14" cy="235" r="4" />
        <ellipse cx="14" cy="235" rx="39" ry="14" transform="rotate(35 14 235)" />
        <ellipse cx="14" cy="235" rx="39" ry="14" transform="rotate(-35 14 235)" />
        <ellipse cx="14" cy="235" rx="14" ry="39" />
        <circle cx="35" cy="297" r="18" />
        <path d="M37 316 2 396M1551 679 1488 471M1540 676 1440 575M1555 745 1521 844M1555 745 1590 848" />
        <circle cx="1482" cy="450" r="21" />
        <circle cx="1427" cy="553" r="31" />
        <circle cx="1562" cy="712" r="40" />
        <ellipse cx="1562" cy="712" rx="21" ry="40" />
        <ellipse cx="1562" cy="712" rx="40" ry="16" />
        <path d="M1524 703H1600M1524 722H1600M1562 672V752" />
        <circle cx="1545" cy="873" r="83" />
        <path d="M1474 853 1545 820 1616 853 1545 887ZM1505 869V901Q1545 930 1585 901V869M1605 859V906M1600 906H1610M1523 924 1441 950" />
      </g>
      <path d="M0 0H160V40H0ZM0 340H140V520H0ZM1420 0H1600V180H1420ZM1360 680H1440V900H1360Z" fill="url(#sep-hexagons)" opacity=".35" />
      <g fill="none" stroke="white" strokeWidth="1.5" opacity=".35">
        <path d="M90 394 120 376 151 394V429L120 447 90 429ZM124 449 154 431 184 449V484L154 502 124 484ZM1392 790 1422 772 1452 790V825L1422 843 1392 825Z" />
      </g>
    </svg>
  );
}

export function StudentExamPortalCap() {
  return (
    <svg className="sep-cap" viewBox="0 0 110 88" aria-hidden="true" focusable="false">
      <path d="M7 22 57 4 108 22 57 52Z" fill="currentColor" />
      <path d="M26 39 57 58 91 39V65Q60 95 26 65Z" fill="currentColor" />
      <path d="M8 27 4 59 9 67 13 59Z" fill="currentColor" />
    </svg>
  );
}

export function StudentExamPortalIdea() {
  return (
    <svg className="sep-idea" viewBox="0 0 330 160" aria-hidden="true" focusable="false">
      <path d="M50 145C22 100 6 59 62 37 96 23 86 4 142 10 179 15 162 38 205 49 246 60 224 104 207 148Z" fill="#b2c8fc" opacity=".65" />
      <g fill="none" stroke="#477ddb" strokeWidth="1.2">
        <path d="M82 145C45 101 76 40 126 38M189 45C233 82 281 28 313 21" strokeDasharray="4 5" />
        <path d="M163 22V8M187 31 196 18M198 52 213 47M116 26 110 13M98 40 85 31M205 71H219" />
      </g>
      <path d="M125 109C125 90 104 80 104 60 104 7 181 7 181 60 181 81 161 92 161 109Z" fill="#1355bd" />
      <path d="M126 114H160M129 121H157M133 128H153" stroke="#1355bd" strokeWidth="6" strokeLinecap="round" />
      <path d="M135 108 130 70C109 55 129 50 132 73H151C154 50 173 55 153 70L148 108" fill="none" stroke="#a9c5fc" strokeWidth="1.2" />
      <path d="M126 118Q98 118 88 85 112 89 126 109M160 118Q188 118 198 85 174 89 160 109" fill="#1355bd" />
      <path d="M282 15 321 18 291 34 297 22ZM297 22 287 31" fill="#1355bd" />
      <g fill="none" stroke="#8eb1f5" strokeWidth="4">
        <circle cx="67" cy="49" r="11" /><path d="M67 31V27M67 71V67M49 49H45M89 49H85M54 36 51 33M80 62 83 65M80 36 83 33M54 62 51 65" />
        <circle cx="63" cy="87" r="7" /><path d="M63 75V72M63 102V99M51 87H48M78 87H75" />
      </g>
    </svg>
  );
}

export function StudentExamPortalBook() {
  return (
    <svg className="sep-book-art" viewBox="0 0 1240 760" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M6 42Q311 5 620 96 929 5 1234 42V750Q921 700 620 718 319 700 6 750Z" fill="#9ec3f5" />
      <path d="M43 26Q327 11 620 71 913 11 1197 26V673Q892 671 620 751 348 671 43 673Z" fill="#d4e2ff" />
      <path d="M65 2Q339 -25 620 39 901 -25 1175 2V663Q874 652 620 746 366 652 65 663Z" fill="white" />
    </svg>
  );
}
