// Cópia de segurança automática na pasta Documentos do celular (fora do app).
// Sobrevive à desinstalação e ao "limpar dados" do app. Só funciona no APK (Capacitor).

import { gerarBackup, lerBackup } from './storage.js';

export const PASTA = 'Documents/HorasPaga';
const ARQUIVO_PADRAO = 'HorasPaga/horas-paga-backup.json';
const CHAVE_ULTIMA = 'horapaga.ultimaCopia';
const CHAVE_ARQUIVO = 'horapaga.arquivoCopia';

const fs = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins.Filesystem : null);
const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

let timer;
let avisou = false;

export const disponivel = () => !!fs();
export const ultimaCopia = () => lerLocal(CHAVE_ULTIMA);
export const arquivoAtual = () => lerLocal(CHAVE_ARQUIVO) ?? ARQUIVO_PADRAO;

// Agenda a gravação (junta várias alterações seguidas numa só escrita).
export function agendarCopia(estado, aoFalhar) {
  if (!fs() || !estado.config) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    gravar(estado).catch((e) => {
      console.warn('Cópia de segurança não gravada', e);
      if (!avisou) { avisou = true; aoFalhar(e); }
    });
  }, 400);
}

async function gravar(estado) {
  const f = fs();
  try {
    const p = await f.checkPermissions();
    if (p.publicStorage !== 'granted') await f.requestPermissions();
  } catch { /* Android 11+ não pede permissão para a própria pasta */ }

  const escrever = (path) => f.writeFile({
    path, data: gerarBackup(estado), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true,
  });
  try {
    await escrever(arquivoAtual());
  } catch (e) {
    // Após reinstalar, o Android não deixa sobrescrever o arquivo criado pela instalação
    // anterior: passa a usar um arquivo novo na mesma pasta.
    const novo = `HorasPaga/horas-paga-backup-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}.json`;
    await escrever(novo);
    gravarLocal(CHAVE_ARQUIVO, novo);
  }
  gravarLocal(CHAVE_ULTIMA, new Date().toISOString());
}

// Tenta ler a cópia existente (ex.: após "limpar dados"). Devolve null se não houver
// ou se o Android não liberar o acesso — aí o usuário escolhe o arquivo manualmente.
export async function lerCopia() {
  const f = fs();
  if (!f) return null;
  try {
    const { data } = await f.readFile({ path: ARQUIVO_PADRAO, directory: 'DOCUMENTS', encoding: 'utf8' });
    return lerBackup(data);
  } catch {
    return null;
  }
}
