<?php

declare(strict_types=1);

namespace OCA\Dwasm\Controller;

use OCA\Dwasm\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\OpenAPI;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\IRequest;

/**
 * Serves the built engine artifacts. All three index.* files come from the
 * same build directory, which is what keeps index.js and index.wasm matched.
 */
class EngineController extends Controller {
	/** filename => Content-Type. The set is closed: anything else is 404. */
	private const FILES = [
		'index.js' => 'application/javascript',
		'index.wasm' => 'application/wasm',
		'index.data' => 'application/octet-stream',
		'freedoom1.wad.gz' => 'application/gzip',
		'freedoom2.wad.gz' => 'application/gzip',
	];

	public function __construct(
		string $appName,
		IRequest $request,
		private IAppManager $appManager,
	) {
		parent::__construct($appName, $request);
	}

	#[NoCSRFRequired]
	#[NoAdminRequired]
	#[OpenAPI(OpenAPI::SCOPE_IGNORE)]
	public function get(string $filename): StreamResponse|NotFoundResponse {
		$contentType = self::FILES[$filename] ?? null;
		if ($contentType === null) {
			return new NotFoundResponse();
		}

		$path = $this->appManager->getAppPath(Application::APP_ID) . '/engine/' . $filename;
		if (!is_file($path)) {
			return new NotFoundResponse();
		}

		$response = new StreamResponse($path);
		$response->setHeaders([
			'Content-Type' => $contentType,
			'Content-Length' => (string)filesize($path),
			'Cache-Control' => 'public, max-age=3600',
		]);
		return $response;
	}
}