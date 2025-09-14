const { containerNames } = require('./container_names.cjs');
const { run_bash_command } = require('/appservice/run_bash_command.cjs');

function getOwnContainerName()
{
    const my_ip = run_bash_command("getent hosts | grep -v 'localhost' | awk '{print $1}'");

    for (const cname of containerNames) 
    {
        const container_ip = run_bash_command("getent hosts "+ cname +" | awk '{print $1}'");
        if (my_ip === container_ip)
        {
            return (cname);
        }
    }

    throw new Error("Could not determine container name");
}

const g_myContainerName = getOwnContainerName();

module.exports = { g_myContainerName };

