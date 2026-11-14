import test from 'node:test';
import assert from 'node:assert/strict';
import { Howler } from 'howler';
import { BrowserGameTestMode } from '../src/debug/BrowserGameTestMode';
import { AudioOutputGate } from '../src/audio/AudioOutputGate';
import { HowlerAudioBackend } from '../src/audio/internal/HowlerAudioBackend';

test('explicit silent test mode suppresses output before startup and survives player/platform unmute', t => {
  const calls: boolean[] = [];
  t.mock.method(Howler, 'mute', (muted: boolean) => { calls.push(muted); return Howler; });
  assert.equal(BrowserGameTestMode.configure(''), false);
  assert.equal(calls.length, 0, 'Normal startup must not alter output');
  assert.equal(BrowserGameTestMode.configure('?silentTest=1'), true);
  assert.equal(AudioOutputGate.resolveMuted(false), true);
  const audio = new HowlerAudioBackend();
  audio.setMuted(false); audio.setMuted(true); audio.setMuted(false);
  assert.deepEqual(calls, [true, true, true, true]);
  assert.equal(BrowserGameTestMode.configure('?silentTest=0'), true, 'The output gate is deliberately page-lifetime');
  audio.dispose();
});
