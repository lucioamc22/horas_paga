// Interface do HORAS PAGA (telas, lançamento rápido, ajustes, backup).

import * as S from './storage.js';
import * as C from './calculo.js';
import { ico } from './icones.js';
import * as Copia from './copia.js';
import { POSTOS, FAIXAS, VIGENCIA, nomePosto, faixaDoPosto, valorHoraPosto, valorHoraOficial } from './tabela.js';

// ---------- estado ----------

const estado = S.carregar();
const ui = {
  tela: 'inicio',
  mes: C.chaveMes(hoje()),
  mesRec: null, // mês de recebimento mostrado no Início (null = escolher o próximo com pagamento)
  form: null,          // lançamento em edição (folha inferior)
  wiz: null,           // configuração em montagem no primeiro uso
  confirmar: null,     // ação que aguarda confirmação na própria tela
  importPendente: null,
  overlay: null,        // menu lateral ou seletor de mês
  abertos: {},          // cartões do Início expandidos
  copiaEncontrada: null, // cópia de segurança achada no primeiro uso (após reinstalar)
};

function persistir() {
  try {
    S.salvar(estado);
  } catch (e) {
    toast('Não foi possível salvar no aparelho. Espaço cheio?');
    throw e;
  }
  Copia.agendarCopia(estado, () => toast('Não foi possível gravar a cópia de segurança na pasta Documentos.'));
}

// Restaura config + lançamentos de um backup (primeiro uso após reinstalar).
function restaurar(dados) {
  estado.config = dados.config;
  estado.lancamentos = dados.lancamentos;
  Object.assign(ui, { wiz: null, copiaEncontrada: null, mesRec: null, tela: 'inicio' });
  persistir();
  toast(`Dados restaurados: ${dados.lancamentos.length} lançamentos.`);
  render();
}

// ---------- utilidades ----------

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = (v) => brl.format(v || 0);
const horas = (h) => `${String(Math.round(h * 100) / 100).replace('.', ',')}h`;
// Aceita "8670,97", "8.670,97" e "8670.97".
const num = (v) => {
  let s = String(v ?? '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ddmmaa = (d) => `${ddmm(d)}/${d.slice(0, 4)}`;

// Campo de data em texto DD/MM/AAAA (não depende do idioma do aparelho).
function mascaraData(v) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}
function brParaIso(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return '';
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  const valida = ano >= 2000 && dt.getUTCDate() === dia && dt.getUTCMonth() === mes - 1;
  return valida ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
const isoParaBr = (d) => (d ? ddmmaa(d) : '');
// Completa o que foi digitado: "14" → dia 14 do mês de referência; "1410" → 14/10 do ano atual;
// "141026" → 14/10/2026; "14102026" → data completa. Devolve '' se não formar uma data válida.
function completarData(texto, ymRef) {
  const d = texto.replace(/\D/g, '');
  const ano = hoje().slice(0, 4);
  if (d.length === 1 || d.length === 2) return brParaIso(`${d.padStart(2, '0')}/${ymRef.slice(5, 7)}/${ymRef.slice(0, 4)}`);
  if (d.length === 4) return brParaIso(`${d.slice(0, 2)}/${d.slice(2, 4)}/${ano}`);
  if (d.length === 6) return brParaIso(`${d.slice(0, 2)}/${d.slice(2, 4)}/20${d.slice(4)}`);
  if (d.length === 8) return brParaIso(`${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`);
  return '';
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const dataPorExtenso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${SEMANA[new Date(y, m - 1, d).getDay()]}, ${d} de ${C.nomeMes(iso.slice(0, 7))} de ${y}`;
};

function diasAPartirDeHoje(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function textoData(p) {
  if (p.credito === 'MENSAL') return `Folha de ${C.nomeMes(p.mesPagamento, true)}`;
  if (p.dataFim) return `entre ${p.dataPrevista.slice(8, 10)} e ${ddmm(p.dataFim)}`;
  if (p.dataPrevista) return ddmmaa(p.dataPrevista);
  return 'data a definir';
}

// Valor/h exato da tabela oficial (sem arredondar), como a folha calcula.
const valorTabela = (tipo, cfg = estado.config) => valorHoraPosto(cfg.posto, tipo, cfg.valoresHora);
const valorCampo = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const recebido = (id) => !!estado.config.recebidos[id];

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visivel'), 2800);
}

// ---------- renderização principal ----------

function render() {
  const app = document.getElementById('app');
  if (!estado.config) {
    app.innerHTML = telaWizard();
    renderSheet();
    renderOverlay();
    return;
  }
  const tela = ui.tela === 'mes' ? telaMes() : ui.tela === 'ajustes' ? telaAjustes() : telaInicio();
  const inicio = ui.tela === 'inicio';
  app.innerHTML = `
    ${cabecalho()}
    <main class="conteudo ${inicio ? 'com-fab' : ''}">${tela}
      <p class="aviso">Valores estimados. Confira sempre o contracheque oficial.</p>
    </main>
    <div class="rodape">
      ${inicio ? `<button class="fab" data-acao="lancar">${ico('zap')} Lançar horas</button>` : ''}
      <nav class="abas">
        ${aba('inicio', 'Início', 'home')}${aba('mes', 'Mês', 'calendarCheck')}${aba('ajustes', 'Ajustes', 'settings')}
      </nav>
    </div>`;
  renderSheet();
  renderOverlay();
}

const aba = (id, nome, icone) =>
  `<button class="aba ${ui.tela === id ? 'ativa' : ''}" data-acao="aba" data-tela="${id}">${ico(icone)}<span>${nome}</span></button>`;

// Cabeçalho de cada tela: botão à esquerda, título + subtítulo, botão à direita.
function cabecalho() {
  const cfg = estado.config;
  // txtAcao: atributos que tornam o título tocável (ex.: abrir o seletor de mês)
  const topo = (esq, titulo, sub, dir, classe = '', txtAcao = '') => `
    <header class="topo ${classe}">
      <div class="topo-lado">${esq}</div>
      <${txtAcao ? 'button' : 'div'} class="topo-txt" ${txtAcao}><h1>${titulo}</h1><div class="topo-sub">${esc(sub)}</div></${txtAcao ? 'button' : 'div'}>
      <div class="topo-lado">${dir}</div>
    </header>`;
  const calendario = (alvo) =>
    `<button class="ico-btn" data-acao="abrirCalendario" data-alvo="${alvo}" aria-label="Escolher mês">${ico('calendar')}</button>`;
  const voltar = `<button class="ico-btn" data-acao="aba" data-tela="inicio" aria-label="Voltar">${ico('arrowLeft')}</button>`;
  // Lançamentos: cabeçalho claro, sem ícone; tocar no mês abre o seletor
  if (ui.tela === 'mes') {
    return topo(voltar, 'Lançamentos', C.nomeMes(ui.mes, true), '', 'claro',
      'data-acao="abrirCalendario" data-alvo="mes" aria-label="Trocar o mês"');
  }
  if (ui.tela === 'ajustes') return topo(voltar, 'Ajustes', [cfg.posto, cfg.qra].filter(Boolean).join(' '), '');
  const ym = (ui.mesRec ??= proximoMesComPagamento());
  return `
    <header class="topo topo-inicio">
      <div class="mes-nav">
        <button class="ico-btn" data-acao="recAnt" aria-label="Mês anterior">${ico('chevronLeft')}</button>
        <button class="mes-nav-txt" data-acao="abrirCalendario" data-alvo="mesRec" aria-label="Escolher mês">${C.nomeMes(ym, true)}</button>
        <button class="ico-btn" data-acao="recProx" aria-label="Próximo mês">${ico('chevronRight')}</button>
      </div>
    </header>`;
}

// Seletor de mês (fica por cima das telas).
function renderOverlay() {
  const el = document.getElementById('overlay');
  const o = ui.overlay;
  if (!o || !estado.config) {
    el.className = 'overlay';
    el.innerHTML = '';
    return;
  }
  el.className = 'overlay aberta';
  const cfg = estado.config;
  const atual = ui[o.alvo];
  const comDados = new Set(o.alvo === 'mes'
    ? estado.lancamentos.map((l) => C.chaveMes(l.data))
    : C.gerarPagamentos(estado.lancamentos, cfg).map((p) => p.mesPagamento));
  const curtos = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  el.innerHTML = `
    <div class="fundo" data-acao="fecharOverlay"></div>
    <div class="folha calendario">
      <div class="folha-titulo">${o.alvo === 'mes' ? 'Mês trabalhado' : 'Mês de recebimento'}</div>
      <div class="cal-ano">
        <button class="ico-btn escuro" data-acao="calAno" data-d="-1" aria-label="Ano anterior">${ico('chevronLeft')}</button>
        <b>${o.ano}</b>
        <button class="ico-btn escuro" data-acao="calAno" data-d="1" aria-label="Próximo ano">${ico('chevronRight')}</button>
      </div>
      <div class="cal-meses">
        ${curtos.map((m, i) => {
          const ym = `${o.ano}-${String(i + 1).padStart(2, '0')}`;
          return `<button class="cal-mes ${ym === atual ? 'ativo' : ''} ${comDados.has(ym) ? 'com-dados' : ''}" data-acao="calMes" data-ym="${ym}">${m}</button>`;
        }).join('')}
      </div>
      <button class="btn largo" data-acao="calHoje">Ir para o mês atual</button>
    </div>`;
}

// ---------- primeiro uso ----------

const CREDITOS = 'Criado por <b>Lucio Carvalho</b> — SD PM Messias';

function telaWizard() {
  const w = ui.wiz ??= S.configPadrao();
  return `
    <div class="wizard">
      <div class="marca grande">HORAS <span>PAGA</span></div>
      <p class="sub">Controle suas horas de Extraordinária, SINFRA e Delegada e saiba quanto e quando vai receber.</p>
      <p class="sub pequeno">Seus dados ficam só neste celular. Nada é enviado para a internet.</p>
      <label class="campo">QRA
        <input data-wiz="qra" value="${esc(w.qra)}" autocomplete="off" autocapitalize="characters" maxlength="30">
      </label>
      <div class="rotulo">Posto / graduação</div>
      <div class="grade-postos">
        ${POSTOS.map((p) => `<button class="chip ${w.posto === p.id ? 'ativo' : ''}" data-acao="wizPosto" data-posto="${p.id}">${p.nome}</button>`).join('')}
      </div>
      <button class="btn primario largo" data-acao="wizConcluir">Começar</button>

      <div class="restaurar">
        <div class="rotulo">Já usava o app neste ou em outro celular?</div>
        ${ui.copiaEncontrada ? `
          <div class="alerta">Encontramos uma cópia de segurança com <b>${ui.copiaEncontrada.lancamentos.length}</b> lançamentos
            (${esc([ui.copiaEncontrada.config.posto, ui.copiaEncontrada.config.qra].filter(Boolean).join(' '))}).
            <button class="btn primario largo" data-acao="restaurarCopia">Restaurar esses dados</button></div>` : ''}
        <label class="btn largo">Restaurar meus dados<input type="file" id="arquivoRestaurar" hidden></label>
        <p class="mini">${Copia.disponivel()
          ? 'Toque acima e escolha o arquivo <b>horas-paga-backup</b> <b>mais recente</b> na pasta <b>Documentos › HorasPaga</b> do celular (no seletor: menu ☰ › armazenamento do celular › Documents › HorasPaga), ou um backup que você exportou.'
          : 'Toque acima e escolha o backup que você exportou (no iPhone, normalmente no <b>iCloud Drive</b> ou no app <b>Arquivos</b>).'}</p>
      </div>
      <div class="creditos">${CREDITOS}</div>
    </div>`;
}

// ---------- tela inicial ----------

// Primeiro mês, a partir do atual, com pagamento ainda não recebido (horas de um mês caem no seguinte).
function proximoMesComPagamento() {
  const atual = C.chaveMes(hoje());
  const meses = C.gerarPagamentos(estado.lancamentos, estado.config)
    .filter((p) => p.mesPagamento >= atual && !recebido(p.id))
    .map((p) => p.mesPagamento)
    .sort();
  return meses[0] ?? atual;
}

function telaInicio() {
  const cfg = estado.config;
  const ym = (ui.mesRec ??= proximoMesComPagamento());
  const anterior = C.somarMeses(ym, -1);
  const todos = C.gerarPagamentos(estado.lancamentos, cfg);
  const pags = todos.filter((p) => p.mesPagamento === ym);
  // mês vazio: oferece atalho para o mês com pagamento mais próximo
  const outros = [...new Set(todos.filter((p) => !recebido(p.id)).map((p) => p.mesPagamento))].sort();
  const atalho = pags.length ? null : (outros.find((m) => m > ym) ?? outros[outros.length - 1]);
  const comp = pags.filter((p) => p.credito === 'COMPLEMENTAR');
  const mensal = pags.filter((p) => p.credito === 'MENSAL');
  const deleg = pags.filter((p) => p.tipo === 'DELEGADA');
  const pad = (n) => String(n).padStart(2, '0');
  const j = cfg.janelaComplementar;
  const $ = valorVisivel;

  const ymHoje = C.chaveMes(hoje());
  const usadas = C.horasLimitadasNoMes(estado.lancamentos, ymHoje);
  const pct = Math.min(100, (usadas / C.LIMITE_MENSAL) * 100);

  return `
    <section class="destaque">
      <div class="destaque-topo">
        <div class="rotulo-claro">Total a receber em ${C.nomeMes(ym, true)}</div>
        <button class="ico-btn" data-acao="ocultarValores" aria-label="${cfg.ocultarValores ? 'Mostrar' : 'Ocultar'} valores">${ico(cfg.ocultarValores ? 'eyeOff' : 'eye')}</button>
      </div>
      <div class="valor-grande">${$(somaValores(pags))}</div>
      <div class="resumo-total">
        <div><small>Complementar</small><b>${$(somaValores(comp))}</b></div>
        <div><small>Mensal</small><b>${$(somaValores(mensal))}</b></div>
        <div><small>Delegadas</small><b>${$(somaValores(deleg))}</b></div>
      </div>
      ${atalho ? `<button class="btn largo atalho-mes" data-acao="irMesRec" data-ym="${atalho}">Você tem valores a receber em ${C.nomeMes(atalho, true)} — ver ›</button>` : ''}
    </section>

    <h2 class="titulo-secao">Lançamentos</h2>
    ${cartaoReceb('comp', 'calendarCheck', 'verde', 'Folha complementar',
      `Cai entre ${pad(j.inicio)} e ${pad(j.fim)}/${ym.slice(5, 7)} · Horas de 01 a 15/${anterior.slice(5, 7)}`, comp, 'Nada a receber nesta folha.')}
    ${cartaoReceb('mensal', 'calendarDays', 'azul', `Folha mensal de ${C.nomeMes(ym)}`,
      `Horas de 16 a ${C.diasNoMes(anterior)}/${anterior.slice(5, 7)}`, mensal, 'Nada a receber nesta folha.')}
    ${cartaoReceb('deleg', 'userPlus', 'roxo', 'Delegadas', `Pagas em ${C.nomeMes(ym)}, por cidade`, deleg,
      'Nenhuma delegada a receber neste mês.')}

    <section class="cartao medidor-cartao">
      <div class="medidor-topo"><span>Extra + SINFRA em ${C.nomeMes(ymHoje)}</span><b>${horas(usadas)} de ${C.LIMITE_MENSAL}h</b></div>
      <div class="medidor"><div class="medidor-barra ${usadas >= 40 ? 'alerta' : ''}" style="width:${pct}%"></div></div>
    </section>`;
}

const somaValores = (ps) => C.arred(ps.reduce((s, p) => s + p.valor, 0));
// No Início os valores podem ficar ocultos (botão do olho).
const valorVisivel = (v) => (estado.config.ocultarValores ? 'R$ ••••' : dinheiro(v));

// Cartão de um tipo de recebimento. Fechado: resumo; aberto: lançamentos com Editar/Excluir.
function cartaoReceb(chave, icone, cor, titulo, sub, itens, vazio) {
  const aberto = !!ui.abertos[chave];
  const ok = itens.length && itens.every((p) => recebido(p.id));
  const ids = new Set(itens.flatMap((p) => p.lancamentoIds));
  const ls = estado.lancamentos.filter((l) => ids.has(l.id)).sort((a, b) => (a.data < b.data ? -1 : 1));
  const resumo = itens.map((p) => (p.tipo === 'DELEGADA'
    ? `<span class="rec-linha"><b>${esc((p.municipio ?? 'Sem cidade').toUpperCase())}</b> · dia ${ddmm(p.dataPrevista)} · ${horas(p.horasPagas)}</span>`
    : `<span class="rec-linha"><span class="pill ${p.tipo}">${C.NOME_TIPO[p.tipo]}</span> ${horas(p.horasPagas)}</span>`)).join('');
  return `
    <section class="rec ${ok ? 'recebido' : ''}">
      <button class="rec-cab" data-acao="abrirCartao" data-chave="${chave}" ${itens.length ? '' : 'disabled'}>
        <span class="rec-ico ${cor}">${ico(icone)}</span>
        <span class="rec-txt">
          <span class="rec-tit">${titulo}</span>
          <span class="rec-sub">${sub}</span>
          ${itens.length ? resumo : `<span class="rec-sub">${vazio}</span>`}
        </span>
        <span class="rec-valor">${valorVisivel(somaValores(itens))}${ok ? `<small>${ico('check')} recebido</small>` : ''}</span>
        <span class="rec-chev ${aberto ? 'aberto' : ''}">${ico('chevronRight')}</span>
      </button>
      ${itens.length && !aberto ? `<button class="rec-link" data-acao="abrirCartao" data-chave="${chave}">Ver lançamentos (${ls.length})</button>` : ''}
      ${itens.length && aberto ? `
        <div class="rec-corpo">
          ${notasContracheque({ itens })}
          ${ls.map(linhaLancamento).join('')}
          ${botaoRecebido(itens)}
        </div>` : ''}
    </section>`;
}

function botaoRecebido(itens) {
  const ok = itens.every((p) => recebido(p.id));
  return `<button class="btn pequeno largo ${ok ? '' : 'contorno'}" data-acao="recebidoIds" data-ids="${esc(itens.map((p) => p.id).join(','))}">${ok ? `${ico('check')} Recebido` : 'Marcar como recebido'}</button>`;
}

function notasContracheque(g) {
  return g.itens
    .filter((p) => p.horasNoContracheque !== p.horasPagas)
    .map((p) => `<div class="nota">Contracheque (${C.NOME_TIPO[p.tipo]}) mostrará ${horas(p.horasNoContracheque)} — valor referente a ${horas(p.horasPagas)}</div>`)
    .join('');
}

// ---------- tela do mês (lançamentos por quinzena) ----------

function telaMes() {
  const ym = ui.mes;
  const r = C.resumoMes(estado.lancamentos, ym);
  const quinzena = (titulo, ls) => {
    const total = C.arred(ls.reduce((s, l) => s + l.horas * l.valorHora, 0));
    return `
      <section class="quinzena">
        <div class="q-cab"><b>${titulo}</b><span>${dinheiro(total)}</span></div>
        ${ls.length ? ls.map(linhaLancamento).join('') : '<p class="vazio-txt">Sem lançamentos.</p>'}
        <div class="q-rodape">${ico('calendarCheck')}<span>Total da quinzena</span><b>${dinheiro(total)}</b></div>
      </section>`;
  };
  return `
    <div class="tipos-resumo">
      ${C.TIPOS.map((t) => `
        <div class="tipo-card ${t}">
          <span class="tipo-nome">${C.NOME_TIPO[t]}</span>
          <b>${horas(r.total[t].horas)}</b>
          <small>${dinheiro(r.total[t].valor)}</small>
        </div>`).join('')}
    </div>
    <h2 class="titulo-secao">Quinzenas</h2>
    ${quinzena('1ª quinzena (01 a 15)', r.q1)}
    ${quinzena(`2ª quinzena (16 a ${C.diasNoMes(ym)})`, r.q2)}
    ${r.lancamentos.length ? `<button class="btn largo" data-acao="compartilhar">${ico('share')} Compartilhar resumo de ${C.nomeMes(ym)}</button>` : ''}`;
}

function linhaLancamento(l) {
  const cidade = l.tipo === 'DELEGADA' && l.municipio ? ` · ${esc(l.municipio.toUpperCase())}` : '';
  return `
    <div class="lanc">
      <div class="lanc-linha">
        <span class="lanc-dia">${ddmm(l.data)}</span>
        <span class="pill ${l.tipo}">${C.NOME_TIPO[l.tipo]}</span>
        <span class="lanc-h">${horas(l.horas)}${cidade}</span>
        <span class="lanc-valor">${dinheiro(C.valorLancamento(l))}</span>
      </div>
      ${l.observacao ? `<div class="lanc-obs">${esc(l.observacao)}</div>` : ''}
      <div class="lanc-acoes">
        <button class="btn-acao" data-acao="editar" data-id="${esc(l.id)}">${ico('pencil')} Editar</button>
        <button class="btn-acao perigo" data-acao="excluirDireto" data-id="${esc(l.id)}">${ico('trash')} Excluir</button>
      </div>
    </div>`;
}

function resumoTexto(ym) {
  const cfg = estado.config;
  const r = C.resumoMes(estado.lancamentos, ym);
  const ids = new Set(r.lancamentos.map((l) => l.id));
  const pags = C.agruparPorCredito(C.gerarPagamentos(estado.lancamentos, cfg)
    .filter((p) => p.origem.mes === ym || (p.origem.mes === null && p.lancamentoIds.some((id) => ids.has(id)))));
  const linhas = [`*HORAS PAGA — ${C.nomeMes(ym, true)}*`];
  const quem = [cfg.posto, cfg.qra].filter(Boolean).join(' ');
  if (quem) linhas.push(quem);
  linhas.push('');
  for (const t of C.TIPOS) {
    if (!r.total[t].horas) continue;
    linhas.push(`${C.NOME_TIPO[t]}: ${horas(r.total[t].horas)} — ${dinheiro(r.total[t].valor)}`);
    linhas.push(`  1ª quinzena ${horas(r.subQ1[t].horas)} | 2ª quinzena ${horas(r.subQ2[t].horas)}`);
  }
  const limitadas = r.total.EXTRA.horas + r.total.SINFRA.horas;
  if (limitadas) linhas.push(`Extra + SINFRA: ${horas(limitadas)} de ${C.LIMITE_MENSAL}h`);
  if (pags.length) {
    linhas.push('', '*Pagamentos previstos*');
    for (const g of pags) {
      linhas.push(`• ${g.rotulo} (${textoData(g)}): ${dinheiro(g.valor)}`);
      for (const p of g.itens) {
        if (p.horasNoContracheque !== p.horasPagas) {
          linhas.push(`  Contracheque mostrará ${horas(p.horasNoContracheque)} de ${C.NOME_TIPO[p.tipo]} — valor de ${horas(p.horasPagas)}`);
        }
      }
    }
  }
  linhas.push('', '_Valores estimados. Confira sempre o contracheque oficial._');
  return linhas.join('\n');
}

// ---------- ajustes ----------

function telaAjustes() {
  const cfg = estado.config;
  const confirma = (id, texto, botao) => ui.confirmar === id ? `
    <div class="confirmacao">${texto}
      <div class="linha-btns"><button class="btn" data-acao="cancelarConfirma">Cancelar</button>
      <button class="btn perigo" data-acao="${id}" data-confirmado="1">${botao}</button></div>
    </div>` : '';

  return `
    <h3 class="secao">Seus dados</h3>
    <section class="cartao base-calculo">
      <label class="campo">QRA
        <input data-campo="qra" value="${esc(cfg.qra)}" maxlength="30" autocomplete="off" autocapitalize="characters">
      </label>
      <label class="campo">Posto / graduação
        <select data-campo="posto">${POSTOS.map((p) => `<option value="${p.id}" ${cfg.posto === p.id ? 'selected' : ''}>${p.nome}</option>`).join('')}</select>
      </label>
    </section>

    <h3 class="secao">Valor da hora</h3>
    <section class="cartao">
      <table class="tabela-hora">
        <thead><tr><th>Posto / graduação</th><th>Valor da hora (R$)</th></tr></thead>
        <tbody>${FAIXAS.map((f) => {
          const alterado = cfg.valoresHora[f.id];
          const valor = alterado ?? C.arred(valorHoraOficial(f.id));
          return `<tr class="${faixaDoPosto(cfg.posto).id === f.id ? 'meu' : ''}"><td>${f.nome}</td>
            <td><input inputmode="decimal" data-hora="${f.id}" value="${valorCampo(valor)}"></td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="mini">Tabela oficial a partir de ${VIGENCIA}. Quando sair tabela nova, altere o valor aqui. Vale para os próximos lançamentos; os já feitos guardam o valor da época.</p>
      ${Object.keys(cfg.valoresHora).length ? '<button class="btn contorno" data-acao="restaurarHoras">Voltar à tabela oficial</button>' : ''}
    </section>

    <h3 class="secao">Datas de pagamento</h3>
    <section class="cartao">
      <p class="mini">1ª quinzena (01 a 15) → folha complementar. 2ª quinzena (16 ao fim do mês) → folha mensal do mês seguinte.</p>
      <div class="rotulo">Janela da folha complementar (mês seguinte)</div>
      <div class="duas">
        <label class="campo">Do dia <input type="number" min="1" max="31" data-campo="janelaInicio" value="${cfg.janelaComplementar.inicio}"></label>
        <label class="campo">Ao dia <input type="number" min="1" max="31" data-campo="janelaFim" value="${cfg.janelaComplementar.fim}"></label>
      </div>
    </section>

    <h3 class="secao">Delegada</h3>
    <section class="cartao">
      <p class="mini">Cada município tem seu dia de fechamento. A Delegada é paga nesse dia, referente ao período
        do mesmo dia do mês anterior até a véspera. ${exemploDelegada(C.DIA_DELEGADA_PADRAO)}</p>
      <div class="rotulo">Municípios</div>
      ${cfg.favoritos.length ? cfg.favoritos.map((f, i) => `
        <div class="fav"><span>${esc(f.municipio)}<small>fecha dia ${f.diaFechamento ?? C.DIA_DELEGADA_PADRAO}</small></span><b>${dinheiro(f.valorHora)}/h</b>
        <button class="btn pequeno" data-acao="removerFav" data-i="${i}" aria-label="Remover">✕</button></div>`).join('')
        : '<p class="vazio-txt">Nenhuma ainda. Cadastre aqui as cidades onde você faz Delegada.</p>'}
      <label class="campo">Município <input id="favMun" maxlength="40" autocomplete="off"></label>
      <div class="duas">
        <label class="campo">R$/hora <input id="favValor" inputmode="decimal"></label>
        <label class="campo">Dia de fechamento <input id="favDia" type="number" min="1" max="31" inputmode="numeric" placeholder="ex.: 20"></label>
      </div>
      <button class="btn contorno" data-acao="addFav">Adicionar município</button>
    </section>

    <h3 class="secao">Backup</h3>
    <section class="cartao">
      ${Copia.disponivel() ? `
        <div class="copia-ok">${ico('check')}<div><b>Cópia automática ativa</b>
          <small>Arquivo: ${esc(Copia.PASTA)}/${esc(Copia.arquivoAtual().split('/').pop())}</small>
          <small>Última cópia: ${Copia.ultimaCopia() ? new Date(Copia.ultimaCopia()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'aguardando o próximo salvamento'}</small></div></div>
        <p class="mini">Essa cópia fica fora do app: continua no celular mesmo se o app for desinstalado. Se perder ou trocar de celular, só o backup exportado (Drive, WhatsApp, e-mail) salva os dados.</p>`
      : '<p class="mini">Os dados ficam só neste celular. Antes de trocar de aparelho ou limpar o navegador, exporte o backup e guarde o arquivo (Drive, WhatsApp, e-mail).</p>'}
      <div class="linha-btns">
        <button class="btn" data-acao="exportar">Exportar backup</button>
        <label class="btn">Importar backup<input type="file" id="arquivoBackup" hidden></label>
      </div>
      ${ui.importPendente ? `
        <div class="confirmacao">Substituir os <b>${estado.lancamentos.length}</b> lançamentos atuais pelos <b>${ui.importPendente.lancamentos.length}</b> do backup?
          <div class="linha-btns"><button class="btn" data-acao="cancelarImport">Cancelar</button>
          <button class="btn perigo" data-acao="confirmarImport">Substituir</button></div>
        </div>` : ''}
    </section>

    <h3 class="secao">Zona de perigo</h3>
    <section class="cartao">
      ${ui.confirmar === 'apagarTudo' ? confirma('apagarTudo', `Apagar todos os ${estado.lancamentos.length} lançamentos e configurações deste celular? Não dá para desfazer.`, 'Apagar tudo')
        : '<button class="btn perigo contorno" data-acao="apagarTudo">Apagar todos os dados</button>'}
    </section>
    <div class="creditos">${CREDITOS}<small>HORAS PAGA · funciona sem internet</small></div>`;
}

// Texto explicativo da regra da Delegada para o dia configurado (ex.: 20/03 a 19/04 → paga 20/04).
function exemploDelegada(dia) {
  const d = String(dia).padStart(2, '0');
  const fim = dia > 1 ? `${String(dia - 1).padStart(2, '0')}/04` : '31/03';
  return `Ex.: fechamento dia ${dia} → ${d}/03 a ${fim} é pago em ${d}/04.`;
}

const diaValido = (v) => Number.isInteger(v) && v >= 1 && v <= 31;

// ---------- folha de lançamento ----------

function abrirLancamento(l) {
  ui.form = l
    ? { ...l, horas: l.horas, municipio: l.municipio ?? '', observacao: l.observacao ?? '', diaFechamento: l.diaFechamento ?? C.DIA_DELEGADA_PADRAO, original: l, confirmaExcluir: false }
    : { id: null, tipo: null, data: hoje(), horas: null, valorHora: null, municipio: '', observacao: '', diaFechamento: null, confirmaExcluir: false };
  renderSheet();
}

function fecharLancamento() {
  ui.form = null;
  renderSheet();
}

function escolherTipo(tipo) {
  const f = ui.form;
  f.tipo = tipo;
  if (tipo === 'DELEGADA') {
    // valor/h e dia de fechamento vêm do cadastro da cidade (Ajustes); na edição, mantém os do lançamento
    if (f.original?.tipo !== 'DELEGADA') {
      const fav = estado.config.favoritos[0];
      f.municipio = fav?.municipio ?? '';
      f.valorHora = fav?.valorHora ?? null;
      f.diaFechamento = fav?.diaFechamento ?? C.DIA_DELEGADA_PADRAO;
    }
  } else {
    f.valorHora = f.original?.tipo === tipo ? f.original.valorHora : valorTabela(tipo);
  }
  renderSheet();
}

function renderSheet() {
  const el = document.getElementById('sheet');
  const f = ui.form;
  if (!f || !estado.config) {
    el.classList.remove('aberta');
    el.innerHTML = '';
    return;
  }
  el.classList.add('aberta');

  if (!f.tipo) {
    el.innerHTML = `
      <div class="fundo" data-acao="fecharSheet"></div>
      <div class="folha">
        <div class="folha-titulo">O que você trabalhou?</div>
        <div class="tipos">
          <button class="tipo-btn EXTRA" data-acao="tipo" data-tipo="EXTRA">Extraordinária<small>${dinheiro(valorTabela('EXTRA'))}/h</small></button>
          <button class="tipo-btn SINFRA" data-acao="tipo" data-tipo="SINFRA">SINFRA<small>${dinheiro(valorTabela('SINFRA'))}/h</small></button>
          <button class="tipo-btn DELEGADA" data-acao="tipo" data-tipo="DELEGADA">Delegada<small>valor por município</small></button>
        </div>
        <button class="btn largo" data-acao="fecharSheet">Cancelar</button>
      </div>`;
    return;
  }

  const cfg = estado.config;
  const delegada = f.tipo === 'DELEGADA';
  el.innerHTML = `
    <div class="fundo" data-acao="fecharSheet"></div>
    <div class="folha">
      <div class="folha-cab">
        <button class="tag grande ${f.tipo}" data-acao="trocarTipo">${C.NOME_TIPO[f.tipo]} ▾</button>
        <span class="folha-titulo-p">${f.id ? 'Editar lançamento' : 'Novo lançamento'}</span>
      </div>
      <div class="rotulo">Data</div>
      <div class="data-linha">
        <input id="f-data" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" autocomplete="off" value="${isoParaBr(f.data)}">
        <button class="btn-cal ${f.calAberto ? 'ativo' : ''}" data-acao="fCal" aria-label="Escolher no calendário">${ico('calendar')}</button>
        <button class="chip" data-acao="dataRapida" data-dias="0">Hoje</button>
        <button class="chip" data-acao="dataRapida" data-dias="-1">Ontem</button>
      </div>
      <div id="f-data-info" class="data-info"></div>
      ${f.calAberto ? miniCalendario(f) : ''}
      <div class="rotulo">Horas</div>
      <div class="rapidos">
        ${[6, 8, 12].map((h) => `<button class="chip grande ${f.horas === h ? 'ativo' : ''}" data-acao="horas" data-h="${h}">${h}h</button>`).join('')}
        <input id="f-horas" inputmode="decimal" placeholder="outra" value="${f.horas && ![6, 8, 12].includes(f.horas) ? String(f.horas).replace('.', ',') : ''}">
      </div>
      ${delegada ? (cfg.favoritos.length ? `
        <div class="rotulo">Cidade</div>
        <div class="favs">
          ${cfg.favoritos.map((fv, i) => `<button class="chip grande ${f.municipio === fv.municipio ? 'ativo' : ''}" data-acao="fav" data-i="${i}">${esc(fv.municipio)}</button>`).join('')}
        </div>` : `
        <div class="alerta">Nenhuma cidade cadastrada. Cadastre a cidade, o valor da hora e o dia de fechamento em Ajustes.
          <button class="btn pequeno contorno" data-acao="irAjustes">Ir para Ajustes</button></div>`) : `<div class="mini">Valor da hora: ${dinheiro(f.valorHora)} ${f.original?.tipo === f.tipo ? '(guardado no lançamento)' : `(${esc(nomePosto(cfg.posto))})`}</div>`}
      <label class="campo">Observação (opcional) <input id="f-obs" value="${esc(f.observacao)}" maxlength="80" autocomplete="off"></label>
      <div class="previa">
        <div id="f-preview" class="previa-valor"></div>
        <div id="f-limite" class="previa-limite"></div>
      </div>
      ${f.confirmaExcluir ? `
        <div class="confirmacao">Excluir este lançamento?
          <div class="linha-btns"><button class="btn" data-acao="cancelarExcluir">Não</button>
          <button class="btn perigo" data-acao="confirmarExcluir">Sim, excluir</button></div>
        </div>` : `
        <div class="linha-btns">
          ${f.id ? '<button class="btn perigo contorno" data-acao="excluir">Excluir</button>' : '<button class="btn" data-acao="fecharSheet">Cancelar</button>'}
          <button class="btn primario" id="f-salvar" data-acao="salvarLanc">Salvar</button>
        </div>`}
    </div>`;
  atualizarPrevia();
}

// Calendário do mês para escolher a data com um toque (pontinho = dia que já tem lançamento).
function miniCalendario(f) {
  const ym = f.calMes;
  const [y, m] = ym.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const comLanc = new Set(estado.lancamentos.map((l) => l.data));
  const celulas = Array.from({ length: new Date(y, m - 1, 1).getDay() }, () => '<span></span>');
  for (let d = 1; d <= C.diasNoMes(ym); d++) {
    const iso = `${ym}-${pad(d)}`;
    celulas.push(`<button class="dia ${iso === f.data ? 'ativo' : ''} ${iso === hoje() ? 'hoje' : ''} ${comLanc.has(iso) ? 'com-lanc' : ''}" data-acao="fCalDia" data-data="${iso}">${d}</button>`);
  }
  return `
    <div class="mini-cal">
      <div class="mini-cal-cab">
        <button class="ico-btn escuro" data-acao="fCalMes" data-d="-1" aria-label="Mês anterior">${ico('chevronLeft')}</button>
        <b>${C.nomeMes(ym, true)}</b>
        <button class="ico-btn escuro" data-acao="fCalMes" data-d="1" aria-label="Próximo mês">${ico('chevronRight')}</button>
      </div>
      <div class="mini-cal-sem">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((s) => `<span>${s}</span>`).join('')}</div>
      <div class="mini-cal-dias">${celulas.join('')}</div>
    </div>`;
}

// Valida o formulário e atualiza valor/limite sem redesenhar (mantém o foco do teclado).
function validarForm() {
  const f = ui.form;
  if (!f.data) return { ok: false, msg: 'Informe a data: digite o dia (ex.: 14) ou escolha no calendário.' };
  if (!(f.horas > 0)) return { ok: false, msg: 'Escolha a quantidade de horas.' };
  if (f.horas > 24) return { ok: false, msg: 'Máximo de 24h por lançamento.' };
  if (f.tipo === 'DELEGADA' && !f.municipio) return { ok: false, msg: 'Escolha a cidade.' };
  if (f.tipo === 'DELEGADA' && !(f.valorHora > 0)) return { ok: false, msg: 'Cidade sem valor da hora. Ajuste em Ajustes.' };
  if (f.tipo !== 'DELEGADA') {
    const ym = C.chaveMes(f.data);
    const restam = C.horasRestantes(estado.lancamentos, ym, f.id);
    if (f.horas > restam) {
      return { ok: false, limite: true, msg: `Ultrapassa o limite de ${C.LIMITE_MENSAL}h de Extra + SINFRA. Cabem só ${horas(restam)} em ${C.nomeMes(ym)}.` };
    }
  }
  return { ok: true };
}

function atualizarPrevia() {
  const f = ui.form;
  const prev = document.getElementById('f-preview');
  if (!f || !prev) return;
  const v = validarForm();
  const info = document.getElementById('f-data-info');
  if (info) info.textContent = f.data ? dataPorExtenso(f.data) : 'Digite o dia (ex.: 14) ou escolha no calendário';
  prev.textContent = f.horas > 0 && f.valorHora > 0 ? `${horas(f.horas)} × ${dinheiro(f.valorHora)} = ${dinheiro(f.horas * f.valorHora)}` : '—';

  const lim = document.getElementById('f-limite');
  if (v.limite) {
    lim.textContent = v.msg;
    lim.className = 'previa-limite erro';
  } else if (f.tipo !== 'DELEGADA' && f.data) {
    const ym = C.chaveMes(f.data);
    const restam = C.horasRestantes(estado.lancamentos, ym, f.id);
    const depois = Math.max(0, restam - (f.horas || 0));
    lim.textContent = `Restam ${horas(restam)} de ${C.LIMITE_MENSAL}h em ${C.nomeMes(ym)}${f.horas ? ` (ficarão ${horas(depois)})` : ''}`;
    lim.className = 'previa-limite';
  } else if (f.tipo === 'DELEGADA' && f.data && v.ok) {
    lim.textContent = `Pagamento previsto: ${ddmmaa(C.pagamentoDelegada(f.data, f.diaFechamento))} (fecha dia ${f.diaFechamento})`;
    lim.className = 'previa-limite';
  } else {
    lim.textContent = v.ok ? '' : v.msg;
    lim.className = 'previa-limite';
  }
  const salvar = document.getElementById('f-salvar');
  if (salvar) salvar.disabled = !v.ok;
  document.querySelectorAll('.rapidos [data-h]').forEach((b) => b.classList.toggle('ativo', Number(b.dataset.h) === f.horas));
}

function salvarLancamento() {
  const f = ui.form;
  const v = validarForm();
  if (!v.ok) { toast(v.msg); return; }
  const l = {
    id: f.id ?? S.novoId(),
    data: f.data,
    tipo: f.tipo,
    horas: Math.round(f.horas * 100) / 100,
    // Extra/SINFRA guardam o valor/h exato (sem arredondar), para bater com a folha.
    valorHora: f.tipo === 'DELEGADA' ? C.arred(f.valorHora) : f.valorHora,
    criadoEm: f.original?.criadoEm ?? Date.now(),
  };
  if (f.observacao.trim()) l.observacao = f.observacao.trim();
  if (f.tipo === 'DELEGADA') {
    l.diaFechamento = f.diaFechamento;
    if (f.municipio.trim()) l.municipio = f.municipio.trim();
  }
  const i = estado.lancamentos.findIndex((x) => x.id === l.id);
  if (i >= 0) estado.lancamentos[i] = l; else estado.lancamentos.push(l);
  persistir();
  ui.form = null;
  // leva o Início ao mês em que este lançamento será pago
  const pag = C.gerarPagamentos(estado.lancamentos, estado.config).find((p) => p.lancamentoIds.includes(l.id));
  if (pag) mudarMes('mesRec', pag.mesPagamento);
  const quando = pag ? ` · recebe em ${C.nomeMes(pag.mesPagamento, true)}` : '';
  toast(`${i >= 0 ? 'Atualizado' : 'Lançado'}: ${horas(l.horas)} ${C.NOME_TIPO[l.tipo]} — ${dinheiro(C.valorLancamento(l))}${quando}`);
  render();
}

function lembrarMunicipio(municipio, valorHora, diaFechamento) {
  const favs = estado.config.favoritos;
  const existente = favs.find((x) => x.municipio.toLowerCase() === municipio.toLowerCase());
  if (existente) Object.assign(existente, { valorHora, diaFechamento });
  else favs.push({ municipio, valorHora, diaFechamento });
}

// ---------- ações ----------

// Início e aba Mês mostram sempre o mesmo mês: trocar em uma troca na outra.
// Ao mudar de mês, fecha os cartões abertos do Início.
function mudarMes(alvo, ym) {
  if (ym !== ui.mesRec) ui.abertos = {};
  ui.mesRec = ym;
  ui.mes = ym;
}

// Marca (ou desmarca, se todos já estavam) um conjunto de pagamentos como recebidos.
function marcarRecebidos(ids) {
  const marcar = !ids.every(recebido);
  for (const id of ids) {
    if (marcar) estado.config.recebidos[id] = hoje();
    else delete estado.config.recebidos[id];
  }
  persistir();
  render();
}

// Quando roda como APK (Capacitor), usa os plugins nativos de compartilhar e arquivos.
const nativo = () => !!window.Capacitor?.isNativePlatform?.();
const plugin = (nome) => window.Capacitor?.Plugins?.[nome];

async function compartilhar() {
  const texto = resumoTexto(ui.mes);
  if (nativo()) {
    try { await plugin('Share').share({ text: texto, dialogTitle: 'Compartilhar resumo' }); } catch { /* cancelado */ }
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ text: texto }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

async function copiarResumo() {
  try {
    await navigator.clipboard.writeText(resumoTexto(ui.mes));
    toast('Resumo copiado.');
  } catch {
    toast('Não foi possível copiar.');
  }
}

async function exportarBackup() {
  const nome = `horas-paga-backup-${hoje()}.json`;
  if (nativo()) {
    try {
      const { uri } = await plugin('Filesystem').writeFile({
        path: nome, data: S.gerarBackup(estado), directory: 'CACHE', encoding: 'utf8',
      });
      await plugin('Share').share({ title: nome, files: [uri], dialogTitle: 'Salvar backup em…' });
    } catch (e) {
      if (!/cancel/i.test(e?.message ?? '')) toast('Não foi possível exportar o backup.');
    }
    return;
  }
  // iPhone/iPad: abre o compartilhar do sistema (salvar no iCloud Drive / Arquivos / WhatsApp)
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    const arquivo = new File([S.gerarBackup(estado)], nome, { type: 'application/json' });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
  }
  const blob = new Blob([S.gerarBackup(estado)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exportado. Guarde o arquivo em local seguro.');
}

const acoes = {
  aba: (b) => {
    ui.tela = b.dataset.tela;
    ui.confirmar = null;
    if (ui.mesRec) ui.mes = ui.mesRec; // a aba Mês acompanha o mês escolhido no Início
    render();
    window.scrollTo(0, 0);
  },
  lancar: () => abrirLancamento(null),
  fecharSheet: fecharLancamento,
  tipo: (b) => escolherTipo(b.dataset.tipo),
  trocarTipo: () => { ui.form.tipo = null; renderSheet(); },
  dataRapida: (b) => {
    ui.form.data = diasAPartirDeHoje(Number(b.dataset.dias));
    ui.form.calAberto = false;
    renderSheet();
  },
  fCal: () => {
    const f = ui.form;
    f.calAberto = !f.calAberto;
    f.calMes = C.chaveMes(f.data || hoje());
    renderSheet();
  },
  fCalMes: (b) => { ui.form.calMes = C.somarMeses(ui.form.calMes, Number(b.dataset.d)); renderSheet(); },
  fCalDia: (b) => { ui.form.data = b.dataset.data; ui.form.calAberto = false; renderSheet(); },
  horas: (b) => {
    ui.form.horas = Number(b.dataset.h);
    const campo = document.getElementById('f-horas');
    if (campo) campo.value = '';
    atualizarPrevia();
  },
  fav: (b) => {
    const fv = estado.config.favoritos[Number(b.dataset.i)];
    ui.form.municipio = fv.municipio;
    ui.form.valorHora = fv.valorHora;
    ui.form.diaFechamento = fv.diaFechamento ?? C.DIA_DELEGADA_PADRAO;
    renderSheet();
  },
  salvarLanc: salvarLancamento,
  editar: (b) => {
    const l = estado.lancamentos.find((x) => x.id === b.dataset.id);
    if (l) abrirLancamento(l);
  },
  excluir: () => { ui.form.confirmaExcluir = true; renderSheet(); },
  // abre o lançamento já pedindo a confirmação de exclusão
  excluirDireto: (b) => {
    const l = estado.lancamentos.find((x) => x.id === b.dataset.id);
    if (!l) return;
    abrirLancamento(l);
    ui.form.tipo = l.tipo;
    ui.form.confirmaExcluir = true;
    renderSheet();
  },
  cancelarExcluir: () => { ui.form.confirmaExcluir = false; renderSheet(); },
  confirmarExcluir: () => {
    estado.lancamentos = estado.lancamentos.filter((x) => x.id !== ui.form.id);
    persistir();
    ui.form = null;
    toast('Lançamento excluído.');
    render();
  },
  recebidoIds: (b) => marcarRecebidos(b.dataset.ids.split(',')),
  irMesRec: (b) => { mudarMes('mesRec', b.dataset.ym); render(); },
  abrirCartao: (b) => { ui.abertos[b.dataset.chave] = !ui.abertos[b.dataset.chave]; render(); },
  ocultarValores: () => { estado.config.ocultarValores = !estado.config.ocultarValores; persistir(); render(); },
  recAnt: () => { mudarMes('mesRec', C.somarMeses(ui.mesRec, -1)); render(); },
  recProx: () => { mudarMes('mesRec', C.somarMeses(ui.mesRec, 1)); render(); },
  abrirCalendario: (b) => {
    const alvo = b.dataset.alvo;
    ui.overlay = { tipo: 'calendario', alvo, ano: Number(ui[alvo].slice(0, 4)) };
    renderOverlay();
  },
  calAno: (b) => { ui.overlay.ano += Number(b.dataset.d); renderOverlay(); },
  calMes: (b) => { mudarMes(ui.overlay.alvo, b.dataset.ym); ui.overlay = null; render(); },
  calHoje: () => { mudarMes(ui.overlay.alvo, C.chaveMes(hoje())); ui.overlay = null; render(); },
  fecharOverlay: () => { ui.overlay = null; renderOverlay(); },
  irAjustes: () => { ui.form = null; ui.tela = 'ajustes'; render(); window.scrollTo(0, 0); },
  compartilhar,
  copiarResumo,

  wizPosto: (b) => { ui.wiz.posto = b.dataset.posto; render(); },
  wizConcluir: () => {
    ui.wiz.qra = ui.wiz.qra.trim().toUpperCase();
    if (!ui.wiz.qra) { toast('Informe seu QRA.'); return; }
    estado.config = ui.wiz;
    ui.wiz = null;
    persistir();
    S.pedirPersistencia();
    toast('Pronto! Agora é só lançar suas horas.');
    render();
  },

  apagarTudo: (b) => {
    if (!b.dataset.confirmado) { ui.confirmar = 'apagarTudo'; render(); return; }
    estado.config = null;
    estado.lancamentos = [];
    persistir();
    Object.assign(ui, { tela: 'inicio', confirmar: null, wiz: null, mesRec: null });
    render();
  },
  restaurarHoras: () => {
    estado.config.valoresHora = {};
    persistir();
    toast('Tabela oficial restaurada.');
    render();
  },
  cancelarConfirma: () => { ui.confirmar = null; render(); },
  addFav: () => {
    const mun = document.getElementById('favMun').value.trim();
    const valor = num(document.getElementById('favValor').value);
    const dia = Number(document.getElementById('favDia').value);
    if (!mun || !(valor > 0) || !diaValido(dia)) { toast('Informe município, valor da hora e dia de fechamento.'); return; }
    lembrarMunicipio(mun, valor, dia);
    persistir();
    render();
  },
  removerFav: (b) => {
    estado.config.favoritos.splice(Number(b.dataset.i), 1);
    persistir();
    render();
  },
  exportar: exportarBackup,
  cancelarImport: () => { ui.importPendente = null; render(); },
  restaurarCopia: () => restaurar(ui.copiaEncontrada),
  confirmarImport: () => {
    estado.config = ui.importPendente.config;
    estado.lancamentos = ui.importPendente.lancamentos;
    ui.importPendente = null;
    ui.mesRec = null;
    persistir();
    toast('Backup importado.');
    render();
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b || b.disabled) return;
  acoes[b.dataset.acao]?.(b);
});

// Digitação na folha de lançamento e no assistente: atualiza estado sem redesenhar.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (ui.form && t.id?.startsWith('f-')) {
    const f = ui.form;
    if (t.id === 'f-data') {
      t.value = mascaraData(t.value);
      f.data = completarData(t.value, f.calMes ?? C.chaveMes(hoje()));
    }
    else if (t.id === 'f-horas') f.horas = t.value ? num(t.value) : null;
    else if (t.id === 'f-obs') f.observacao = t.value;
    atualizarPrevia();
    return;
  }
  if (ui.wiz && t.dataset.wiz) {
    const w = ui.wiz;
    const k = t.dataset.wiz;
    w[k] = t.value;
  }
});

// Ajustes: grava quando o campo perde o foco / muda.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-data' && ui.form?.data) {
    t.value = isoParaBr(ui.form.data);
    return;
  }
  if (t.id === 'arquivoRestaurar') {
    t.files?.[0]?.text().then((txt) => {
      try {
        restaurar(S.lerBackup(txt));
      } catch (err) {
        toast(err.message);
      }
    });
    return;
  }
  if (t.id === 'arquivoBackup') {
    const arq = t.files?.[0];
    if (!arq) return;
    arq.text().then((txt) => {
      try {
        ui.importPendente = S.lerBackup(txt);
      } catch (err) {
        toast(err.message);
      }
      render();
    });
    return;
  }
  const cfg = estado.config;
  if (!cfg) return;
  if (t.dataset.hora) {
    const faixa = t.dataset.hora;
    const v = num(t.value);
    if (!(v > 0)) toast('Informe um valor da hora válido.');
    // Igual ao oficial arredondado: mantém o valor exato da folha (não perde centavos).
    else if (v === C.arred(valorHoraOficial(faixa))) delete cfg.valoresHora[faixa];
    else cfg.valoresHora[faixa] = v;
    persistir();
    render();
    return;
  }
  const campo = t.dataset.campo;
  if (!campo) return;
  if (campo === 'janelaInicio' || campo === 'janelaFim') {
    const dia = Math.min(31, Math.max(1, Math.round(num(t.value)) || 1));
    cfg.janelaComplementar[campo === 'janelaInicio' ? 'inicio' : 'fim'] = dia;
    if (cfg.janelaComplementar.fim < cfg.janelaComplementar.inicio) cfg.janelaComplementar.fim = cfg.janelaComplementar.inicio;
  } else if (campo === 'qra') cfg.qra = t.value.trim().toUpperCase();
  else cfg[campo] = t.value;
  persistir();
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.overlay) { ui.overlay = null; renderOverlay(); } else if (e.key === 'Escape' && ui.form) fecharLancamento();
});

// Repinta ao voltar para o app (a data de "hoje" pode ter mudado).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !ui.form) render();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !nativo()) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW não registrado', e));
}

render();

// Primeiro uso: procura cópia de segurança deixada por uma instalação anterior.
// Já configurado: grava a cópia (garante que exista mesmo em quem atualizou o app).
if (!estado.config) {
  Copia.lerCopia().then((dados) => {
    if (dados && !estado.config) { ui.copiaEncontrada = dados; render(); }
  });
} else {
  Copia.agendarCopia(estado, () => {});
}
