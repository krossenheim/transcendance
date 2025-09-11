const { containerNames } = require('./container_names.cjs');
const run_bash_command = require('/appservice/run_bash_command.cjs');

const my_ip = run_bash_command("getent hosts | grep -v 'localhost' | awk '{print $1}'");

getOwnName()
{
    for (const cname of containerNames) 
    {
        const container_ip = "getent hosts "+ cname +" | awk '{print $1}'";
        if (my_ip === container_ip)
        {
            return (cname);
        }
    }
}

const this_container_name = getOwnName();

module.export( {this_container_name} );