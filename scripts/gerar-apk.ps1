# Gera o APK de teste (debug) do HORAS PAGA e, se houver emulador/celular conectado, instala.
# Uso (na pasta HORA PAGA PM):  powershell -ExecutionPolicy Bypass -File scripts\gerar-apk.ps1
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Push-Location $raiz
try {
    node scripts/copiar-web.mjs
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Falha no cap sync." }
    Push-Location android
    try {
        # --no-daemon: o daemon do Gradle segura a saída do terminal e o script não termina
        & .\gradlew.bat assembleDebug --console=plain --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Falha no build (veja acima)." }
    } finally { Pop-Location }
} finally {
    Pop-Location
}

$saida = Join-Path $raiz "apk-gerados"
New-Item -ItemType Directory -Force $saida | Out-Null
$destino = Join-Path $saida ("horas-paga-" + (Get-Date -Format "yyyy-MM-dd-HHmm") + ".apk")
Copy-Item "$raiz\android\app\build\outputs\apk\debug\app-debug.apk" $destino
Write-Host ""
Write-Host "APK pronto: $destino" -ForegroundColor Green
Write-Host ("Tamanho: {0:N1} MB" -f ((Get-Item $destino).Length / 1MB))

$aparelhos = & $adb devices | Select-String "\tdevice$"
if ($aparelhos) {
    & $adb install -r $destino
    & $adb shell am start -n br.app.horapagapm/.MainActivity | Out-Null
    Write-Host "Instalado e aberto no aparelho/emulador." -ForegroundColor Green
}
