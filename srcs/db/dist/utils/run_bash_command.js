"use strict";
const { execSync } = require("child_process");
function run_bash_command(bash_input) {
    if (typeof bash_input !== "string") {
        throw new Error("Pass a string to execute as a bash command.");
    }
    try {
        const stdout = execSync(bash_input, { encoding: "utf8" });
        return stdout.trim();
    }
    catch (error) {
        console.error("Error:", error.message);
        return null;
    }
}
module.exports = { run_bash_command };
