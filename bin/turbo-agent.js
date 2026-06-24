#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

// Caminhos absolutos baseados no local de instalação do turbo-agent
const tsxPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
const indexTsPath = path.join(__dirname, '..', 'src', 'index.ts');

// Passa todos os argumentos de linha de comando para o script
const result = spawnSync(tsxPath, [indexTsPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(result.status || 0);
