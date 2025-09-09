const { containerNames } = require('/appservice/_container_names.cjs')

const allowedStatusValues = ["Success", "Error"];

const allowedDestination = ["Internal-Container", "External-Client"];

class ApiMessage {
    #status
    #destination
    #containerFrom
	constructor(status, containerFrom, destination, payload) 
	{
		this.status = status;
		this.containerFrom = containerFrom;
        this.destination = destination;
		this.payload = payload;
	}


    get destination()
    {
        return (this.#destination);
    }

    set destination(value)
    {
        if (typeof value !== "string" || !allowedDestination.includes(value)) 
            {
                throw new Error("Destination must be one of: " + allowedDestination.join(", "));
            }
        this.#destination = value;
    }

    get status()
    {
        return (this.#status);
    }

    set status(value)
    {
        if (typeof value !== "string" || !allowedStatusValues.includes(value)) 
            {
                throw new Error("Status must be one of: " + allowedStatusValues.join(", "));
            }
        this.#status = value;
    }

    get containerFrom()
    {
        return (this.#containerFrom);
    }

    set containerFrom(value)
    {
        if (typeof value !== "string" || !containerNames.includes(value)) 
            {
                throw new Error("containerFrom must be one of: " + containerNames.join(", "));
            }
        this.#containerFrom = value;
    }
    
}