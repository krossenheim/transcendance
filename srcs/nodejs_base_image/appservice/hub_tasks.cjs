
const container_names = require("/appservice/container_names.cjs");
const { httpStatus } = require("/appservice/httpStatusEnum.cjs");
const { MessageFromService } = require("/appservice/api_message.cjs");

const servicesSubscribedToUsers = new Map();
// servicesSubscribedToUsers[container name here] = user ids to notify of online status changes
for (const key of Object.keys(container_names.containersNameToIp)) {
  servicesSubscribedToUsers[key] = 0;
  // 0 For no one, 1 for everyone, list for specific users
}

async function subscribe_online_status_handler(subscriptionRequestBody) {
  if (subscriptionRequestBody.subscribe === undefined) {
    console.error(
      "No subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "subscribe_online_status",
      {
        error: "No subscription request",
      }
    );
  }

  if (Array.isArray(subscriptionRequestBody.subscribe)) {
    let bool_was_modified = false;
    const current_val = servicesSubscribedToUsers[subscriptionRequestBody.containerFrom];
    if (current_val === 1)
      return new MessageFromService(
        httpStatus.OK,
        null,
        "subscribe_online_status",
        {
          message: "Already subscribed to all users",
        }
      );
    if (!Array.isArray(current_val))
      servicesSubscribedToUsers[subscriptionRequestBody.containerFrom] = [];

    if (subscriptionRequestBody.replace) {
      servicesSubscribedToUsers[subscriptionRequestBody.containerFrom] =
        subscriptionRequestBody.subscribe;
    } else {
      for (const user_id of subscriptionRequestBody.subscribe) {
        if (
          servicesSubscribedToUsers[subscriptionRequestBody.containerFrom].includes(user_id)
        )
          continue;
        servicesSubscribedToUsers[subscriptionRequestBody.containerFrom].push(user_id);
        bool_was_modified = true;
      }
    }
    const httpStatusToReturn = bool_was_modified
      ? httpStatus.OK
      : httpStatus.ALREADY_REPORTED;
    const message = bool_was_modified
      ? "Subscribed to specific users"
      : "No new users were added to subscription list";
    console.log(
      "servicesSubscribedToUsers for " +
        subscriptionRequestBody.containerFrom +
        " now: " +
        servicesSubscribedToUsers[subscriptionRequestBody.containerFrom]
    );
    return new MessageFromService(
      httpStatusToReturn,
      null,
      "subscribe_online_status",
      {
        message,
      }
    );
  } else if (subscriptionRequestBody.subscribe === "ALL") {
    servicesSubscribedToUsers[subscriptionRequestBody.containerFrom] = 1;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "subscribe_online_status",
      {
        message: "Subscribed to all users",
      }
    );
  } else if (subscriptionRequestBody.subscribe === "NONE") {
    servicesSubscribedToUsers[subscriptionRequestBody.containerFrom] = 0;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "subscribe_online_status",
      {
        message: "Unsubscribed from all users",
      }
    );
  } else {
    console.error(
      "Invalid subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "subscribe_online_status",
      {
        error: "Invalid subscription request",
      }
    );
  }
}

async function unsubscribe_online_status_handler(subscriptionRequestBody) {
  if (subscriptionRequestBody.subscribe === undefined) {
    console.error(
      "No subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "unsubscribe_online_status",
      {
        error: "No subscription request",
      }
    );
  }

  if (Array.isArray(subscriptionRequestBody.subscribe)) {
    if (!Array.isArray(servicesSubscribedToUsers[subscriptionRequestBody.containerFrom]))
      return new MessageFromService(
        httpStatus.BAD_REQUEST,
        null,
        "unsubscribe_online_status",
        {
          error: "No specific users subscribed",
        }
      );

    for (const user_id of subscriptionRequestBody.subscribe) {
      const index =
        servicesSubscribedToUsers[subscriptionRequestBody.containerFrom].indexOf(user_id);
      if (index < 0)
        return new MessageFromService(
          httpStatus.BAD_REQUEST,
          null,
          "unsubscribe_online_status",
          {
            error:
              "User id " +
              user_id +
              " not found in subscription list of " +
              subscriptionRequestBody.containerFrom,
          }
        );
      servicesSubscribedToUsers[subscriptionRequestBody.containerFrom].splice(index, 1);
    }

    return new MessageFromService(
      httpStatus.OK,
      null,
      "unsubscribe_online_status",
      {
        message: "Unsubscribed from specific users",
      }
    );
  } else if (subscriptionRequestBody.subscribe === "ALL") {
    servicesSubscribedToUsers[subscriptionRequestBody.containerFrom] = 0;
    return new MessageFromService(
      httpStatus.OK,
      null,
      "unsubscribe_online_status",
      {
        message: "Unsubscribed from all users",
      }
    );
  } else {
    console.error(
      "Invalid subscription request in subscriptionRequestBody from " +
        subscriptionRequestBody.containerFrom
    );
    return new MessageFromService(
      httpStatus.BAD_REQUEST,
      null,
      "unsubscribe_online_status",
      {
        error: "Invalid subscription request",
      }
    );
  }
}

const tasksForHub = {
  SUBSCRIBE_ONLINE_STATUS: {
    url: "/inter_api/subscribe_online_status",
    handler: subscribe_online_status_handler,
    method: "POST",
  },
  UNSUBSCRIBE_ONLINE_STATUS: {
    url: "/inter_api/unsubscribe_online_status",
    handler: unsubscribe_online_status_handler,
    method: "POST",
  },
};

async function getHubTaskOutput(messageFromService) {
  Object.setPrototypeOf(messageFromService, MessageFromService);
  for (const [task_name, task] of tasksForHub) {
    if (messageFromService.endpoint !== task.url) continue;

    console.log(
      "Running task '" + task_name + "', " + messageFromService.toString()
    );
    const result = await task.handler(messageFromService);
    if (!result) {
      console.error(
        "Result for url/endpoint handler returned falsy value:'" + result + "'"
      );
    }
    return result;
  }
}

module.exports = { tasksForHub , servicesSubscribedToUsers, getHubTaskOutput};