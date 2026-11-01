<?php

declare(strict_types=1);

use OCP\Util;

Util::addScript('dwasm', 'launcher');
Util::addStyle('dwasm', 'doom');

/** @var \OCP\IL10N $l */
?>
<noscript>
	<p class="dwasm-noscript"><?php p($l->t('Doom (Dwasm) needs JavaScript and WebAssembly to run.')); ?></p>
</noscript>

<div class="dwasm-app">
	<section id="dwasm-setup" class="dwasm-setup">
		<h1>Doom (Dwasm)</h1>

		<label for="dwasm-game"><?php p($l->t('Game')); ?></label>
		<select id="dwasm-game"></select>

		<label for="dwasm-files"><?php p($l->t('Your files (IWAD, PWAD, DEH, BEX)')); ?></label>
		<input type="file" id="dwasm-files" multiple accept=".wad,.deh,.bex">
		<ul id="dwasm-picked" class="dwasm-picked"></ul>

		<p id="dwasm-error" class="dwasm-error" role="alert" hidden></p>

		<button id="dwasm-start" type="button"><?php p($l->t('Play')); ?></button>

		<p class="dwasm-note"><?php p($l->t('Saves and settings are kept in this browser. Nothing you pick is uploaded.')); ?></p>
	</section>

	<div id="dwasm-load" hidden>
		<figure id="spinner"><div class="dwasm-spinner"></div></figure>
		<div id="status">Downloading...</div>
		<progress id="progress" hidden></progress>
	</div>

	<textarea id="output" readonly></textarea>
	<canvas id="canvas" oncontextmenu="event.preventDefault()" tabindex="-1"></canvas>
	<p id="dwasm-exit" class="dwasm-exit" hidden></p>
</div>