// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TournamentScores {
    address public owner;

    struct Score {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    mapping(uint256 => Score[]) private _tournamentScores;

    event ScoreRecorded(uint256 indexed tournamentId, address indexed player, uint256 score, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function recordScore(uint256 tournamentId, address player, uint256 score) external onlyOwner {
        uint256 ts = block.timestamp;
        _tournamentScores[tournamentId].push(Score({player: player, score: score, timestamp: ts}));
        emit ScoreRecorded(tournamentId, player, score, ts);
    }

    function getScoreCount(uint256 tournamentId) external view returns (uint256) {
        return _tournamentScores[tournamentId].length;
    }

    function getScore(uint256 tournamentId, uint256 index) external view returns (address player, uint256 score, uint256 timestamp) {
        Score storage s = _tournamentScores[tournamentId][index];
        return (s.player, s.score, s.timestamp);
    }

    function getAllScores(uint256 tournamentId) external view returns (Score[] memory) {
        return _tournamentScores[tournamentId];
    }
}
