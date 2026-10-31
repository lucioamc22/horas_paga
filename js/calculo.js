// Motor de cálculo: limites mensais e previsão de pagamentos.
// Funções puras (sem DOM nem armazenamento) para poderem ser testadas no Node.
// Datas são sempre strings 'AAAA-MM-DD' e meses 'AAAA-MM', evitando fuso horário.

export const LIMITE_MENSAL = 50;
export const TIPOS = ['EXTRA', 'SINFRA', 'DELEGADA'];
export const NOME_TIPO = { EXTRA: 'Extraordinária', SINFRA: 'SINFRA', DELEGADA: 'Delegada' };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n) => String(n).padStart(2, '0');
// Arredonda para centavos; toPrecision elimina o ruído do ponto flutuante (ex.: 1,005 × 100 = 100,4999…).
export const arred = (v) => Math.round(Number((v * 100).toPrecision(12))) / 100;

export function chaveMes(data) {
  return data.slice(0, 7);
}

export function partesMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}

export function somarMeses(ym, n) {
  const { y, m } = partesMes(ym);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function diasNoMes(ym) {
  const { y, m } = partesMes(ym);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function quinzena(data) {
  return Number(data.slice(8, 10)) <= 15 ? 1 : 2;
}

export function nomeMes(ym, comAno = false) {
  const { y, m } = partesMes(ym);
  return comAno ? `${MESES[m - 1]}/${y}` : MESES[m - 1];
}

// Valor da hora como a folha calcula: salário-base × percentual, SEM arredondar.
// O arredondamento é feito só no total (horas × valor/h), igual ao contracheque.
export function valorHoraDe(salario, percentual) {
  return (salario * percentual) / 100;
}

export function valorLancamento(l) {
  return arred(l.horas * l.valorHora);
}

// Horas de Extra + SINFRA já lançadas no mês (opcionalmente ignorando um lançamento em edição).
export function horasLimitadasNoMes(lancamentos, ym, ignorarId) {
  return lancamentos
    .filter((l) => l.id !== ignorarId && (l.tipo === 'EXTRA' || l.tipo === 'SINFRA') && chaveMes(l.data) === ym)
    .reduce((s, l) => s + l.horas, 0);
}

export function horasRestantes(lancamentos, ym, ignorarId, limite = LIMITE_MENSAL) {
  return Math.max(0, limite - horasLimitadasNoMes(lancamentos, ym, ignorarId));
}

export const DIA_DELEGADA_PADRAO = 20;

// Delegada paga no dia D de cada mês o período do dia D do mês anterior ao dia D-1 do mês atual.
// Ex. (D = 20): 20/03 a 19/04 → paga 20/04. Feita antes do dia D → paga D do mesmo mês;
// feita no dia D ou depois → paga D do mês seguinte.
export function pagamentoDelegada(data, dia = DIA_DELEGADA_PADRAO) {
  const ym = chaveMes(data);
  const corte = Math.min(dia, diasNoMes(ym));
  const pago = somarMeses(ym, Number(data.slice(8, 10)) < corte ? 0 : 1);
  return `${pago}-${pad(Math.min(dia, diasNoMes(pago)))}`;
}

const somaHoras = (ls) => ls.reduce((s, l) => s + l.horas, 0);
const somaValor = (ls) => arred(ls.reduce((s, l) => s + l.horas * l.valorHora, 0));
const ORDEM_TIPO = { EXTRA: 0, SINFRA: 1, DELEGADA: 2 };

// Gera os pagamentos previstos a partir dos lançamentos.
// Retorno: [{ id, tipo, credito, origem:{mes,quinzena}, rotulo, horasPagas, horasNoContracheque,
//            valor, dataPrevista, dataFim, mesPagamento, lancamentoIds }] ordenado por data.
// credito: 'COMPLEMENTAR' (janela de dias no mês seguinte), 'MENSAL' (folha do mês seguinte,
// sem dia exato — dataPrevista é o último dia, só para ordenar) ou 'DATA' (Delegada, dia fixo).
export function gerarPagamentos(lancamentos, config) {
  const janela = config.janelaComplementar ?? { inicio: 4, fim: 10 };
  const grupos = new Map();
  const delegadas = new Map();

  for (const l of lancamentos) {
    if (l.tipo === 'DELEGADA') {
      // cada município tem seu dia de fechamento, guardado no lançamento
      const k = `${pagamentoDelegada(l.data, l.diaFechamento ?? DIA_DELEGADA_PADRAO)}|${l.municipio ?? ''}`;
      if (!delegadas.has(k)) delegadas.set(k, []);
      delegadas.get(k).push(l);
      continue;
    }
    const k = `${l.tipo}|${chaveMes(l.data)}`;
    if (!grupos.has(k)) grupos.set(k, { tipo: l.tipo, ym: chaveMes(l.data), q1: [], q2: [] });
    grupos.get(k)[quinzena(l.data) === 1 ? 'q1' : 'q2'].push(l);
  }

  const pagamentos = [];
  for (const g of grupos.values()) {
    const seguinte = somarMeses(g.ym, 1);
    const total = somaHoras(g.q1) + somaHoras(g.q2);
    if (g.q1.length) {
      pagamentos.push({
        id: `${g.tipo}-${g.ym}-1`,
        tipo: g.tipo,
        credito: 'COMPLEMENTAR',
        mesPagamento: seguinte,
        origem: { mes: g.ym, quinzena: 1 },
        rotulo: `Folha complementar de ${nomeMes(g.ym)}`,
        horasPagas: somaHoras(g.q1),
        horasNoContracheque: somaHoras(g.q1),
        valor: somaValor(g.q1),
        dataPrevista: `${seguinte}-${pad(Math.min(janela.inicio, diasNoMes(seguinte)))}`,
        dataFim: `${seguinte}-${pad(Math.min(janela.fim, diasNoMes(seguinte)))}`,
        lancamentoIds: g.q1.map((l) => l.id),
      });
    }
    if (g.q2.length) {
      pagamentos.push({
        id: `${g.tipo}-${g.ym}-2`,
        tipo: g.tipo,
        credito: 'MENSAL',
        mesPagamento: seguinte,
        origem: { mes: g.ym, quinzena: 2 },
        rotulo: `Folha mensal de ${nomeMes(seguinte)}`,
        horasPagas: somaHoras(g.q2),
        horasNoContracheque: total,
        valor: somaValor(g.q2),
        dataPrevista: `${seguinte}-${pad(diasNoMes(seguinte))}`,
        dataFim: null,
        lancamentoIds: g.q2.map((l) => l.id),
      });
    }
  }

  for (const [chave, ls] of delegadas) {
    const [data, municipio] = chave.split('|');
    pagamentos.push({
      id: `DELEGADA-${data}-${municipio}`,
      tipo: 'DELEGADA',
      credito: 'DATA',
      mesPagamento: chaveMes(data),
      origem: { mes: null, quinzena: null },
      municipio: municipio || null,
      rotulo: municipio ? `Delegada — ${municipio}` : 'Delegada',
      horasPagas: somaHoras(ls),
      horasNoContracheque: somaHoras(ls),
      valor: somaValor(ls),
      dataPrevista: data,
      dataFim: null,
      lancamentoIds: ls.map((l) => l.id),
    });
  }

  return pagamentos.sort((a, b) => {
    if (a.dataPrevista !== b.dataPrevista) {
      if (!a.dataPrevista) return 1;
      if (!b.dataPrevista) return -1;
      return a.dataPrevista < b.dataPrevista ? -1 : 1;
    }
    return ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo];
  });
}

// Junta pagamentos que caem no mesmo crédito (mesmo rótulo e data), p/ exibir como um item.
export function agruparPorCredito(pagamentos) {
  const mapa = new Map();
  for (const p of pagamentos) {
    const k = `${p.rotulo}|${p.dataPrevista}`;
    if (!mapa.has(k)) {
      mapa.set(k, {
        chave: k, rotulo: p.rotulo, credito: p.credito, mesPagamento: p.mesPagamento,
        dataPrevista: p.dataPrevista, dataFim: p.dataFim, itens: [], valor: 0,
      });
    }
    const g = mapa.get(k);
    g.itens.push(p);
    g.valor = arred(g.valor + p.valor);
  }
  return [...mapa.values()];
}

// Resumo de um mês trabalhado: lançamentos por quinzena e subtotais por tipo.
export function resumoMes(lancamentos, ym) {
  const doMes = lancamentos.filter((l) => chaveMes(l.data) === ym)
    .sort((a, b) => (a.data === b.data ? a.criadoEm - b.criadoEm : a.data < b.data ? -1 : 1));
  const sub = (ls) => Object.fromEntries(TIPOS.map((t) => {
    const x = ls.filter((l) => l.tipo === t);
    // valor do subtotal: soma sem arredondar e arredonda no fim, como a folha
    return [t, { horas: somaHoras(x), valor: somaValor(x) }];
  }));
  const q1 = doMes.filter((l) => quinzena(l.data) === 1);
  const q2 = doMes.filter((l) => quinzena(l.data) === 2);
  return { lancamentos: doMes, q1, q2, subQ1: sub(q1), subQ2: sub(q2), total: sub(doMes) };
}
