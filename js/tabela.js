// Postos/graduações e tabela oficial do valor da hora (fixa no app, o usuário não edita).
// Valores a partir de janeiro/2026 (LC nº 723 de 01/04/2022): hora = 0,50% do salário-base da faixa.
// SINFRA usa o mesmo percentual até haver regra própria.

import { valorHoraDe } from './calculo.js';

export const FAIXAS = [
  { id: 'CBSD', nome: 'Cabos e Soldados', salario: 8670.97 },
  { id: 'STSGT', nome: 'Subtenente e Sargentos', salario: 11864.84 },
  { id: 'OF', nome: 'Oficiais', salario: 18344.68 },
];
const PERCENTUAL = { EXTRA: 0.5, SINFRA: 0.5 };

export const POSTOS = [
  { id: 'SD', nome: 'Soldado', faixa: 'CBSD' },
  { id: 'CB', nome: 'Cabo', faixa: 'CBSD' },
  { id: '3SGT', nome: '3º Sargento', faixa: 'STSGT' },
  { id: '2SGT', nome: '2º Sargento', faixa: 'STSGT' },
  { id: '1SGT', nome: '1º Sargento', faixa: 'STSGT' },
  { id: 'ST', nome: 'Subtenente', faixa: 'STSGT' },
  { id: 'ASP', nome: 'Aspirante a Oficial', faixa: 'OF' },
  { id: '2TEN', nome: '2º Tenente', faixa: 'OF' },
  { id: '1TEN', nome: '1º Tenente', faixa: 'OF' },
  { id: 'CAP', nome: 'Capitão', faixa: 'OF' },
  { id: 'MAJ', nome: 'Major', faixa: 'OF' },
  { id: 'TC', nome: 'Tenente-Coronel', faixa: 'OF' },
  { id: 'CEL', nome: 'Coronel', faixa: 'OF' },
];

export function nomePosto(id) {
  return POSTOS.find((p) => p.id === id)?.nome ?? id;
}

export function faixaDoPosto(id) {
  const faixa = POSTOS.find((p) => p.id === id)?.faixa ?? 'CBSD';
  return FAIXAS.find((f) => f.id === faixa);
}

export const VIGENCIA = 'janeiro/2026';

// Valor/h oficial exato (sem arredondar) da faixa.
export function valorHoraOficial(faixaId, tipo = 'EXTRA') {
  return valorHoraDe(FAIXAS.find((f) => f.id === faixaId).salario, PERCENTUAL[tipo]);
}

// Valor/h para o posto e tipo (EXTRA | SINFRA). `alterados` = { faixaId: valor } digitados
// pelo usuário quando sai tabela nova; sem alteração usa o oficial exato.
export function valorHoraPosto(posto, tipo, alterados = {}) {
  const faixa = faixaDoPosto(posto).id;
  return alterados[faixa] ?? valorHoraOficial(faixa, tipo);
}
