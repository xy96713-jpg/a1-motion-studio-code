// Offline replacement for the former localhost:4311/production-asset probe.
// The isolated suite executes the actual transpiled GET against synthetic files.
// Next's automatic HTTP 405 behavior is not exercised here; absence of POST is checked.
import './test-historical-stills-isolated.mjs';
