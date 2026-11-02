import { resolveProjectBashOperations } from "./project-command-env";
import {
  createWslBashOperations,
  type WslBashOptions,
  type WslSpawnProcess,
} from "./wsl-process";

// `!cmd` in the composer and the agent's own `bash` tool share these
// operations, so a WSL shell command is the same execution with
// `wsl.exe --cd <linux dir> --exec bash -lc <cmd>` in place of the local
// shell. Output streaming, exit codes, abort and timeouts keep pi's contract;
// only the process being started changes.

export {
  createWslBashOperations,
  resolveProjectBashOperations,
  type WslBashOptions,
  type WslSpawnProcess,
};
