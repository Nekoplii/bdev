import pc from "picocolors";
import ora, { Ora } from "ora";

export const logger = {
  info(msg: string) {
    console.log(`${pc.cyan("ℹ")} ${msg}`);
  },
  success(msg: string) {
    console.log(`${pc.green("✔")} ${msg}`);
  },
  warn(msg: string) {
    console.log(`${pc.yellow("⚠")} ${msg}`);
  },
  error(msg: string) {
    console.error(`${pc.red("✖")} ${msg}`);
  },
  spinner(text: string): Ora {
    return ora({ text, color: "cyan" }).start();
  },
};
