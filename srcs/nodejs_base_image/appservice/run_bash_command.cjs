const { exec } = require("child_process");

run_bash_command(bash_input)
{
	if (typeof(bash_input) != 'string')
		throw new Error("Pass a string to execute as a bash command.")
		exec(bash_input, (error, stdout, stderr) => {
			if (error) {
				console.error("Error:", error.message);
				return;
			}
			if (stderr) {
				console.error("Stderr:", stderr);
				return;
			}
			const result = stdout.trim();
			return (result);
		});
}

module.exports( {run_bash_command} );