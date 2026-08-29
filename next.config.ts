import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que os arquivos de prompt sejam empacotados nas funcoes de API
  // que chamam agente() (a leitura e feita com fs em runtime).
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
