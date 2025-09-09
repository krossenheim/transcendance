const { containerNames } = require('/appservice/_container_names.cjs')

const allowedStatusValues = ["Success", "Error"];

const allowedDestinationTypes = ["Internal-Container", "External-Client"];

class ApiMessage {
    #status
    #destinationType
    #destinationName
    #containerFrom

    toString()
    {
        return `Api Message:
        status: ${this.status}
        destinationType: ${this.destinationType}
        destinationName: ${this.destinationName}
        containerFrom: ${this.containerFrom}
        payload: ${JSON.stringify(this.payload, null, 2)}`;
    }
    
	constructor(status, containerFrom, destinationType, destinationName, payload) 
	{
		this.status = status;
		this.containerFrom = containerFrom;
        this.destinationType = destinationType;
        this.destinationName = destinationName;
		this.payload = payload;
	}


    get destinationName()
    {
        return (this.#destinationName);
    }

    set destinationName(value)
    {
        if (typeof value !== "string") 
        {
            throw new Error("Value for destination name must be string");
        }
        if (this.#destinationType == "Internal-Container" && !containerNames.includes(value))
        {
            throw new Error("Destination type is container and must be one of: " + containerNames.join(", "));
        }
        // Might be a valid client name.
        this.#destinationName = value;
    }

    get destinationType()
    {
        return (this.#destinationType);
    }

    set destinationType(value)
    {
        if (typeof value !== "string" || !allowedDestinationTypes.includes(value)) 
            {
                throw new Error("Destination must be one of: " + allowedDestinationTypes.join(", "));
            }
        this.#destinationType = value;
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

module.exports = { ApiMessage };