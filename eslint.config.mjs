import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// Regras do next/core-web-vitals (o `next lint` saiu no Next 16).
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  { extends: [...nextCoreWebVitals] },
  {
    // Regras do React Compiler que chegaram com o eslint-config-next 16 (26 ocorrências no
    // upgrade). Ficam como aviso para o upgrade não mudar comportamento; corrigir aos poucos.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
