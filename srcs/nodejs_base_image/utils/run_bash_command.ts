import {execSync} from 'child_process';

function run_bash_command(bash_input : string) :string {
    if (typeof bash_input !== "string") {
        throw new Error("Pass a string to execute as a bash command.");
    }

    try {
        const stdout = execSync(bash_input, { encoding: "utf8" });
        return stdout.trim();
    } catch (err : any) {
        console.error("Error:", err.message);
        return 'error';
    }
}

export default run_bash_command;
