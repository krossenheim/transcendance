import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { FriendType } from "@app/shared/api/service/db/user";

function normalizeUserRelationships(relationships: FriendType[]): Map<number, FriendType> {
    return new Map(relationships.map(rel => [rel.friendId, rel]));
}

function addToSet<T>(set: Set<T>, items: T[]): Set<T> {
    const newSet = new Set(set);
    items.forEach(item => newSet.add(item));
    return newSet;
}

function removeFromSet<T>(set: Set<T>, items: T[]): Set<T> {
    const newSet = new Set(set);
    items.forEach(item => newSet.delete(item));
    return newSet;
}

function getFriendListFromRelationships(relationships: FriendType[]): Set<number> {
    const friendSet = new Set<number>();
    relationships.forEach(rel => {
        if (rel.status === UserFriendshipStatusEnum.Accepted)
            friendSet.add(rel.friendId);
    });
    return friendSet;
}

function getBlockedListFromRelationships(relationships: FriendType[]): Set<number> {
    const blockedSet = new Set<number>();
    relationships.forEach(rel => {
        if (rel.status === UserFriendshipStatusEnum.Blocked)
            blockedSet.add(rel.friendId);
    });
    return blockedSet;
}

export {
    normalizeUserRelationships,
    addToSet,
    removeFromSet,
    getFriendListFromRelationships,
    getBlockedListFromRelationships
};