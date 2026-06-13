import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The React Compiler lint rules bundled with eslint-plugin-react-hooks
    // v6 are experimental and aggressively flag patterns that are correct
    // for this app:
    //   - set-state-in-effect: SSR-safe portal mounting
    //     (`useEffect(() => setMounted(true), [])`) and prop→state mirror
    //     sync used by the optimistic lobby UI.
    //   - purity: `Date.now()` read during render for the live-match
    //     countdown timers (client-only components that re-render on a tick).
    //   - refs: reading a ref during render in those same timer paths.
    // None affect runtime correctness, so we surface them as warnings
    // (visible, non-blocking) instead of build-breaking errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
