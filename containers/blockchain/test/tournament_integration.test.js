import { expect } from "chai";
import hre from "hardhat";
import http from "http";

describe("TournamentScores Integration Test", function () {
  let ethers;

  before(async function () {
    ({ ethers } = await hre.network.connect());
  });

  it("deploys contract, exposes a backend endpoint and records a score via that endpoint", async function () {
    const TournamentScores = await ethers.getContractFactory("TournamentScores");
    const ts = await TournamentScores.deploy();
    if (typeof ts.waitForDeployment === 'function') {
      await ts.waitForDeployment();
    }

    const server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/record_score') {
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const payload = JSON.parse(body);
          const tx = await ts.recordScore(payload.tournamentId, payload.playerAddress, payload.score);
          await tx.wait();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, txHash: tx.hash }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
        }
      } else {
        res.writeHead(404).end();
      }
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const tournamentId = 42;
    const winnerAddress = '0x0000000000000000000000000000000000000007';
    const winnerScore = 9;

    const resp = await fetch(`http://127.0.0.1:${port}/record_score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, playerAddress: winnerAddress, score: winnerScore })
    });

    const json = await resp.json();
    expect(resp.status).to.equal(200);
    expect(json.ok).to.equal(true);
    expect(json.txHash).to.be.a('string');

    const receipt = await ethers.provider.getTransactionReceipt(json.txHash);
    let found = null;
    for (const log of receipt.logs) {
      try {
        const parsed = ts.interface.parseLog(log);
        if (parsed && parsed.name === 'ScoreRecorded') {
          found = parsed;
          break;
        }
      } catch (e) {
      }
    }
    const ev = found;
    expect(ev, 'ScoreRecorded event should be present').to.not.be.undefined;
    expect(Number(ev.args[0])).to.equal(tournamentId);
    expect(ev.args[1]).to.equal(winnerAddress);
    expect(Number(ev.args[2])).to.equal(winnerScore);

    const count = await ts.getScoreCount(tournamentId);
    expect(Number(count)).to.equal(1);

    const scoreEntry = await ts.getScore(tournamentId, 0);
    expect(scoreEntry[0]).to.equal(winnerAddress);
    expect(Number(scoreEntry[1])).to.equal(winnerScore);

    server.close();
  });
});
