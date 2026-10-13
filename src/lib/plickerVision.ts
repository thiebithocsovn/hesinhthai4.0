export const PLICKER_CARD_LIMIT = 63;
export const PLICKER_GRID_SIZE = 7;

export type PlickerAnswer = 'A' | 'B' | 'C' | 'D';
export type MarkerGrid = boolean[][];

export interface MarkerPoint {
  x: number;
  y: number;
}

export interface MarkerImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DetectedPlickerCard {
  cardId: number;
  answer: PlickerAnswer;
  confidence: number;
  corners: [MarkerPoint, MarkerPoint, MarkerPoint, MarkerPoint];
  center: MarkerPoint;
}

interface DarkComponent {
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  topLeft: MarkerPoint;
  topRight: MarkerPoint;
  bottomRight: MarkerPoint;
  bottomLeft: MarkerPoint;
}

const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];
const DATA_CELLS: readonly [number, number][] = [
  [2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4],
];
const ORIENTATION_CELLS: readonly [number, number, boolean][] = [
  [1, 1, true], [1, 5, false], [5, 5, false], [5, 1, false],
  [1, 3, true], [3, 1, false], [3, 5, true], [5, 3, false],
];

function parity(value: number): boolean {
  let result = false;
  for (let bit = 0; bit < 6; bit += 1) result = result !== Boolean(value & (1 << bit));
  return result;
}

export function createPlickerMarker(cardId: number): MarkerGrid {
  if (!Number.isInteger(cardId) || cardId < 1 || cardId > PLICKER_CARD_LIMIT) {
    throw new RangeError('Mã thẻ học sinh phải nằm trong khoảng từ 1 đến 63.');
  }

  const marker = Array.from({ length: PLICKER_GRID_SIZE }, (_, row) =>
    Array.from({ length: PLICKER_GRID_SIZE }, (_, column) =>
      row === 0 || row === PLICKER_GRID_SIZE - 1 || column === 0 || column === PLICKER_GRID_SIZE - 1,
    ),
  );

  for (const [row, column, value] of ORIENTATION_CELLS) marker[row][column] = value;
  DATA_CELLS.forEach(([row, column], bit) => {
    marker[row][column] = Boolean(cardId & (1 << bit));
  });

  marker[4][2] = parity(cardId);
  marker[4][3] = Boolean((cardId * 13 + 7) & 1);
  marker[4][4] = parity(cardId) !== Boolean(cardId & 32);
  return marker;
}

export function rotateMarkerClockwise(marker: MarkerGrid): MarkerGrid {
  return Array.from({ length: marker.length }, (_, row) =>
    Array.from({ length: marker.length }, (_, column) => marker[marker.length - column - 1][row]),
  );
}

export function decodePlickerMarker(marker: MarkerGrid): {
  cardId: number;
  answer: PlickerAnswer;
  confidence: number;
} | null {
  if (marker.length !== PLICKER_GRID_SIZE || marker.some(row => row.length !== PLICKER_GRID_SIZE)) {
    return null;
  }

  let borderHits = 0;
  let borderTotal = 0;
  for (let row = 0; row < PLICKER_GRID_SIZE; row += 1) {
    for (let column = 0; column < PLICKER_GRID_SIZE; column += 1) {
      if (row === 0 || row === PLICKER_GRID_SIZE - 1 || column === 0 || column === PLICKER_GRID_SIZE - 1) {
        borderTotal += 1;
        if (marker[row][column]) borderHits += 1;
      }
    }
  }
  if (borderHits < borderTotal - 2) return null;

  let oriented = marker;
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const orientationHits = ORIENTATION_CELLS.filter(([row, column, expected]) =>
      oriented[row][column] === expected,
    ).length;

    if (orientationHits >= ORIENTATION_CELLS.length - 1) {
      let cardId = 0;
      DATA_CELLS.forEach(([row, column], bit) => {
        if (oriented[row][column]) cardId |= 1 << bit;
      });

      if (cardId >= 1 && cardId <= PLICKER_CARD_LIMIT) {
        const checksumHits = Number(oriented[4][2] === parity(cardId)) +
          Number(oriented[4][3] === Boolean((cardId * 13 + 7) & 1)) +
          Number(oriented[4][4] === (parity(cardId) !== Boolean(cardId & 32)));

        if (checksumHits === 3) {
          return {
            cardId,
            answer: ANSWERS[rotation],
            confidence: Number((0.55 * (borderHits / borderTotal) +
              0.30 * (orientationHits / ORIENTATION_CELLS.length) + 0.15).toFixed(3)),
          };
        }
      }
    }
    oriented = rotateMarkerClockwise(oriented);
  }
  return null;
}

function otsuThreshold(histogram: Uint32Array, pixels: number): number {
  let weightedSum = 0;
  for (let tone = 0; tone < 256; tone += 1) weightedSum += tone * histogram[tone];

  let backgroundCount = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 120;

  for (let tone = 0; tone < 256; tone += 1) {
    backgroundCount += histogram[tone];
    if (backgroundCount === 0) continue;
    const foregroundCount = pixels - backgroundCount;
    if (foregroundCount === 0) break;
    backgroundSum += tone * histogram[tone];
    const backgroundMean = backgroundSum / backgroundCount;
    const foregroundMean = (weightedSum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = tone;
    }
  }
  return Math.max(28, Math.min(210, threshold + 12));
}

function createDarkMask(image: MarkerImage): {
  grayscale: Uint8Array;
  dark: Uint8Array;
} {
  const pixelCount = image.width * image.height;
  const grayscale = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixelCount; index += 1) {
    const source = index * 4;
    const value = (image.data[source] * 77 + image.data[source + 1] * 150 + image.data[source + 2] * 29) >> 8;
    grayscale[index] = value;
    histogram[value] += 1;
  }

  const threshold = otsuThreshold(histogram, pixelCount);
  const dark = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) dark[index] = Number(grayscale[index] <= threshold);
  return { grayscale, dark };
}

function connectedDarkComponents(
  dark: Uint8Array,
  width: number,
  height: number,
  minimumSize: number,
): DarkComponent[] {
  const visited = new Uint8Array(dark.length);
  const queue = new Int32Array(dark.length);
  const components: DarkComponent[] = [];
  const maximumArea = width * height * 0.8;

  for (let index = 0; index < dark.length; index += 1) {
    if (!dark[index] || visited[index]) continue;

    let head = 0;
    let tail = 1;
    queue[0] = index;
    visited[index] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let minimumSum = Number.POSITIVE_INFINITY;
    let maximumSum = Number.NEGATIVE_INFINITY;
    let minimumDifference = Number.POSITIVE_INFINITY;
    let maximumDifference = Number.NEGATIVE_INFINITY;
    let topLeft = { x: 0, y: 0 };
    let topRight = { x: 0, y: 0 };
    let bottomRight = { x: 0, y: 0 };
    let bottomLeft = { x: 0, y: 0 };

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = (pixel / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const sum = x + y;
      const difference = x - y;
      if (sum < minimumSum) { minimumSum = sum; topLeft = { x, y }; }
      if (sum > maximumSum) { maximumSum = sum; bottomRight = { x, y }; }
      if (difference > maximumDifference) { maximumDifference = difference; topRight = { x, y }; }
      if (difference < minimumDifference) { minimumDifference = difference; bottomLeft = { x, y }; }

      if (x > 0 && dark[pixel - 1] && !visited[pixel - 1]) {
        visited[pixel - 1] = 1;
        queue[tail++] = pixel - 1;
      }
      if (x < width - 1 && dark[pixel + 1] && !visited[pixel + 1]) {
        visited[pixel + 1] = 1;
        queue[tail++] = pixel + 1;
      }
      if (y > 0 && dark[pixel - width] && !visited[pixel - width]) {
        visited[pixel - width] = 1;
        queue[tail++] = pixel - width;
      }
      if (y < height - 1 && dark[pixel + width] && !visited[pixel + width]) {
        visited[pixel + width] = 1;
        queue[tail++] = pixel + width;
      }
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const boundingArea = componentWidth * componentHeight;
    const ratio = componentWidth / componentHeight;
    const density = tail / boundingArea;
    if (
      componentWidth >= minimumSize && componentHeight >= minimumSize &&
      boundingArea < maximumArea && ratio >= 0.52 && ratio <= 1.9 &&
      density >= 0.18 && density <= 0.92
    ) {
      components.push({
        count: tail, minX, maxX, minY, maxY,
        topLeft, topRight, bottomRight, bottomLeft,
      });
    }
  }

  return components.sort((first, second) => second.count - first.count).slice(0, 96);
}

function sampleAt(
  grayscale: Uint8Array,
  width: number,
  height: number,
  point: MarkerPoint,
): number {
  const x = Math.max(0, Math.min(width - 1, Math.round(point.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(point.y)));
  return grayscale[y * width + x];
}

function interpolateCorner(
  component: DarkComponent,
  horizontal: number,
  vertical: number,
): MarkerPoint {
  const top = {
    x: component.topLeft.x + (component.topRight.x - component.topLeft.x) * horizontal,
    y: component.topLeft.y + (component.topRight.y - component.topLeft.y) * horizontal,
  };
  const bottom = {
    x: component.bottomLeft.x + (component.bottomRight.x - component.bottomLeft.x) * horizontal,
    y: component.bottomLeft.y + (component.bottomRight.y - component.bottomLeft.y) * horizontal,
  };
  return {
    x: top.x + (bottom.x - top.x) * vertical,
    y: top.y + (bottom.y - top.y) * vertical,
  };
}

function decodeComponent(
  component: DarkComponent,
  grayscale: Uint8Array,
  width: number,
  height: number,
): DetectedPlickerCard | null {
  const samples = Array.from({ length: PLICKER_GRID_SIZE }, (_, row) =>
    Array.from({ length: PLICKER_GRID_SIZE }, (_, column) => {
      let total = 0;
      for (const offsetY of [-0.12, 0, 0.12]) {
        for (const offsetX of [-0.12, 0, 0.12]) {
          const point = interpolateCorner(
            component,
            (column + 0.5 + offsetX) / PLICKER_GRID_SIZE,
            (row + 0.5 + offsetY) / PLICKER_GRID_SIZE,
          );
          total += sampleAt(grayscale, width, height, point);
        }
      }
      return total / 9;
    }),
  );

  const ordered = samples.flat().sort((first, second) => first - second);
  const darkTone = ordered[Math.floor(ordered.length * 0.25)];
  const lightTone = ordered[Math.floor(ordered.length * 0.8)];
  if (lightTone - darkTone < 28) return null;
  const localThreshold = (darkTone + lightTone) / 2;
  const grid = samples.map(row => row.map(value => value < localThreshold));
  const decoded = decodePlickerMarker(grid);
  if (!decoded) return null;

  const corners: [MarkerPoint, MarkerPoint, MarkerPoint, MarkerPoint] = [
    component.topLeft, component.topRight, component.bottomRight, component.bottomLeft,
  ];
  const contrastConfidence = Math.min(1, (lightTone - darkTone) / 125);
  return {
    ...decoded,
    confidence: Number((decoded.confidence * 0.8 + contrastConfidence * 0.2).toFixed(3)),
    corners,
    center: {
      x: corners.reduce((total, corner) => total + corner.x, 0) / 4,
      y: corners.reduce((total, corner) => total + corner.y, 0) / 4,
    },
  };
}

export function detectPlickerCards(
  image: MarkerImage,
  options: { minimumSize?: number; minimumConfidence?: number } = {},
): DetectedPlickerCard[] {
  if (image.width < PLICKER_GRID_SIZE || image.height < PLICKER_GRID_SIZE) return [];
  const { grayscale, dark } = createDarkMask(image);
  const minimumSize = options.minimumSize || Math.max(24, Math.floor(Math.min(image.width, image.height) / 24));
  const components = connectedDarkComponents(dark, image.width, image.height, minimumSize);
  const bestByCard = new Map<number, DetectedPlickerCard>();

  for (const component of components) {
    const detection = decodeComponent(component, grayscale, image.width, image.height);
    if (!detection || detection.confidence < (options.minimumConfidence || 0.72)) continue;
    const previous = bestByCard.get(detection.cardId);
    if (!previous || detection.confidence > previous.confidence) bestByCard.set(detection.cardId, detection);
  }

  return [...bestByCard.values()].sort((first, second) => first.cardId - second.cardId);
}

interface DetectionTrack {
  candidate: PlickerAnswer;
  frames: number;
  lastSeen: number;
  committed?: PlickerAnswer;
}

export class PlickerTemporalConsensus {
  private readonly tracks = new Map<number, DetectionTrack>();

  constructor(
    private readonly minimumFrames = 2,
    private readonly maximumGapMs = 850,
  ) {}

  reset(): void {
    this.tracks.clear();
  }

  update(detections: DetectedPlickerCard[], timestamp = Date.now()): DetectedPlickerCard[] {
    for (const [cardId, track] of this.tracks) {
      if (timestamp - track.lastSeen > this.maximumGapMs * 3) this.tracks.delete(cardId);
    }

    const stable: DetectedPlickerCard[] = [];
    for (const detection of detections) {
      let track = this.tracks.get(detection.cardId);
      if (!track || timestamp - track.lastSeen > this.maximumGapMs || track.candidate !== detection.answer) {
        track = {
          candidate: detection.answer,
          frames: 1,
          lastSeen: timestamp,
          committed: track?.committed,
        };
        this.tracks.set(detection.cardId, track);
      } else {
        track.frames += 1;
        track.lastSeen = timestamp;
      }

      if (track.frames >= this.minimumFrames && track.committed !== detection.answer) {
        track.committed = detection.answer;
        stable.push(detection);
      }
    }
    return stable;
  }
}
