const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const moduleUnderTest = { exports: {} }
const source = fs.readFileSync('lib/flight-tracking.ts', 'utf8')
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleUnderTest.exports, module: moduleUnderTest, require })
const { findOpenSkyFlightState, isWithinFlightTrackingWindow, normalizeFlightId } = moduleUnderTest.exports

const state = ({ icao24, callsign, contact, latitude = 10, longitude = 20 }) => [
  icao24, callsign, 'Nigeria', null, contact, longitude, latitude, 10_000, false, 220, 90, 0, null, 10_000, null, false, 0,
]

test('flight identifiers normalize spacing and case for exact ADS-B matching', () => {
  assert.equal(normalizeFlightId(' baw 123 '), 'BAW123')
  assert.equal(findOpenSkyFlightState([state({ icao24: 'abc123', callsign: 'BAW123', contact: 10 })], {
    icao24: null,
    callsign: ' baw 123 ',
  })[0], 'abc123')
})

test('callsign matching is exact and never accepts a substring match', () => {
  const match = state({ icao24: 'abc123', callsign: 'BAW123', contact: 10 })
  const falseMatch = state({ icao24: 'def456', callsign: 'BAW1234', contact: 20 })
  assert.equal(findOpenSkyFlightState([falseMatch, match], { icao24: null, callsign: 'BAW123' }), match)
  assert.equal(findOpenSkyFlightState([falseMatch], { icao24: null, callsign: 'BAW123' }), null)
})

test('a configured aircraft address takes precedence over a matching callsign', () => {
  const correctAddress = state({ icao24: 'abc123', callsign: 'OTHER1', contact: 10 })
  const sameCallsignWrongAircraft = state({ icao24: 'def456', callsign: 'BAW123', contact: 20 })
  assert.equal(findOpenSkyFlightState([sameCallsignWrongAircraft, correctAddress], {
    icao24: 'abc123',
    callsign: 'BAW123',
  }), correctAddress)
})

test('flight watch window excludes distant schedules and un-timed inactive itineraries', () => {
  const now = Date.parse('2026-09-27T10:00:00Z')
  assert.equal(isWithinFlightTrackingWindow('2026-09-27T09:00:00Z', '2026-09-27T12:00:00Z', 'scheduled', now), true)
  assert.equal(isWithinFlightTrackingWindow('2026-09-28T10:00:00Z', '2026-09-28T12:00:00Z', 'scheduled', now), false)
  assert.equal(isWithinFlightTrackingWindow(null, null, 'scheduled', now), false)
  assert.equal(isWithinFlightTrackingWindow(null, null, 'active', now), true)
})
