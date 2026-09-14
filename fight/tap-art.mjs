// Original brush lettering: local vector digits stay consistent on every device.
const strokes = {
  '0': ['M33 9 C12 3 3 31 8 49 C12 66 30 62 37 41 C44 23 44 12 33 9 Z'],
  '1': ['M10 23 Q22 18 31 8 L17 60', 'M6 60 L31 57'],
  '2': ['M7 21 C17 0 48 3 39 24 C34 36 14 40 6 60 Q25 53 39 55'],
  '3': ['M10 12 Q30 4 41 10 L22 31 C48 24 40 52 24 59 Q12 64 5 55'],
  '4': ['M25 8 L5 39 Q19 41 41 36', 'M38 7 L24 61'],
  '5': ['M43 9 L17 11 L9 34 C33 22 45 34 33 51 Q19 68 5 55'],
  '6': ['M38 8 C18 5 3 31 8 51 C13 71 39 54 37 39 C35 26 17 31 9 42'],
  '7': ['M6 13 Q27 7 43 10 Q26 31 15 60', 'M15 34 L35 30'],
  '8': ['M25 32 C2 25 15 3 34 8 C53 16 32 34 25 32 C5 30 -1 58 18 61 C40 64 47 42 25 32 Z'],
  '9': ['M36 30 C12 46 3 23 20 11 C38 -2 46 18 36 40 Q28 59 11 61'],
  ',': ['M13 55 L7 68']
};

export function brushNumber(value, underline = false) {
  const characters = String(value).split('');
  const width = characters.reduce((sum, digit) => sum + (digit === ',' ? 19 : 46), 0);
  let x = 9;
  const glyphs = characters.map(digit => {
    const paths = (strokes[digit] || []).map(d => `<path d="${d}"/>`).join('');
    const group = `<g transform="translate(${x} 5)">${paths}</g>`;
    x += digit === ',' ? 19 : 46;
    return group;
  }).join('');
  const swash = underline ? `<path fill="currentColor" stroke="none" d="M4 83 Q${width * .5} 70 ${width + 12} 73 Q${width * .62} 78 8 88 Z"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width + 20} ${underline ? 94 : 80}" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(7 0) skewX(-8)">${glyphs}${swash}</g></svg>`;
}
