import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const examplePath = path.join(projectRoot, ".env.example");
const envPath = path.join(projectRoot, ".env");

try {
  await copyFile(examplePath, envPath, constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(".env already exists. It was not changed.");
    console.error("Edit the existing file, then run: npm run doctor");
    process.exitCode = 1;
  } else {
    throw error;
  }
}

if (!process.exitCode) {
  const token = randomBytes(24).toString("hex");
  const template = await readFile(envPath, "utf8");
  await writeFile(
    envPath,
    template.replace(/^ADMIN_TOKEN=.*$/m, `ADMIN_TOKEN=${token}`),
    { encoding: "utf8", flag: "w" },
  );

  console.log("Created .env with a random ADMIN_TOKEN.");
  console.log("Fill in PUBLIC_BASE_URL, phone numbers, Twilio, and OpenAI values.");
  console.log("Then run: npm run doctor");
}
