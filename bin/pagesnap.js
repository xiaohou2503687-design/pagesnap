#!/usr/bin/env node
const { program } = require("commander");
const { audit, compare } = require("../src/index");

program
  .name("pagesnap")
  .description("📸 AI-powered landing page CRO auditor")
  .version("0.1.0");

program
  .command("audit")
  .description("Audit a landing page for CRO issues")
  .argument("<url>", "URL to audit")
  .option("-o, --output <path>", "Save screenshot to path")
  .option("-j, --json", "Output as JSON")
  .option("--no-color", "Disable colors")
  .action(async (url, options) => {
    try {
      const result = await audit(url, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      }
      process.exit(0);
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  });

program
  .command("compare")
  .description("Compare two landing pages")
  .argument("<url1>", "First URL")
  .argument("<url2>", "Second URL")
  .option("--no-color", "Disable colors")
  .action(async (url1, url2, options) => {
    try {
      await compare(url1, url2, options);
      process.exit(0);
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  });

program.parse();