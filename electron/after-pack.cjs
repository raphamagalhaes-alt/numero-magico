/**
 * Assinatura ad-hoc gratuita no macOS (sem certificado pago da Apple), aplicada ANTES de gerar
 * o .dmg/.zip. Necessária para rodar em Macs com Apple Silicon. Em outros sistemas não faz nada.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
