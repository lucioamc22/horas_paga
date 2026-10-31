# HORAS PAGA

App para o policial militar controlar as horas de **Extraordinária, SINFRA e Delegada**
e saber quanto vai receber e em que folha (complementar, mensal ou Delegada por município).
Sem servidor: os dados ficam só no celular.

Criado por Lucio Carvalho — SD PM Messias.

## Usar

- **Site / iPhone:** https://lucioamc22.github.io/horas_paga/
  - No iPhone: abra no **Safari** → Compartilhar → **Adicionar à Tela de Início**.
    Use sempre pelo ícone da Tela de Início (assim o iPhone não apaga os dados).
  - Faça "Exportar backup" de vez em quando e guarde no iCloud Drive.
- **Android:** instale o APK gerado por `scripts\gerar-apk.ps1` (pasta `apk-gerados`, fora do git).
  No APK há cópia automática em `Documentos/HorasPaga`, que sobrevive à desinstalação.

## Estrutura
- `index.html`, `css/app.css`, `js/icones.js`: telas e visual
- `js/calculo.js`: regras de pagamento (limite 50h, quinzenas, complementar/mensal, Delegada por dia de fechamento), funções puras
- `js/tabela.js`: postos e tabela oficial do valor da hora (jan/2026, LC 723/2022)
- `js/storage.js`: dados locais e backup JSON; `js/copia.js`: cópia automática (só APK)
- `js/app.js`: telas, lançamento, ajustes
- `sw.js`: funciona offline. **Ao alterar qualquer arquivo, aumente `VERSAO`.**
- `android/`: projeto Capacitor do APK

## Desenvolver
```
npm test          # testes do motor de cálculo
npm run serve     # http://localhost:8080
powershell -ExecutionPolicy Bypass -File scripts\gerar-apk.ps1   # APK + instala no emulador
```
