// Side-effect import that pulls in the global `jest.Matchers` augmentation for
// `toMatchCanvasSnapshot` shipped by jest-canvas-mock-compare, making the matcher
// available to every test in the program (not only files importing the package).
// https://github.com/grafana/jest-canvas-mock-compare
import 'jest-canvas-mock-compare';
