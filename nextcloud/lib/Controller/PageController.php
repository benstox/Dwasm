<?php

declare(strict_types=1);

namespace OCA\Dwasm\Controller;

use OCA\Dwasm\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\IRequest;
use OCP\IURLGenerator;

class PageController extends Controller {
	/** Bundled IWADs, served gzipped from the engine route. */
	private const GAMES = [
		['id' => 'freedoom2', 'label' => 'Freedoom: Phase 2'],
		['id' => 'freedoom1', 'label' => 'Freedoom: Phase 1'],
	];

	public function __construct(
		string $appName,
		IRequest $request,
		private IInitialState $initialState,
		private IURLGenerator $urlGenerator,
	) {
		parent::__construct($appName, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	#[OpenAPI(OpenAPI::SCOPE_IGNORE)]
	public function index(): TemplateResponse {
		// Everything the launcher needs to build its URLs, so no client code
		// hard-codes a path (subpath installs would break otherwise).
		$games = array_map(fn (array $game): array => $game + [
			'url' => $this->urlGenerator->linkToRoute('dwasm.engine.get', [
				'filename' => $game['id'] . '.wad.gz',
			]),
		], self::GAMES);
		$this->initialState->provideInitialState('launch', [
			'script' => $this->urlGenerator->linkToRoute('dwasm.engine.get', [
				'filename' => 'index.js',
			]),
			'games' => $games,
		]);

		$response = new TemplateResponse(Application::APP_ID, 'index');
		// 'wasm-unsafe-eval' for WebAssembly.instantiate; the engine is built
		// with -sDYNAMIC_EXECUTION=0 so 'unsafe-eval' is not needed.
		$csp = new ContentSecurityPolicy();
		$csp->allowEvalWasm();
		$response->setContentSecurityPolicy($csp);
		return $response;
	}
}