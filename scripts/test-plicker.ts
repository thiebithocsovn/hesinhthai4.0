import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPlickerMarker,
  decodePlickerMarker,
  detectPlickerCards,
  PLICKER_CARD_LIMIT,
  PlickerTemporalConsensus,
  rotateMarkerClockwise,
  type DetectedPlickerCard,
  type MarkerGrid,
  type MarkerImage,
} from '../src/lib/plickerVision';
import { assignPlickerCardIds, removePlickerStudent, renamePlickerStudent } from '../src/lib/plickerStudents';

let checks = 0;
const expectedByClockwiseRotation = ['A', 'D', 'C', 'B'] as const;

for (let cardId = 1; cardId <= PLICKER_CARD_LIMIT; cardId += 1) {
  let marker = createPlickerMarker(cardId);
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const decoded = decodePlickerMarker(marker);
    assert.equal(decoded?.cardId, cardId);
    assert.equal(decoded?.answer, expectedByClockwiseRotation[rotation]);
    marker = rotateMarkerClockwise(marker);
    checks += 2;
  }
}

assert.throws(() => createPlickerMarker(0), RangeError);
assert.throws(() => createPlickerMarker(64), RangeError);
checks += 2;

function blankImage(width: number, height: number): MarkerImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 243;
    data[offset + 1] = 241;
    data[offset + 2] = 239;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function paintMarker(image: MarkerImage, marker: MarkerGrid, left: number, top: number, cellSize: number): void {
  marker.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      for (let y = 0; y < cellSize; y += 1) {
        for (let x = 0; x < cellSize; x += 1) {
          const pixel = ((top + rowIndex * cellSize + y) * image.width + left + columnIndex * cellSize + x) * 4;
          const deterministicNoise = ((x * 11 + y * 7 + rowIndex * 3) % 9) - 4;
          const value = (dark ? 26 : 235) + deterministicNoise;
          image.data[pixel] = value;
          image.data[pixel + 1] = value;
          image.data[pixel + 2] = value;
        }
      }
    });
  });
}

function paintTiltedMarker(
  image: MarkerImage,
  marker: MarkerGrid,
  centerX: number,
  centerY: number,
  cellSize: number,
  degrees: number,
): void {
  const radius = marker.length * cellSize / 2;
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const reach = Math.ceil(radius * 1.5);

  for (let y = centerY - reach; y <= centerY + reach; y += 1) {
    for (let x = centerX - reach; x <= centerX + reach; x += 1) {
      const shiftedX = x - centerX;
      const shiftedY = y - centerY;
      const originalX = shiftedX * cosine + shiftedY * sine + radius;
      const originalY = -shiftedX * sine + shiftedY * cosine + radius;
      if (originalX < 0 || originalY < 0 || originalX >= radius * 2 || originalY >= radius * 2) continue;
      const column = Math.floor(originalX / cellSize);
      const row = Math.floor(originalY / cellSize);
      const pixel = (y * image.width + x) * 4;
      const value = marker[row][column] ? 24 : 238;
      image.data[pixel] = value;
      image.data[pixel + 1] = value;
      image.data[pixel + 2] = value;
    }
  }
}

const classroom = blankImage(540, 320);
paintMarker(classroom, createPlickerMarker(1), 28, 35, 13);
paintMarker(classroom, rotateMarkerClockwise(createPlickerMarker(17)), 174, 45, 12);
paintMarker(classroom, rotateMarkerClockwise(rotateMarkerClockwise(createPlickerMarker(42))), 305, 112, 15);
paintMarker(
  classroom,
  rotateMarkerClockwise(rotateMarkerClockwise(rotateMarkerClockwise(createPlickerMarker(63)))),
  410,
  24,
  11,
);

const detections = detectPlickerCards(classroom);
assert.deepEqual(detections.map(item => item.cardId), [1, 17, 42, 63]);
assert.deepEqual(detections.map(item => item.answer), ['A', 'D', 'C', 'B']);
assert.ok(detections.every(item => item.confidence >= 0.8));
checks += 3;

const tiltedFrame = blankImage(380, 250);
paintTiltedMarker(tiltedFrame, createPlickerMarker(8), 110, 122, 16, 13);
paintTiltedMarker(tiltedFrame, rotateMarkerClockwise(createPlickerMarker(29)), 272, 116, 14, -11);
const tiltedDetections = detectPlickerCards(tiltedFrame);
assert.deepEqual(tiltedDetections.map(item => item.cardId), [8, 29]);
assert.deepEqual(tiltedDetections.map(item => item.answer), ['A', 'D']);
checks += 2;

const consensus = new PlickerTemporalConsensus(2, 700);
assert.equal(consensus.update([detections[0]], 1_000).length, 0);
assert.equal(consensus.update([detections[0]], 1_120).length, 1);
assert.equal(consensus.update([detections[0]], 1_260).length, 0);
const changed: DetectedPlickerCard = { ...detections[0], answer: 'C' };
assert.equal(consensus.update([changed], 1_380).length, 0);
assert.equal(consensus.update([changed], 1_510)[0]?.answer, 'C');
checks += 5;

const originalRoster = assignPlickerCardIds([
  { id: 'student-a', classId: 'class-8a', name: 'An' },
  { id: 'student-b', classId: 'class-8a', name: 'Bình' },
  { id: 'student-c', classId: 'class-8a', name: 'Châu' },
  { id: 'student-d', classId: 'class-8b', name: 'Dung' },
]);
assert.deepEqual(originalRoster.map(student => student.cardId), [1, 2, 3, 1]);

const renamedRoster = renamePlickerStudent(originalRoster, 'student-b', '  Bình Minh  ');
assert.equal(renamedRoster.find(student => student.id === 'student-b')?.name, 'Bình Minh');
assert.equal(renamedRoster.find(student => student.id === 'student-b')?.cardId, 2);
assert.throws(() => renamePlickerStudent(originalRoster, 'student-b', '   '), /không được để trống/);

const remainingRoster = removePlickerStudent(renamedRoster, 'student-b');
assert.deepEqual(remainingRoster.filter(student => student.classId === 'class-8a').map(student => student.cardId), [1, 3]);

const replenishedRoster = assignPlickerCardIds([
  ...remainingRoster,
  { id: 'student-e', classId: 'class-8a', name: 'Em' },
]);
assert.equal(replenishedRoster.find(student => student.id === 'student-e')?.cardId, 2);
assert.equal(replenishedRoster.find(student => student.id === 'student-c')?.cardId, 3);

const duplicateCards = assignPlickerCardIds([
  { id: 'duplicate-a', classId: 'class-9a', name: 'A', cardId: 4 },
  { id: 'duplicate-b', classId: 'class-9a', name: 'B', cardId: 4 },
]);
assert.deepEqual(duplicateCards.map(student => student.cardId), [4, 1]);

const classroomSource = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
assert.match(classroomSource, /Sửa học sinh/);
assert.match(classroomSource, /Xóa học sinh/);
assert.match(classroomSource, /onUpdateStudent/);
assert.match(classroomSource, /onDeleteStudent/);
checks += 12;

console.info(`Plicker browser vision: ${checks} checks passed.`);
