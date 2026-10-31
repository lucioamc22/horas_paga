// Armazenamento local (somente no aparelho). Tudo num único registro do localStorage.

const CHAVE = 'horapaga.v1';

export function configPadrao() {
  return {
    qra: '',
    posto: 'SD',
    valoresHora: {},
    janelaComplementar: { inicio: 4, fim: 10 },
    favoritos: [],
    recebidos: {},
    ocultarValores: false,
  };
}

// Garante defaults e remove campos de versões anteriores.
function normalizarConfig(c) {
  const cfg = { ...configPadrao(), ...c };
  if (!cfg.qra && c.nomeGuerra) cfg.qra = c.nomeGuerra.toUpperCase();
  for (const antigo of ['nomeGuerra', 'diaFolha', 'regraDelegada', 'diaDelegada', 'tabelaValores', 'tema', 'fonteGrande']) delete cfg[antigo];
  return cfg;
}

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const d = JSON.parse(bruto);
      return {
        config: d.config ? normalizarConfig(d.config) : null,
        lancamentos: Array.isArray(d.lancamentos) ? d.lancamentos : [],
      };
    }
  } catch (e) {
    console.error('Falha ao ler dados locais', e);
  }
  return { config: null, lancamentos: [] };
}

export function salvar(estado) {
  localStorage.setItem(CHAVE, JSON.stringify({ config: estado.config, lancamentos: estado.lancamentos }));
}

// Pede ao navegador para não apagar os dados quando faltar espaço.
export function pedirPersistencia() {
  navigator.storage?.persist?.().catch(() => {});
}

export function novoId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function gerarBackup(estado) {
  return JSON.stringify({
    app: 'hora-paga-pm',
    versao: 1,
    exportadoEm: new Date().toISOString(),
    config: estado.config,
    lancamentos: estado.lancamentos,
  }, null, 2);
}

// Valida e devolve { config, lancamentos } ou lança erro com mensagem para o usuário.
export function lerBackup(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { throw new Error('Arquivo não é um backup válido.'); }
  if (d?.app !== 'hora-paga-pm' || !Array.isArray(d.lancamentos) || !d.config) {
    throw new Error('Este arquivo não é um backup do HORAS PAGA.');
  }
  const okLanc = d.lancamentos.every((l) => l.id && /^\d{4}-\d{2}-\d{2}$/.test(l.data)
    && ['EXTRA', 'SINFRA', 'DELEGADA'].includes(l.tipo) && typeof l.horas === 'number');
  if (!okLanc) throw new Error('Backup com lançamentos corrompidos.');
  return { config: normalizarConfig(d.config), lancamentos: d.lancamentos };
}
