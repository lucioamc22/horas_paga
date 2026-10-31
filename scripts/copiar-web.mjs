// Copia os arquivos do PWA para www/, a pasta que o Capacitor embute no APK.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const ARQUIVOS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const a of ARQUIVOS) cpSync(a, `www/${a}`, { recursive: true });
console.log('www/ atualizado');
