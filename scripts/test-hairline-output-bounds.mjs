import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as hairline from '../apps/studio-next/src/lib/recipe-board/hairline-still.mjs';

test('PNG output has bounded bytes and exact dimensions', () => {
  assert.equal(typeof hairline.validateHairlinePng, 'function');
  assert.throws(() => hairline.validateHairlinePng(Buffer.alloc(32)), /PNG/i);
  const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.writeUInt32BE(13,8); png.write('IHDR',12); png.writeUInt32BE(401,16); png.writeUInt32BE(320,20);
  assert.throws(() => hairline.validateHairlinePng(png), /dimension/i);
  assert.throws(() => hairline.validateHairlinePng(Buffer.alloc(2 * 1024 * 1024 + 1)), /size/i);
});
