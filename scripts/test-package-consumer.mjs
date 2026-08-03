import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "sodex-sdk-consumer-"));

try {
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tempRoot], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  );
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a tarball filename");
  const files = new Set(packed[0].files.map((entry) => entry.path));
  if (!files.has("examples/user-flows/deposit.ts")) {
    throw new Error("published package is missing user-flow examples");
  }

  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@sodex/sdk": `file:${join(tempRoot, filename)}`,
          viem: "^2.21.0",
          ws: "^8.18.0",
        },
        devDependencies: {
          "@types/node": "^20.12.0",
          "@types/ws": "^8.5.13",
          tsx: "^4.19.0",
          typescript: "^5.5.4",
        },
      },
      null,
      2,
    ),
  );
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: tempRoot,
    stdio: "inherit",
  });

  const installedExamples = join(tempRoot, "node_modules", "@sodex", "sdk", "examples");
  execFileSync(
    join(tempRoot, "node_modules", ".bin", "tsc"),
    ["--project", join(installedExamples, "user-flows", "tsconfig.json")],
    { cwd: tempRoot, stdio: "inherit" },
  );

  execFileSync(
    join(tempRoot, "node_modules", ".bin", "tsx"),
    [join(installedExamples, "user-flows", "deposit.ts")],
    {
      cwd: tempRoot,
      env: { ...process.env, SODEX_EXAMPLE_DRY_RUN: "1" },
      stdio: "inherit",
    },
  );

  const depositSource = readFileSync(join(installedExamples, "user-flows", "deposit.ts"), "utf8");
  if (!depositSource.includes('from "@sodex/sdk"')) {
    throw new Error("published examples do not import the package as a consumer");
  }
  console.log("Packed @sodex/sdk examples typecheck and run in a clean consumer project.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
