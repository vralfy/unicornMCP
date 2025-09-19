export default {
  // preset: 'jest-preset-angular',
  //setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testRegex: '.*\\.test\\.ts$',
  // globalSetup: 'jest-preset-angular/global-setup',
  projects: [
    '<rootDir>'
  ],
  reporters: ['default', ['jest-junit', { outputDirectory: 'dist/reports', outputName: 'junit.xml' }]],
  coverageReporters: ['lcov', 'json'],
  coverageDirectory: '<rootDir>/dist/reports',
  //testResultsProcessor: 'jest-sonar-reporter',
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  moduleDirectories: [
    'node_modules',
    '<rootDir>'
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/'
  ],
  moduleNameMapper: {

  },
  transform: {
    '^.+\\.(ts|html|mjs)$': 'ts-jest',
    '^.+\\.(jsx)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!' + [
      '.*\\.mjs$',
    ].join('|') + ')'
  ]
}

