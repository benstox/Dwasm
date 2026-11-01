<?php

declare(strict_types=1);

namespace OCA\Dwasm\Tests\Unit\Controller;

use OCA\Dwasm\Controller\EngineController;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use ReflectionProperty;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class EngineControllerTest extends TestCase {
	private const CONTENTS = [
		'index.js' => 'javascript',
		'index.wasm' => 'wasm',
		'index.data' => 'data',
		'freedoom1.wad.gz' => 'one',
		'freedoom2.wad.gz' => 'two',
	];

	private IAppManager&MockObject $appManager;
	private EngineController $controller;
	private string $appDir;

	protected function setUp(): void {
		parent::setUp();
		$this->appDir = sys_get_temp_dir() . '/dwasm-app-' . uniqid();
		mkdir($this->appDir . '/engine', 0777, true);
		// One bundled game is deliberately missing from disk.
		foreach (self::CONTENTS as $name => $contents) {
			if ($name === 'freedoom1.wad.gz') {
				continue;
			}
			file_put_contents($this->appDir . '/engine/' . $name, $contents);
		}

		$this->appManager = $this->createMock(IAppManager::class);
		$this->appManager->method('getAppPath')->willReturn($this->appDir);
		$this->controller = new EngineController(
			'dwasm',
			$this->createMock(IRequest::class),
			$this->appManager,
		);
	}

	protected function tearDown(): void {
		array_map('unlink', glob($this->appDir . '/engine/*'));
		rmdir($this->appDir . '/engine');
		rmdir($this->appDir);
		parent::tearDown();
	}

	public function testServesEveryWhitelistedArtifactWithItsType(): void {
		$types = [
			'index.js' => 'application/javascript',
			'index.wasm' => 'application/wasm',
			'index.data' => 'application/octet-stream',
			'freedoom2.wad.gz' => 'application/gzip',
		];

		foreach ($types as $name => $contentType) {
			$response = $this->controller->get($name);
			$this->assertInstanceOf(StreamResponse::class, $response, $name);
			// getHeaders() needs a running Nextcloud; the stored headers do not.
			$property = new ReflectionProperty(Response::class, 'headers');
			$headers = $property->getValue($response);
			$this->assertSame($contentType, $headers['Content-Type'] ?? null, $name);
			$this->assertSame((string)strlen(self::CONTENTS[$name]), $headers['Content-Length'] ?? null, $name);
		}
	}

	public function testRejectsAnythingOutsideTheWhitelist(): void {
		foreach (['index.html', 'freedoom1.wad.gz', 'info.xml', '../appinfo/info.xml', 'x.php'] as $name) {
			$this->assertInstanceOf(NotFoundResponse::class, $this->controller->get($name), $name);
		}
	}
}