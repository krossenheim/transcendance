const { containerNames } = require('/appservice/_container_names.cjs')

class ApiMessage {
	constructor(status, containerFrom) 
	{
		this.status = status;
		this.containerFrom = containerFrom;
		this.messages = new FixedSizeList(20);
	}

    get status()
    {
        return (this._status);
    }

    set status(value)
    {
        if (typeof value !== "string" || !allowedStatusValues.includes(value)) 
            {
                throw new Error("Status must be one of: " + allowedStatusValues.join(", "));
            }
        this._status = value;
    }

    get containerFrom()
    {
        return (this._status);
    }

    set containerFrom(value)
    {
        if (typeof value !== "string" || !containerNames.includes(value)) 
            {
                throw new Error("Status must be one of: " + allowedStatusValues.join(", "));
            }
        this._containerFrom = value;
    }
    
}