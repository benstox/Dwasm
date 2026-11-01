'use strict';

/* Dwasm launcher: file validation, launch-argument assembly and the
 * Emscripten Module contract that src/WASM/wasm_io.c calls back into.
 * The pure helpers are exported for the tests; the DOM half only runs in a
 * browser. */

var DwasmLauncher = (function () {
	/* 'iwad' | 'pwad' | 'deh' for a usable file, {error} for anything else.
	 * Classification happens here, before a byte reaches MemFS. */
	function classify(name, bytes) {
		var dot = name.lastIndexOf('.');
		var ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';

		if (ext === '.wad') {
			var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
			if (magic === 'IWAD') return { kind: 'iwad' };
			if (magic === 'PWAD') return { kind: 'pwad' };
			return { error: 'is not a WAD file (missing IWAD/PWAD header)' };
		}

		if (ext === '.deh' || ext === '.bex') {
			// DeHackEd patches are text; a NUL byte means this is something else.
			for (var i = 0; i < bytes.length && i < 512; i++) {
				if (bytes[i] === 0) return { error: 'is not a DeHackEd patch (contains binary data)' };
			}
			return { kind: 'deh' };
		}

		return { error: 'has an unsupported type (expected .wad, .deh or .bex)' };
	}

	/* The engine expects the IWAD first, then PWADs in selection order,
	 * then DEH/BEX patches. */
	function buildArguments(iwad, pwads, dehs) {
		var args = ['-iwad', iwad];
		if (pwads.length > 0) args = args.concat(['-file'], pwads);
		if (dehs.length > 0) args = args.concat(['-deh'], dehs);
		return args;
	}

	return { classify: classify, buildArguments: buildArguments };
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = DwasmLauncher;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
	(function () {
		var launch = OCP.InitialState.loadState('dwasm', 'launch');
		// index.wasm and index.data are located relative to index.js.
		var engineBase = launch.script.replace(/[^/]*$/, '');

		var setupElement = document.getElementById('dwasm-setup');
		var loadElement = document.getElementById('dwasm-load');
		var gameSelect = document.getElementById('dwasm-game');
		var fileInput = document.getElementById('dwasm-files');
		var pickedList = document.getElementById('dwasm-picked');
		var errorBox = document.getElementById('dwasm-error');
		var startButton = document.getElementById('dwasm-start');
		var exitBox = document.getElementById('dwasm-exit');
		var statusElement = document.getElementById('status');
		var progressElement = document.getElementById('progress');
		var spinnerElement = document.getElementById('spinner');
		var canvasElement = document.getElementById('canvas');
		var outputElement = document.getElementById('output');

		var selection = []; // validated picks: {name, kind, data}
		var pending = []; // written into MemFS from onRuntimeInitialized
		var shownIwads = []; // IWADs already offered in the game list

		var Module = {
			_canLockPointer: true,
			locateFile: function (path) {
				return engineBase + path;
			},
			canvas: (function () {
				canvasElement.addEventListener('webglcontextlost', function (e) {
					alert('WebGL context lost. You will need to reload the page.');
					e.preventDefault();
				}, false);
				return canvasElement;
			})(),
			print: (function () {
				outputElement.value = ''; // clear browser cache
				return function () {
					var text = Array.prototype.join.call(arguments, ' ');
					console.log(text);
					outputElement.value += text + '\n';
					outputElement.scrollTop = outputElement.scrollHeight;
				};
			})(),
			printErr: function () {
				var text = Array.prototype.join.call(arguments, ' ');
				console.error(text);
				outputElement.value += text + '\n';
				outputElement.scrollTop = outputElement.scrollHeight;
			},
			setStatus: function (text) {
				Module.setStatus.last = Module.setStatus.last || { time: 0, text: '' };
				if (text === Module.setStatus.last.text) return;
				var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
				var now = Date.now();
				if (m && now - Module.setStatus.last.time < 30) return;
				Module.setStatus.last.time = now;
				Module.setStatus.last.text = text;
				if (m) {
					text = m[1];
					progressElement.value = parseInt(m[2], 10) * 100;
					progressElement.max = parseInt(m[4], 10) * 100;
					progressElement.hidden = false;
					spinnerElement.hidden = false;
				} else {
					progressElement.hidden = true;
					spinnerElement.hidden = true;
				}
				statusElement.textContent = text;
			},
			hideConsole: function () {
				outputElement.style.display = 'none';
				setupElement.hidden = true;
				canvasElement.style.display = 'block';
				canvasElement.focus();
			},
			showConsole: function () {
				canvasElement.style.display = 'none';
				outputElement.style.display = 'block';
				outputElement.scrollTop = outputElement.scrollHeight;
				outputElement.focus();
			},
			winResized: function () {
				console.info('Detected window resize: ' + canvasElement.width + 'x' + canvasElement.height);
			},
			captureMouse: function () {
				if (Module._canLockPointer && !Module._attemptPointerLock()) {
					Module._canLockPointer = false;
					console.info('Delayed pointer lock requested.');
					document.addEventListener('keydown', Module._lockPointerOnKey);
				}
			},
			_attemptPointerLock: function () {
				if (document.pointerLockElement === null) canvasElement.requestPointerLock();
				return document.pointerLockElement !== null;
			},
			_lockPointerOnKey: function (event) {
				if (event.key === 'Escape' || Module._attemptPointerLock()) {
					document.removeEventListener('keydown', Module._lockPointerOnKey);
					Module._canLockPointer = true;
				}
			},
			totalDependencies: 0,
			monitorRunDependencies: function (left) {
				Module.totalDependencies = Math.max(Module.totalDependencies, left);
				Module.setStatus(left
					? 'Preparing... (' + (Module.totalDependencies - left) + '/' + Module.totalDependencies + ')'
					: 'All downloads complete.');
			},
			onRuntimeInitialized: function () {
				for (var i = 0; i < pending.length; i++) {
					FS.writeFile('/' + pending[i].name, pending[i].data);
				}
			},
			softExit: function (status) {
				// Saves have been flushed to IDBFS by now; a reload starts over.
				console.info('Program exited with code', status);
				exitBox.textContent = 'The game exited (code ' + status + '). Reload the page to play again.';
				exitBox.hidden = false;
			},
			arguments: []
		};
		window.Module = Module;

		window.onerror = function () {
			Module.setStatus('Exception thrown, see JavaScript console');
			spinnerElement.hidden = true;
		};

		function setError(message) {
			errorBox.textContent = message;
			errorBox.hidden = false;
		}

		function rebuildGames(userIwads, keep) {
			gameSelect.textContent = '';
			launch.games.forEach(function (game) {
				var option = document.createElement('option');
				option.value = 'game:' + game.id;
				option.textContent = game.label;
				option.dataset.url = game.url;
				option.dataset.name = game.id + '.wad';
				gameSelect.appendChild(option);
			});
			userIwads.forEach(function (name) {
				var option = document.createElement('option');
				option.value = 'iwad:' + name;
				option.textContent = name + ' (your IWAD)';
				option.dataset.name = name;
				gameSelect.appendChild(option);
			});
			var wanted = Array.prototype.some.call(gameSelect.options, function (option) {
				return option.value === keep;
			});
			if (wanted) gameSelect.value = keep;
			else gameSelect.selectedIndex = launch.games.length > 0 ? 0 : -1;
		}

		// Validate everything that was picked, then refresh the game list so a
		// custom IWAD can be chosen instead of the bundled one.
		function onFilesPicked() {
			pickedList.textContent = '';
			var files = Array.prototype.slice.call(fileInput.files);
			var problems = [];
			var next = [];
			var previous = gameSelect.value;

			// Read in selection order so -file keeps the order the picker gave.
			var read = files.reduce(function (chain, file) {
				return chain.then(function () {
					return file.arrayBuffer().then(function (buffer) {
						var name = file.name.split(/[/\\]/).pop();
						var bytes = new Uint8Array(buffer);
						var verdict = DwasmLauncher.classify(name, bytes);
						if (verdict.error) {
							problems.push(name + ' ' + verdict.error);
							return;
						}
						next.push({ name: name, kind: verdict.kind, data: bytes });
					});
				});
			}, Promise.resolve()).then(function () {
				selection = next;
				selection.forEach(function (entry) {
					var item = document.createElement('li');
					item.textContent = entry.name + ' — ' + entry.kind;
					pickedList.appendChild(item);
				});
				problems.forEach(function (problem) {
					var item = document.createElement('li');
					item.className = 'dwasm-error';
					item.textContent = problem;
					pickedList.appendChild(item);
				});
				startButton.disabled = problems.length > 0;
			});

			read.then(function () {
				var userIwads = selection.filter(function (entry) { return entry.kind === 'iwad'; })
					.map(function (entry) { return entry.name; });
				rebuildGames(userIwads, previous);
				// A newly offered IWAD is what the user just picked: use it.
				var added = userIwads.filter(function (name) { return shownIwads.indexOf(name) < 0; });
				shownIwads = userIwads;
				if (added.length > 0) gameSelect.value = 'iwad:' + added[0];
			});
		}

		function start() {
			var option = gameSelect.selectedOptions[0];
			if (!option) return setError('Choose a game first.');
			errorBox.hidden = true;
			startButton.disabled = true;
			loadElement.hidden = false;
			setupElement.hidden = true;
			exitBox.hidden = true;

			var pwads = selection.filter(function (e) { return e.kind === 'pwad'; }).map(function (e) { return e.name; });
			var dehs = selection.filter(function (e) { return e.kind === 'deh'; }).map(function (e) { return e.name; });
			var bundled = option.dataset.url !== undefined;
			var iwad = option.dataset.name;

			var ready = bundled
				? fetch(option.dataset.url, { credentials: 'same-origin' }).then(function (response) {
					if (!response.ok) throw new Error('downloading ' + option.textContent + ' failed: HTTP ' + response.status);
					Module.setStatus('Downloading ' + option.textContent + '...');
					return response.arrayBuffer();
				}).then(function (buffer) {
					return gunzip(new Uint8Array(buffer)).then(function (wad) {
						return [{ name: iwad, data: wad }];
					});
				})
				: Promise.resolve([]);

			ready.then(function (gameFiles) {
				// User IWADs are only written when they are the chosen game.
				pending = gameFiles.concat(bundled
					? selection.filter(function (e) { return e.kind !== 'iwad'; })
					: selection);
				Module.arguments = DwasmLauncher.buildArguments(iwad, pwads, dehs);
				Module.setStatus('Loading...');

				var script = document.createElement('script');
				script.src = launch.script;
				script.onerror = function () {
					setupElement.hidden = false;
					loadElement.hidden = true;
					startButton.disabled = false;
					setError('The engine could not be loaded. Check that the app was built (engine/index.js).');
				};
				document.body.appendChild(script);
			}).catch(function (error) {
				setupElement.hidden = false;
				loadElement.hidden = true;
				startButton.disabled = false;
				setError(String(error.message || error));
			});
		}

		function gunzip(bytes) {
			if (typeof DecompressionStream === 'undefined') {
				return Promise.reject(new Error('This browser cannot expand the bundled game (DecompressionStream is unavailable).'));
			}
			var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
			return new Response(stream).arrayBuffer().then(function (buffer) {
				return new Uint8Array(buffer);
			});
		}

		rebuildGames([], '');
		fileInput.addEventListener('change', onFilesPicked);
		startButton.addEventListener('click', start);
	})();
}