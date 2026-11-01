'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { classify, buildArguments } = require('../../js/launcher.js');

function bytes(...parts) {
	return Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
}

test('classify accepts IWAD and PWAD headers', () => {
	assert.deepStrictEqual(classify('DOOM2.WAD', bytes('IWAD', [0, 0, 0, 0])), { kind: 'iwad' });
	assert.deepStrictEqual(classify('my.wad', bytes('PWAD', [1, 2, 3, 4])), { kind: 'pwad' });
});

test('classify rejects a .wad without a WAD header', () => {
	const verdict = classify('fake.wad', bytes('PK\x03\x04junk'));
	assert.match(verdict.error, /not a WAD file/);
});

test('classify accepts text DeHackEd patches and rejects binaries', () => {
	const patch = bytes('Patch File for DeHackEd v3.0\n');
	assert.deepStrictEqual(classify('mod.deh', patch), { kind: 'deh' });
	assert.deepStrictEqual(classify('mod.bex', patch), { kind: 'deh' });
	assert.match(classify('mod.deh', bytes('MZ', [0, 1, 2])).error, /binary data/);
});

test('classify rejects unsupported extensions', () => {
	const verdict = classify('notes.txt', bytes('hello'));
	assert.match(verdict.error, /unsupported type/);
});

test('buildArguments puts the IWAD first, then PWADs in order, then DEHs', () => {
	assert.deepStrictEqual(buildArguments('freedoom2.wad', [], []), ['-iwad', 'freedoom2.wad']);
	assert.deepStrictEqual(
		buildArguments('doom2.wad', ['b.wad', 'a.wad'], ['x.deh', 'y.bex']),
		['-iwad', 'doom2.wad', '-file', 'b.wad', 'a.wad', '-deh', 'x.deh', 'y.bex'],
	);
	assert.deepStrictEqual(
		buildArguments('doom.wad', [], ['only.deh']),
		['-iwad', 'doom.wad', '-deh', 'only.deh'],
	);
});