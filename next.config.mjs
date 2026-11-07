/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hostinger: a conta divide um limite de threads entre todos os apps Node, e o servidor tem 48
  // CPUs. Sem isto, o build abre 47 workers (cada um com o compilador nativo e 48 threads); no
  // OfficeParty isso passou de 2.800 threads em 07/11/2026 e derrubou os apps da conta. Com 1
  // worker, o build leva um pouco mais. Mesmo ajuste do Rota dos Viajantes e do OfficeParty.
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
};

export default nextConfig;
