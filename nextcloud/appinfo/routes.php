<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		['name' => 'engine#get', 'url' => '/engine/{filename}', 'verb' => 'GET'],
	],
];