import { defineConfig } from 'vitest/config';

// Três "andares" de teste (Etapa 8), cada um com um projeto do Vitest:
// - unit: domínio, casos de uso e canais — sem banco, sem HTTP, sem relógio real;
// - integration: adaptadores (Prisma, HTTP com supertest, Nodemailer, CLI);
// - contract: a rede de segurança caixa-preta da Etapa 1 (sobe o servidor real).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['./test/integration/globalSetup.ts'],
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'contract',
          include: ['test/contract/**/*.test.ts'],
          globalSetup: ['./test/contract/globalSetup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/cli.ts'],
    },
  },
});
