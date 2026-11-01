# Doom (Dwasm) — Nextcloud app

Packages this repository's WebAssembly build of PrBoom+ / PrBoomX as a
Nextcloud app: a logged-in user opens **Doom (Dwasm)** from the app menu and
plays single-player Doom with no external server. Freedoom Phase 1 and 2 are
bundled, `.wad` / `.deh` / `.bex` files can be imported from disk, and saves
and settings persist in the browser through the engine's own IDBFS mount at
`/dwasm`.

The implementation spec is `../doc/nextcloud-app/spec.md`.

## Build

Needs emsdk **3.1.74** on `PATH` (pinned here and in CI), plus CMake, SDL2,
SDL2_mixer, libpng and zlib for the native half:

    git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
    ~/emsdk/emsdk install 3.1.74 && ~/emsdk/emsdk activate 3.1.74
    source ~/emsdk/emsdk_env.sh

    ./nextcloud/tools/build-app.sh          # engine/ only
    ./nextcloud/tools/build-app.sh --pack   # plus dist/dwasm-<version>.tar.gz

The script generates `wasm/fs/prboomx.wad` from a native build of this tree
and refuses to continue if it does not match the SHA-256 pinned in the top-level
`README.md`, downloads Freedoom 0.13.0 (hash-verified) as gzipped IWADs, and
builds `index.js` / `index.wasm` / `index.data` in the single `build/` directory
so the three stay a matched set. `index.js` is built with
`-sDYNAMIC_EXECUTION=0`, which is why the page's CSP needs only
`'wasm-unsafe-eval'`.

## Install

Unpack the release archive (or copy this directory) into the Nextcloud
`apps/` directory as `dwasm/`, enable it, and open it from the app menu.
Artifacts belong in `engine/`; they are gitignored and are produced by CI or
by the build script.

## Tests

    node --test nextcloud/tests/js/launcher.test.js   # argument assembly, file validation
    cd nextcloud && composer install && composer run test:unit   # asset whitelist, MIME types
    php -l ...                                        # composer run lint

    python3 nextcloud/tests/browser/smoke.py          # headless Firefox boot test

The smoke test serves `templates/index.php` through a small static stand-in
(`tests/browser/serve.py`) with the PHP stripped out, then asserts that a
bundled game boots to the game loop with no uncaught errors, that an invalid
WAD is refused by name before anything reaches MemFS, and that the IDBFS mount
syncs to IndexedDB. It does not exercise Nextcloud's CSP or subpath routing;
that leg needs a real Nextcloud instance.

## Layout

    appinfo/         app id, routes
    lib/             PageController (page + CSP + initial state), EngineController (engine artifacts)
    templates/       the page: setup panel plus the canvas/console the engine shell expects
    js/launcher.js   file validation, launch-argument assembly, the Emscripten Module contract
    engine/          built artifacts (gitignored)
    tests/           JS unit tests, PHP unit tests, browser smoke test
    tools/           build-app.sh