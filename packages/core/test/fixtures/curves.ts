export const expectedThreePointCurve = [
  { frequencyHz: 20, db: 81.2 },
  { frequencyHz: 1000, db: 90 },
  { frequencyHz: 20000, db: 82.1 },
]

export const delimiterFixtures = [
  {
    name: 'whitespace',
    text: 'Frequency SPL\n20 81.2\n1000 90.0\n20000 82.1',
  },
  {
    name: 'tab',
    text: 'Frequency\tSPL\n20\t81.2\n1000\t90.0\n20000\t82.1',
  },
  {
    name: 'comma',
    text: 'Frequency,SPL\n20,81.2\n1000,90.0\n20000,82.1',
  },
  {
    name: 'semicolon',
    text: 'Frequency;SPL\n20; 81.2\n1000; 90.0\n20000; 82.1',
  },
] as const

export const commentFixture = [
  '\ufeff# exported measurement',
  '  // frequency and magnitude follow',
  '; generated fixture',
  '; ',
  '',
  'Frequency,SPL',
  '20,81.2',
  '1000,90.0',
  '20000,82.1',
].join('\r\n')
