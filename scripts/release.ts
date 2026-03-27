const version = process.env.npm_package_version ?? '0.1.0';

process.stdout.write(
  [
    `flow-recorder release helper`,
    `version: ${version}`,
    `recommended steps:`,
    `1. pnpm test`,
    `2. pnpm build`,
    `3. review dist artifacts`,
    `4. publish packages or archive extension/demo outputs`
  ].join('\n'),
);
