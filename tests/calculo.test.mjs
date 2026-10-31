// Rodar com: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarPagamentos, valorHoraDe, valorLancamento, horasRestantes, somarMeses, agruparPorCredito, resumoMes,
  pagamentoDelegada,
} from '../js/calculo.js';

const config = { janelaComplementar: { inicio: 4, fim: 10 } };
let seq = 0;
const lanc = (data, tipo, horas, valorHora = 50, extra = {}) =>
  ({ id: `l${++seq}`, data, tipo, horas, valorHora, criadoEm: seq, ...extra });

test('exemplo de março: 12h na 1ª quinzena + 18h na 2ª', () => {
  const ls = [lanc('2026-03-05', 'EXTRA', 6), lanc('2026-03-12', 'EXTRA', 6),
    lanc('2026-03-16', 'EXTRA', 12), lanc('2026-03-31', 'EXTRA', 6)];
  const [comp, folha] = gerarPagamentos(ls, config);

  assert.equal(comp.rotulo, 'Folha complementar de março');
  assert.equal(comp.horasPagas, 12);
  assert.equal(comp.valor, 600);
  assert.equal(comp.dataPrevista, '2026-04-04');
  assert.equal(comp.dataFim, '2026-04-10');

  assert.equal(folha.rotulo, 'Folha mensal de abril');
  assert.equal(folha.credito, 'MENSAL');
  assert.equal(folha.mesPagamento, '2026-04');
  assert.equal(folha.horasPagas, 18);
  assert.equal(folha.horasNoContracheque, 30);
  assert.equal(folha.valor, 900);
});

test('virada de ano: dezembro paga em janeiro do ano seguinte', () => {
  const ls = [lanc('2026-12-10', 'SINFRA', 8), lanc('2026-12-20', 'SINFRA', 8)];
  const [comp, folha] = gerarPagamentos(ls, config);
  assert.equal(comp.rotulo, 'Folha complementar de dezembro');
  assert.equal(comp.dataPrevista, '2027-01-04');
  assert.equal(comp.dataFim, '2027-01-10');
  assert.equal(folha.rotulo, 'Folha mensal de janeiro');
  assert.equal(folha.mesPagamento, '2027-01');
  assert.equal(folha.horasNoContracheque, 16);
});

test('dia 15 é 1ª quinzena e dia 16 é 2ª', () => {
  const ls = [lanc('2026-05-15', 'EXTRA', 8), lanc('2026-05-16', 'EXTRA', 8)];
  const [comp, folha] = gerarPagamentos(ls, config);
  assert.equal(comp.horasPagas, 8);
  assert.equal(folha.horasPagas, 8);
});

test('Extra e SINFRA geram pagamentos separados que se agrupam no mesmo crédito', () => {
  const ls = [lanc('2026-03-20', 'EXTRA', 10, 50), lanc('2026-03-21', 'SINFRA', 5, 40)];
  const pags = gerarPagamentos(ls, config);
  assert.equal(pags.length, 2);
  const grupos = agruparPorCredito(pags);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].valor, 700);
});

test('arredondamento igual ao contracheque: 8h de SD/CB = R$ 346,84', () => {
  const vh = valorHoraDe(8670.97, 0.5); // 43,35485 — não arredondar antes de multiplicar
  assert.equal(valorLancamento({ horas: 8, valorHora: vh }), 346.84);
  const [p] = gerarPagamentos([lanc('2026-09-03', 'EXTRA', 8, vh)], config);
  assert.equal(p.valor, 346.84);
  // total do grupo arredonda só no fim: 3 × 1h = 130,06 (e não 3 × 43,35 = 130,05)
  const [g] = gerarPagamentos([lanc('2026-09-01', 'EXTRA', 1, vh), lanc('2026-09-02', 'EXTRA', 1, vh),
    lanc('2026-09-04', 'EXTRA', 1, vh)], config);
  assert.equal(g.valor, 130.06);
});

test('limite de 50h soma Extra + SINFRA e ignora Delegada', () => {
  const ls = [lanc('2026-03-01', 'EXTRA', 24), lanc('2026-03-02', 'SINFRA', 12),
    lanc('2026-03-03', 'DELEGADA', 12), lanc('2026-04-01', 'EXTRA', 12)];
  assert.equal(horasRestantes(ls, '2026-03'), 14);
  assert.equal(horasRestantes(ls, '2026-03', ls[0].id), 38); // editando o de 24h
});

test('Delegada paga dia 20: 01–19/03 → 20/03; 20/03–19/04 → 20/04; 20/04–19/05 → 20/05', () => {
  assert.equal(pagamentoDelegada('2026-03-01', 20), '2026-03-20');
  assert.equal(pagamentoDelegada('2026-03-19', 20), '2026-03-20');
  assert.equal(pagamentoDelegada('2026-03-20', 20), '2026-04-20');
  assert.equal(pagamentoDelegada('2026-04-19', 20), '2026-04-20');
  assert.equal(pagamentoDelegada('2026-04-20', 20), '2026-05-20');
  assert.equal(pagamentoDelegada('2026-05-19', 20), '2026-05-20');
  assert.equal(pagamentoDelegada('2026-12-25', 20), '2027-01-20'); // virada de ano
  assert.equal(pagamentoDelegada('2026-02-28', 30), '2026-03-30'); // fevereiro sem dia 30: corte no dia 28

  const cuiaba = { municipio: 'Cuiabá', diaFechamento: 20 };
  const ls = [lanc('2026-03-03', 'DELEGADA', 6, 30, cuiaba), lanc('2026-03-19', 'DELEGADA', 6, 35, cuiaba),
    lanc('2026-03-20', 'DELEGADA', 4, 30, cuiaba), lanc('2026-04-10', 'DELEGADA', 2, 30, cuiaba)];
  const pags = gerarPagamentos(ls, config);
  assert.equal(pags.length, 2);
  assert.equal(pags[0].dataPrevista, '2026-03-20');
  assert.equal(pags[0].rotulo, 'Delegada — Cuiabá');
  assert.equal(pags[0].valor, 390);
  assert.equal(pags[1].dataPrevista, '2026-04-20');
  assert.equal(pags[1].horasPagas, 6);
  assert.equal(pags[1].valor, 180);
});

test('Delegada: cada município usa o seu dia de fechamento', () => {
  const ls = [lanc('2026-03-12', 'DELEGADA', 6, 30, { municipio: 'Cuiabá', diaFechamento: 20 }),
    lanc('2026-03-12', 'DELEGADA', 6, 40, { municipio: 'Várzea Grande', diaFechamento: 10 })];
  const pags = gerarPagamentos(ls, config);
  assert.equal(pags.length, 2);
  assert.deepEqual(pags.map((p) => [p.rotulo, p.dataPrevista]), [
    ['Delegada — Cuiabá', '2026-03-20'], // 12/03 antes do dia 20 → 20/03
    ['Delegada — Várzea Grande', '2026-04-10'], // 12/03 depois do dia 10 → 10/04
  ]);
});

test('somarMeses e resumoMes', () => {
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  const r = resumoMes([lanc('2026-03-02', 'EXTRA', 6), lanc('2026-03-20', 'EXTRA', 8),
    lanc('2026-04-01', 'EXTRA', 6)], '2026-03');
  assert.equal(r.lancamentos.length, 2);
  assert.equal(r.subQ1.EXTRA.horas, 6);
  assert.equal(r.total.EXTRA.horas, 14);
});
