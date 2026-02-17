-- name: setUserRoomAccessType
INSERT INTO
	users_room_relationships (roomId, userId, userState)
VALUES
	(?, ?, ?) ON CONFLICT (roomId, userId) DO
UPDATE
SET
	userState = excluded.userState;

-- name: removeUserFromRoom
DELETE FROM
	users_room_relationships
WHERE
	roomId = ?
	AND userId = ?;

-- name: createNewRoom
INSERT INTO
	chat_rooms (roomType, roomName)
VALUES
	(?, ?);

-- name: getRawRoomInfo
SELECT
	roomId,
	roomType,
	roomName
FROM
	chat_rooms
WHERE
	roomId = ?;

-- name: getRoomMessages
SELECT
	messageId,
	roomId,
	messageString,
	messageDate,
	userId
FROM
	chat_messages
WHERE
	roomId = ?
ORDER BY
	messageDate DESC
LIMIT
	?;

-- name: getRoomUserConnections
SELECT
	userId,
	userState
FROM
	users_room_relationships
WHERE
	roomId = ?;

-- name: getUserRooms
SELECT
	r.roomId,
	r.roomType,
	r.roomName
FROM
	chat_rooms r
	JOIN users_room_relationships rc ON r.roomId = rc.roomId
WHERE
	rc.userId = ?
	AND rc.userState = ?;

-- name: fetchDMRoom
SELECT
	roomId
FROM
	dm_chat_rooms_mapping
WHERE
	(
		userOneId = ?
		AND userTwoId = ?
	);

-- name: sendMessageToRoom
INSERT INTO
	chat_messages (roomId, userId, messageString, messageDate)
VALUES
	(?, ?, ?, strftime('%s', 'now'));
