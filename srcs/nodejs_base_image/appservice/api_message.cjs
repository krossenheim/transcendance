const { containerNames } = require('/appservice/_container_names.cjs')

class MessageFromService {
    #containerFrom
    #httpStatus
    #payload
    #recipients

	constructor(httpStatus, recipients, containerFrom, payload) 
	{
        this.httpStatus = httpStatus;
		this.recipients = recipients;
		this.containerFrom = containerFrom;
		this.payload = payload; 
	}

    get recipients()
    {
        return this.#recipients;
    }

    set recipients(value)
    {
        if (!Array.isArray(value)) {
            throw new Error("recipients must be an array");
        }
        this.#recipients = value;
    }

    get containerFrom()
    {
        return (this.#containerFrom);
    }

    set containerFrom(value)
    {
        if (typeof value !== "string" || !containerNames.includes(value)) 
            {
                throw new Error("containerFrom (" + value + ") must be one of: " + containerNames.join(", "));
            }
        this.#containerFrom = value;
    }

    get payload()
    {
        return (this.#payload);
    }

    set payload(value)
    {
        this.#payload = value;
    }

    get httpStatus()
    {
        return (this.#httpStatus);
    }

    set httpStatus(value)
    {
        this.#httpStatus = value;
    }
    
}

module.exports = { MessageFromService };