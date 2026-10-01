# Deployments

`script/Deploy.s.sol` writes one `<chainid>.json` here per deployment: every contract address,
the deployer, and the block the stack was deployed at (the indexer starts from it).

- `10143.json` — Monad testnet. Committed, so the app, the indexer and the scheduled publisher
  all read the same addresses. `scripts/deploy.sh` regenerates the files that depend on it.
- `31337.json` — a local anvil rehearsal. Ignored by git.
