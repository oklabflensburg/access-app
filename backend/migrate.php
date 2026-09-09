<?php
require __DIR__ . '/src/common.php';
db()->exec(file_get_contents(__DIR__ . '/schema.sql'));
echo "Database schema ready.\n";
