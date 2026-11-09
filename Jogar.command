#!/bin/bash
# Duplo clique para abrir O Sítio do Betão no navegador
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npx vite build && npx vite preview --port 4173 --open
